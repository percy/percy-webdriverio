exports.config = {
  runner: 'local',
  framework: 'mocha',
  reporters: ['spec'],
  specs: ['./test/*.test.mjs'],

  logLevel: 'silent',
  capabilities: [{
    maxInstances: 5,
    browserName: 'firefox',
    'moz:firefoxOptions': {
      args: ['-headless']
    }
  }],

  onPrepare() {
    require('geckodriver').start();
  },

  onComplete() {
    require('geckodriver').stop();
  }
};
