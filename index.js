const utils = require('@percy/sdk-utils');

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

const UNSUPPORTED_IFRAME_SRCS = [
  'about:blank',
  'about:srcdoc',
  'javascript:',
  'data:',
  'blob:',
  'vbscript:',
  'chrome:',
  'chrome-extension:'
];

const MAX_FRAME_DEPTH = 10;

function isUnsupportedIframeSrc(src) {
  if (!src) return true;
  return UNSUPPORTED_IFRAME_SRCS.some(prefix => src === prefix || src.startsWith(prefix));
}

function getOrigin(url) {
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}

async function getIframeMeta(iframeElement) {
  let src = (await iframeElement.getAttribute('src')) || '';
  let srcdoc = await iframeElement.getAttribute('srcdoc');
  let percyElementId = await iframeElement.getAttribute('data-percy-element-id');
  return { src, srcdoc, percyElementId };
}

function shouldSkipIframe(meta, currentOrigin, log) {
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
// switchToParentFrame on the high-level Browser object in every version, so we
// fall back to switching to the top frame if the parent-frame command isn't
// available — this still leaves the browser in a known good state.
async function switchToParent(b, log) {
  try {
    if (typeof b.switchToParentFrame === 'function') {
      await b.switchToParentFrame();
      return;
    }
  } catch (e) {
    log.debug(`switchToParentFrame failed: ${e.message}; falling back to top`);
  }
  try {
    await b.switchFrame(null);
  } catch (e) {
    log.debug(`Failed to switch back to top frame: ${e.message}`);
  }
}

async function processFrameTree(b, iframeElement, iframeMeta, depth, options, percyDOMScript, log) {
  if (depth > MAX_FRAME_DEPTH) {
    log.debug(`Reached max iframe nesting depth (${MAX_FRAME_DEPTH}); stopping at ${iframeMeta.src}`);
    return [];
  }

  const collected = [];
  let switchedIn = false;
  try {
    log.debug(`Processing cross-origin iframe (depth ${depth}): ${iframeMeta.src}`);

    await b.switchFrame(iframeElement);
    switchedIn = true;

    await b.execute(percyDOMScript);

    /* istanbul ignore next: no instrumenting injected code */
    let frameUrl = await b.execute(function() { return document.URL; });
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

    if (depth < MAX_FRAME_DEPTH) {
      let currentOrigin = getOrigin(frameUrl || iframeMeta.src);
      let childElements = await b.$$('iframe');
      for (let child of childElements) {
        let childMeta;
        try {
          childMeta = await getIframeMeta(child);
        } catch (e) {
          log.debug(`Could not read child iframe attributes: ${e.message}`);
          continue;
        }
        if (shouldSkipIframe(childMeta, currentOrigin, log)) continue;
        let nested = await processFrameTree(b, child, childMeta, depth + 1, options, percyDOMScript, log);
        if (nested.length) collected.push(...nested);
      }
    }

    return collected;
  } catch (error) {
    log.debug(`Failed to process cross-origin iframe ${iframeMeta.src}: ${error.message}`);
    return collected;
  } finally {
    if (switchedIn) await switchToParent(b, log);
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
    let iframeElements = await b.$$('iframe');

    if (iframeElements && iframeElements.length) {
      log.debug(`Found ${iframeElements.length} top-level iframe(s)`);

      let pageOrigin = getOrigin(url);
      let corsIframes = [];

      for (let iframeElement of iframeElements) {
        let meta;
        try {
          meta = await getIframeMeta(iframeElement);
        } catch (e) {
          log.debug(`Could not read top-level iframe attributes: ${e.message}`);
          continue;
        }
        if (shouldSkipIframe(meta, pageOrigin, log)) continue;
        let entries = await processFrameTree(b, iframeElement, meta, 1, options, percyDOMScript, log);
        if (entries.length) corsIframes.push(...entries);
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
