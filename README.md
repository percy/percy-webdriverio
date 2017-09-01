# percy-webdriverio
[![Package Status](https://img.shields.io/npm/v/@percy-io/percy-webdriverio.svg)](https://www.npmjs.com/package/@percy-io/percy-webdriverio)
[![Build Status](https://travis-ci.org/percy/percy-webdriverio.svg?branch=master)](https://travis-ci.org/percy/percy-webdriverio)

**@percy-io/percy-webdriverio** adds [Percy](https://percy.io) visual testing and review to your [**WebdriverIO**](http://webdriver.io/) tests.

#### Docs here: [https://percy.io/docs/clients/javascript/webdriverio](https://percy.io/docs/clients/javascript/webdriverio)



# Notes for Developers
If you want to submit a PR for percy-webdriverio you'll want to run it's tests first:
```sh
yarn test
```

The tests make use of [nock](https://github.com/node-nock/nock) to mock requests made to Percy's API. You can re-record HTTP calls in nock like this:
```sh
REC_PERCY_TOKEN=<your-token> REC_PERCY_PROJECT=<your project> NOCK_REC=1 yarn test
```
