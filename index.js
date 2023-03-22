const utils = require('@percy/sdk-utils');

// Collect client and environment information
const sdkPkg = require('./package.json');
const webdriverioPkg = require('webdriverio/package.json');
const CLIENT_INFO = `${sdkPkg.name}/${sdkPkg.version}`;
const ENV_INFO = `${webdriverioPkg.name}/${webdriverioPkg.version}`;

// Take a DOM snapshot and post it to the snapshot endpoint
module.exports = function percySnapshot(b, name, options) {
  // allow working with or without standalone mode
  if (!b || typeof b === 'string') [b, name, options] = [browser, b, name];
  if (!b) throw new Error('The WebdriverIO `browser` object is required.');
  if (!name) throw new Error('The `name` argument is required.');

  return b.call(async () => {
    if (!(await utils.isPercyEnabled())) return;
    let log = utils.logger('webdriverio');

    try {
      // Inject the DOM serialization script
      await b.execute(await utils.fetchPercyDOM());

      // Serialize and capture the DOM
      /* istanbul ignore next: no instrumenting injected code */
      let { domSnapshot, url } = await b.execute(options => ({
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
      log.error(`Could not take DOM snapshot "${name}"`);
      log.error(error);
    }
  });
};
