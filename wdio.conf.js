exports.config = {
  runner: 'local',
  framework: 'jasmine',
  reporters: ['spec'],
  specs: ['./test/*.test.js'],
  logLevel: 'silent',
  // Firefox runs -headless, so WebdriverIO 10 does not need to start a
  // display server (Weston or Xvfb) on Linux. WebdriverIO 8 and 9 ignore
  // this option.
  displayServerEnabled: false,
  capabilities: [{
    maxInstances: 5,
    browserName: 'firefox',
    'moz:firefoxOptions': {
      args: ['-headless']
    },
    // WDIO_CLASSIC=1 runs the suite in a WebDriver Classic session, so the
    // switchFrame path is tested on webdriverio 9 and 10 (both default to BiDi).
    'wdio:enforceWebDriverClassic': Boolean(process.env.WDIO_CLASSIC)
  }]
  // No hostname or port: WebdriverIO downloads and starts geckodriver itself.
};
