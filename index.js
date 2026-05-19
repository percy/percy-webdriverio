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

// In-browser readiness invoker. Defined at module scope so the typeof
// guard branches are unit-testable in Node against a stubbed `PercyDOM`
// global — that's how we cover the body without `istanbul ignore`. Uses
// the executeAsync callback convention: the trailing `done` argument is
// invoked once with the diagnostics (or no args on fallthrough). The
// outer try/catch is defensive against any synchronous throw inside
// PercyDOM.waitForReady.
function browserWaitForReady(cfg, done) {
  try {
    /* eslint-disable-next-line no-undef */
    if (typeof PercyDOM !== 'undefined' && typeof PercyDOM.waitForReady === 'function') {
      /* eslint-disable-next-line no-undef */
      PercyDOM.waitForReady(cfg).then(function(r) { done(r); }).catch(function() { done(); });
    } else { done(); }
  } catch (e) { done(); }
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
      await b.execute(await utils.fetchPercyDOM());

      // Readiness gate — runs before serialize when CLI supports it (PER-7348).
      // executeAsync with the callback signal is robust across WebdriverIO
      // Promise-handling variations.
      let readinessDiagnostics;
      const readinessConfig = options?.readiness || utils.percy?.config?.snapshot?.readiness || {};
      if (readinessConfig.preset !== 'disabled') {
        try {
          readinessDiagnostics = await b.executeAsync(browserWaitForReady, readinessConfig);
        } catch (err) {
          log.debug(`waitForReady failed, proceeding to serialize: ${err?.message || err}`);
        }
      }

      // Serialize and capture the DOM
      /* istanbul ignore next: no instrumenting injected code */
      let { domSnapshot, url } = await b.execute(async (options) => ({
        domSnapshot: await PercyDOM.serialize(options),
        url: document.URL
      }), options);

      // Attach readiness diagnostics so the CLI can log timing and pass/fail
      if (readinessDiagnostics && domSnapshot && typeof domSnapshot === 'object') {
        domSnapshot.readiness_diagnostics = readinessDiagnostics;
      }

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

module.exports.__test__ = { browserWaitForReady };
