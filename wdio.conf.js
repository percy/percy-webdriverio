const fs = require('fs');
const path = require('path');

// webdriverio 6 and 7 share the one geckodriver started in onPrepare, and
// geckodriver serves a single session at a time, so their spec files run
// one after another. 8 and later start a driver per worker.
const wdioMajor = parseInt(JSON.parse(fs.readFileSync(
  path.join(__dirname, 'node_modules/webdriverio/package.json'), 'utf8'
)).version, 10);

const capability = {
  maxInstances: wdioMajor < 8 ? 1 : 5,
  browserName: 'firefox',
  'moz:firefoxOptions': {
    args: ['-headless']
  }
};

// WDIO_CLASSIC=1 runs the suite in a WebDriver Classic session, so the
// switchFrame path is tested on webdriverio 9 and 10 (both default to BiDi).
// Only set when asked: webdriverio 6 and 7 do not know the capability.
if (process.env.WDIO_CLASSIC) capability['wdio:enforceWebDriverClassic'] = true;

exports.config = {
  runner: 'local',
  framework: 'jasmine',
  reporters: ['spec'],
  specs: ['./test/*.test.js'],
  logLevel: 'silent',
  // Firefox runs -headless, so webdriverio 10 does not need to start a
  // display server (Weston or Xvfb) on Linux. Older versions ignore it.
  displayServerEnabled: false,
  capabilities: [capability],

  // webdriverio 6 and 7 connect to localhost:4444; 8.14 and later start their
  // own driver when no hostname or port is set and do not use this one.
  onPrepare() {
    require('geckodriver').start();
  },

  onComplete() {
    require('geckodriver').stop();
  }
};
