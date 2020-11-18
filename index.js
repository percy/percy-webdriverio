const utils = require('@percy/sdk-utils');

// Collect client and environment information
const sdkPkg = require('./package.json');
const webdriverioPkg = require('webdriverio/package.json');
const CLIENT_INFO = `${sdkPkg.name}/${sdkPkg.version}`;
const ENV_INFO = `${webdriverioPkg.name}/${webdriverioPkg.version}`;

// Take a DOM snapshot and post it to the snapshot endpoint
function percySnapshot(browser, name, options) {
  if (!browser || typeof browser === 'string') throw new Error('The WebdriverIO `browser` object is required.');
  if (!name) throw new Error('The `name` argument is required.');

  return browser.call(async () => {
    if (!(await utils.isPercyEnabled())) return;

    try {
      // Inject the DOM serialization script
      await browser.execute(await utils.fetchPercyDOM());

      // Serialize and capture the DOM
      /* istanbul ignore next: no instrumenting injected code */
      let { domSnapshot, url } = await browser.execute(options => ({
        /* eslint-disable-next-line no-undef */
        domSnapshot: PercyDOM.serialize(options),
        url: document.URL
      }), options);

      // Post the DOM to the snapshot endpoint with snapshot options and other info
      await utils.postSnapshot({
        ...options,
        environmentInfo: ENV_INFO,
        clientInfo: CLIENT_INFO,
        domSnapshot,
        name,
        url
      });
    } catch (error) {
      // Handle errors
      utils.log('error', `Could not take DOM snapshot "${name}"`);
      utils.log('error', error);
    }
  });
}

// allow working with or without standalone mode by checking for a global browser
// object and binding it to the snapshot function when found
if (browser) {
  module.exports = (...args) => percySnapshot(browser, ...args);
} else {
  module.exports = percySnapshot;
}
