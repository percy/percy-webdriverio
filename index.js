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

// Processes a single cross-origin iframe element to capture its snapshot
async function processFrame(b, iframeElement, iframeMeta, options, percyDOMScript, log) {
  try {
    log.debug(`Processing cross-origin iframe: ${iframeMeta.src}`);

    // Switch to the iframe using element reference (WebdriverIO v9 switchFrame)
    await b.switchFrame(iframeElement);

    // Inject PercyDOM into the frame
    await b.execute(percyDOMScript);
    log.debug(`Injected PercyDOM into frame: ${iframeMeta.src}`);

    // Serialize the frame's DOM with enableJavaScript: true
    /* istanbul ignore next: no instrumenting injected code */
    let iframeSnapshot = await b.execute(function(opts) {
      return PercyDOM.serialize(opts);
    }, { ...options, enableJavaScript: true });

    if (!iframeSnapshot) {
      log.debug(`Serialization returned empty result for frame: ${iframeMeta.src}`);
      return null;
    }

    log.debug(`Successfully captured cross-origin iframe: ${iframeMeta.src} (percyElementId: ${iframeMeta.percyElementId})`);

    return {
      frameUrl: iframeMeta.src,
      iframeData: { percyElementId: iframeMeta.percyElementId },
      iframeSnapshot
    };
  } catch (error) {
    log.debug(`Failed to process cross-origin iframe ${iframeMeta.src}: ${error.message}`);
    return null;
  } finally {
    // Always restore context to the top-level page
    try {
      await b.switchFrame(null);
    } catch (e) {
      log.debug(`Failed to switch back to parent frame: ${e.message}`);
    }
  }
}

// Captures the main page DOM and cross-origin iframe snapshots
async function captureSerializedDOM(b, options, percyDOMScript, log) {
  // Serialize the main page DOM
  /* istanbul ignore next: no instrumenting injected code */
  let { domSnapshot, url } = await b.execute(async (options) => ({
    domSnapshot: await PercyDOM.serialize(options),
    url: document.URL
  }), options);

  // Process cross-origin iframes
  try {
    // Use WebdriverIO's native $$ to get iframe element references
    let iframeElements = await b.$$('iframe');

    if (iframeElements && iframeElements.length) {
      log.debug(`Found ${iframeElements.length} total iframe(s) on page`);

      let pageOrigin = getOrigin(url);
      let corsIframes = [];

      for (let iframeElement of iframeElements) {
        // Get iframe metadata using element attribute methods
        let src = await iframeElement.getAttribute('src') || '';
        let srcdoc = await iframeElement.getAttribute('srcdoc');
        let percyElementId = await iframeElement.getAttribute('data-percy-element-id');

        if (!src || isUnsupportedIframeSrc(src)) {
          if (src) log.debug(`Skipping unsupported iframe src: ${src}`);
          continue;
        }
        if (srcdoc) {
          log.debug(`Skipping srcdoc iframe: ${src}`);
          continue;
        }

        let frameOrigin = getOrigin(src);
        if (!frameOrigin) {
          log.debug(`Skipping iframe with invalid URL: ${src}`);
          continue;
        }
        if (frameOrigin === pageOrigin) {
          log.debug(`Skipping same-origin iframe: ${src}`);
          continue;
        }

        if (!percyElementId) {
          log.debug(`Skipping cross-origin iframe without data-percy-element-id: ${src}`);
          continue;
        }

        let iframeMeta = { src, percyElementId };
        let result = await processFrame(b, iframeElement, iframeMeta, options, percyDOMScript, log);
        if (result) corsIframes.push(result);
      }

      if (corsIframes.length > 0) {
        domSnapshot.corsIframes = corsIframes;
        log.debug(`Captured ${corsIframes.length} cross-origin iframe(s)`);
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
