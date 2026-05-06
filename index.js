const utils = require('@percy/sdk-utils');
const {
  resolveMaxFrameDepth,
  resolveIgnoreSelectors,
  isUnsupportedIframeSrc
} = require('./iframe-utils');

// Collect client and environment information
const sdkPkg = require('./package.json');

let webdriverioPkg = null;
try {
  webdriverioPkg = require('webdriverio/package.json');
} catch {
  try {
    // this handles webdriverio 9
    const path = require('path');
    const webdriverioDir = path.dirname(require.resolve('webdriverio'));

    webdriverioPkg = require(`${webdriverioDir}/../package.json`);
  } catch {
    // next is only fallback if everything else fails just to make sure that version info
    // is not the reason why we break
    /* istanbul ignore next */
    webdriverioPkg = {
      name: 'unknown-webdriverio',
      version: 'unknown'
    };
  }
}

const CLIENT_INFO = `${sdkPkg.name}/${sdkPkg.version}`;
const ENV_INFO = `${webdriverioPkg.name}/${webdriverioPkg.version}`;

function getOrigin(url) {
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}

async function getIframeMeta(iframeElement, ignoreSelectors = []) {
  let src = (await iframeElement.getAttribute('src')) || '';
  let srcdoc = await iframeElement.getAttribute('srcdoc');
  let percyElementId = await iframeElement.getAttribute('data-percy-element-id');
  let dataPercyIgnore = (await iframeElement.getAttribute('data-percy-ignore')) !== null;
  let matchesIgnoreSelector = false;
  if (ignoreSelectors.length) {
    // Run a one-shot script in the browser that asks the element whether it
    // matches any of the configured ignore selectors. The webdriverio
    // element handle exposes elementId; we pass that to a client-side helper
    // that resolves it back to the live element via WebDriver's element ref
    // protocol — using `iframeElement.execute` keeps us within wdio's API.
    try {
      matchesIgnoreSelector = await iframeElement.execute(function(selectors) {
        for (let i = 0; i < selectors.length; i++) {
          try { if (this.matches(selectors[i])) return true; } catch (e) { /* invalid selector */ }
        }
        return false;
      }, ignoreSelectors);
    } catch (e) {
      // Older wdio versions or non-Bidi sessions may not support element-context
      // execute; fall back to false (match the behavior of unsupported drivers).
      matchesIgnoreSelector = false;
    }
  }
  return { src, srcdoc, percyElementId, dataPercyIgnore, matchesIgnoreSelector };
}

function shouldSkipIframe(meta, currentOrigin, log) {
  if (meta.dataPercyIgnore) {
    log.debug(`Skipping iframe marked with data-percy-ignore: ${meta.src || '(no src)'}`);
    return true;
  }
  if (meta.matchesIgnoreSelector) {
    log.debug(`Skipping iframe matching ignoreIframeSelectors: ${meta.src || '(no src)'}`);
    return true;
  }
  if (!meta.src || isUnsupportedIframeSrc(meta.src)) {
    if (meta.src) log.debug(`Skipping unsupported iframe src: ${meta.src}`);
    return true;
  }
  if (meta.srcdoc) {
    log.debug(`Skipping srcdoc iframe: ${meta.src}`);
    return true;
  }
  let frameOrigin = getOrigin(meta.src);
  if (!frameOrigin) {
    log.debug(`Skipping iframe with invalid URL: ${meta.src}`);
    return true;
  }
  if (frameOrigin === currentOrigin) {
    log.debug(`Skipping same-origin iframe: ${meta.src}`);
    return true;
  }
  if (!meta.percyElementId) {
    log.debug(`Skipping cross-origin iframe without data-percy-element-id: ${meta.src}`);
    return true;
  }
  return false;
}

// Switches up one frame in the WebDriver context. WebdriverIO doesn't surface
// switchToParentFrame on the high-level Browser object in every version. When
// it's missing or fails, we can't reliably step up one level — falling back to
// switchFrame(null) jumps to the top, which would corrupt sibling iteration in
// outer recursion levels. Returns true on a successful one-step parent switch
// and false otherwise; callers must abort sibling iteration when this returns
// false to avoid resolving subsequent iframe lookups against the wrong context.
async function switchToParent(b, log) {
  try {
    if (typeof b.switchToParentFrame === 'function') {
      await b.switchToParentFrame();
      return true;
    }
  } catch (e) {
    log.debug(`switchToParentFrame failed: ${e.message}; falling back to top`);
  }
  try {
    await b.switchFrame(null);
  } catch (e) {
    log.debug(`Failed to switch back to top frame: ${e.message}`);
  }
  return false;
}

async function processFrameTree(b, iframeElement, iframeMeta, depth, ancestorUrls, ctx) {
  const { maxFrameDepth, ignoreSelectors, options, percyDOMScript, log } = ctx;
  if (depth > maxFrameDepth) {
    log.debug(`Reached max iframe nesting depth (${maxFrameDepth}); stopping at ${iframeMeta.src}`);
    return [];
  }
  if (ancestorUrls && ancestorUrls.has(iframeMeta.src)) {
    log.debug(`Skipping cyclic iframe (${iframeMeta.src} appears in ancestor chain)`);
    return [];
  }

  const collected = [];
  let switchedIn = false;
  let capturedError = null;
  try {
    log.debug(`Processing cross-origin iframe (depth ${depth}): ${iframeMeta.src}`);

    await b.switchFrame(iframeElement);
    switchedIn = true;

    await b.execute(percyDOMScript);

    /* istanbul ignore next: no instrumenting injected code */
    let frameUrl = await b.execute(function() { return document.URL; });

    // Post-switch filter: failed cross-origin navigations land on
    // about:blank / about:neterror in the iframe's document context. The
    // pre-switch shouldSkipIframe check on iframeMeta.src can't see this —
    // the attribute still holds the original https:// URL. Drop these so
    // we don't ship browser error pages as "captured" content.
    if (frameUrl && isUnsupportedIframeSrc(frameUrl)) {
      log.debug(`Skipping iframe whose document loaded an unsupported URL: ${frameUrl}`);
      return [];
    }

    /* istanbul ignore next: no instrumenting injected code */
    let iframeSnapshot = await b.execute(function(opts) {
      return PercyDOM.serialize(opts);
    }, { ...options, enableJavaScript: true });

    if (!iframeSnapshot) {
      log.debug(`Serialization returned empty result for frame: ${iframeMeta.src}`);
      return [];
    }

    collected.push({
      frameUrl: frameUrl || iframeMeta.src,
      iframeData: { percyElementId: iframeMeta.percyElementId },
      iframeSnapshot
    });

    log.debug(`Captured cross-origin iframe (depth ${depth}): ${frameUrl || iframeMeta.src}`);

    if (depth < maxFrameDepth) {
      let currentOrigin = getOrigin(frameUrl || iframeMeta.src);
      let nextAncestors = new Set(ancestorUrls || []);
      nextAncestors.add(iframeMeta.src);
      if (frameUrl) nextAncestors.add(frameUrl);
      let childElements = await b.$$('iframe');
      for (let child of childElements) {
        let childMeta;
        try {
          childMeta = await getIframeMeta(child, ignoreSelectors);
        } catch (e) {
          log.debug(`Could not read child iframe attributes: ${e.message}`);
          continue;
        }
        if (shouldSkipIframe(childMeta, currentOrigin, log)) continue;
        let nested = await processFrameTree(b, child, childMeta, depth + 1, nextAncestors, ctx);
        if (nested.length) collected.push(...nested);
      }
    }

    return collected;
  } catch (error) {
    if (error && error.percyContextLost) {
      if (Array.isArray(error.partialCapture) && error.partialCapture.length) {
        collected.push(...error.partialCapture);
      }
      error.partialCapture = collected;
      throw error;
    }
    log.debug(`Failed to process cross-origin iframe ${iframeMeta.src}: ${error.message}`);
    capturedError = error;
    return collected;
  } finally {
    if (switchedIn) {
      const ok = await switchToParent(b, log);
      if (!ok && depth > 1) {
        // We were inside a nested frame and couldn't reliably step up one
        // level. Falling back to top would leave the outer loop iterating
        // child element handles in the wrong context — abort to avoid wrong
        // percyElementId resolutions.
        const err = new Error(`Lost parent frame context for ${iframeMeta.src}`);
        err.percyContextLost = true;
        err.partialCapture = collected;
        if (capturedError) err.cause = capturedError;
        // eslint-disable-next-line no-unsafe-finally
        throw err;
      }
    }
  }
}

// Captures the main page DOM and cross-origin iframe snapshots (including
// nested cross-origin iframes up to MAX_FRAME_DEPTH).
async function captureSerializedDOM(b, options, percyDOMScript, log) {
  // Serialize the main page DOM
  /* istanbul ignore next: no instrumenting injected code */
  let { domSnapshot, url } = await b.execute(async (options) => ({
    domSnapshot: await PercyDOM.serialize(options),
    url: document.URL
  }), options);

  try {
    const ignoreSelectors = resolveIgnoreSelectors(options);
    const ctx = {
      maxFrameDepth: resolveMaxFrameDepth(options),
      ignoreSelectors,
      options,
      percyDOMScript,
      log
    };
    let iframeElements = await b.$$('iframe');

    if (iframeElements && iframeElements.length) {
      log.debug(`Found ${iframeElements.length} top-level iframe(s)`);

      let pageOrigin = getOrigin(url);
      let corsIframes = [];

      for (let iframeElement of iframeElements) {
        let meta;
        try {
          meta = await getIframeMeta(iframeElement, ignoreSelectors);
        } catch (e) {
          log.debug(`Could not read top-level iframe attributes: ${e.message}`);
          continue;
        }
        if (shouldSkipIframe(meta, pageOrigin, log)) continue;
        let entries;
        try {
          entries = await processFrameTree(b, iframeElement, meta, 1, new Set([url]), ctx);
        } catch (error) {
          if (error && error.percyContextLost) {
            log.debug('Aborting further nested CORS capture due to lost frame context');
            if (Array.isArray(error.partialCapture) && error.partialCapture.length) {
              corsIframes.push(...error.partialCapture);
            }
            break;
          }
          throw error;
        }
        if (entries && entries.length) corsIframes.push(...entries);
      }

      if (corsIframes.length > 0) {
        domSnapshot.corsIframes = corsIframes;
        log.debug(`Captured ${corsIframes.length} cross-origin iframe(s) (across all depths)`);
      }
    }
  } catch (error) {
    log.debug(`Error capturing CORS iframes: ${error.message}`);
  }

  return { domSnapshot, url };
}

// Take a DOM snapshot and post it to the snapshot endpoint
module.exports = function percySnapshot(b, name, options) {
  // allow working with or without standalone mode
  if (!b || typeof b === 'string') [b, name, options] = [browser, b, name];
  if (!b) throw new Error('The WebdriverIO `browser` object is required.');
  if (!name) throw new Error('The `name` argument is required.');

  return b.call(async () => {
    if (!(await module.exports.isPercyEnabled())) return;
    let log = utils.logger('webdriverio');
    if (utils.percy?.type === 'automate') {
      throw new Error('You are using Percy on Automate session with WebdriverIO. For using WebdriverIO correctly, please use https://github.com/percy/percy-selenium-js/ or https://github.com/percy/percy-appium-js/');
    }

    try {
      // Inject the DOM serialization script
      let percyDOMScript = await utils.fetchPercyDOM();
      await b.execute(percyDOMScript);

      // Serialize and capture the DOM (including cross-origin iframes)
      let { domSnapshot, url } = await captureSerializedDOM(b, options || {}, percyDOMScript, log);

      // Post the DOM to the snapshot endpoint with snapshot options and other info
      const response = await module.exports.request({
        ...options,
        environmentInfo: ENV_INFO,
        clientInfo: CLIENT_INFO,
        domSnapshot,
        name,
        url
      });
      return response?.body?.data;
    } catch (error) {
      // Handle errors
      log.error(`Could not take DOM snapshot "${name}"`);
      log.error(error);
    }
  });
};

// To mock the test case
module.exports.request = async function request(data) {
  return await utils.postSnapshot(data);
};

// jasmine cannot mock individual functions, hence adding isPercyEnabled to the exports object
// also need to define this at the end of the file or else default exports will over-ride this
module.exports.isPercyEnabled = async function isPercyEnabled() {
  return await utils.isPercyEnabled();
};

// Export helpers for testing
module.exports.isUnsupportedIframeSrc = isUnsupportedIframeSrc;
module.exports.getOrigin = getOrigin;
module.exports.shouldSkipIframe = shouldSkipIframe;
module.exports.switchToParent = switchToParent;
