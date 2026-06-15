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

// The Percy CLI runs locally. Its address determines where the DOM-serialization
// bundle is fetched+executed and where percy.type/options are sourced, so an
// impostor (non-loopback) agent could misroute Automate snapshots, inject a DOM
// script, and leak options (CWE-918 — PER-8707). Only trust a loopback address.
const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);
function isLoopbackAddress(address) {
  try {
    return LOOPBACK_HOSTS.has(new URL(address).hostname.toLowerCase());
  } catch (e) {
    return false;
  }
}
const ENV_INFO = `${webdriverioPkg.name}/${webdriverioPkg.version}`;

// Take a DOM snapshot and post it to the snapshot endpoint
module.exports = function percySnapshot(b, name, options) {
  // allow working with or without standalone mode
  if (!b || typeof b === 'string') [b, name, options] = [browser, b, name];
  if (!b) throw new Error('The WebdriverIO `browser` object is required.');
  if (!name) throw new Error('The `name` argument is required.');

  return b.call(async () => {
    if (!(await module.exports.isPercyEnabled())) return;
    let log = utils.logger('webdriverio');

    // Refuse a non-loopback Percy server address before trusting percy.type or
    // fetching/executing the DOM bundle from it (PER-8707).
    if (utils.percy?.address && !isLoopbackAddress(utils.percy.address)) {
      log.error(`Refusing non-loopback PERCY_SERVER_ADDRESS "${utils.percy.address}"; the Percy CLI must run on localhost.`);
      return;
    }

    if (utils.percy?.type === 'automate') {
      throw new Error('You are using Percy on Automate session with WebdriverIO. For using WebdriverIO correctly, please use https://github.com/percy/percy-selenium-js/ or https://github.com/percy/percy-appium-js/');
    }

    try {
      // Inject the DOM serialization script
      await b.execute(await utils.fetchPercyDOM());

      // Readiness gate. All orchestration lives in @percy/sdk-utils
      // (disabled-check + shallow-merge config + callback-mode script
      // generation + try/catch). callback: true makes waitForReadyScript
      // use arguments[arguments.length - 1] for the executeAsync done
      // callback, which is robust across WebdriverIO Promise-handling
      // variations. The package.json floor pins runReadinessGate to be
      // present.
      const readinessDiagnostics = await utils.runReadinessGate(
        (script) => b.executeAsync(script),
        options,
        { callback: true, log }
      );

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
