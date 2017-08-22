# percy-webdriverio

[![Build Status](https://travis-ci.org/percy/percy-webdriverio.svg?branch=master)](https://travis-ci.org/percy/percy-webdriverio)

Webdriver plugin for percy.io support

# Hello world:

```js
// wdio.conf.js
...
    plugins: {
      'percy-webdriverio': {}
    }
...    
```

```js
after(function() {
  browser.percyFinalizeBuild();
});

describe('webdriver.io', function() {
    it('should look great', function () {
        browser.percyUseAssetLoader('filesystem', {buildDir: 'site/assets', mountPath:'/assets' });
        browser.url('http://localhost:3000');
        browser.percySnapshot('sample');
    });
});
```

# API

## browser.percyUseAssetLoader

Select the asset loader to load.
Since percy.io renders pages on the server side, you need to make sure assets (.js, .css, etc files) are inclued as well.

1. filesystem:
   load assets from a given directory. Example:

   ```js
   browser.percyUseAssetLoader('filesystem', {buildDir: 'compiled-assets-dir'});
   ```

## browser.percySnapshot

Capture a snapshot and send to percy.io for comparison. Options in the second parameter (`width`, `enabledJavascript`, `minimumHeight`) are optional.

  ```js
  browser.percySnapshot('name', {widths: [640, 800], enableJavaScript: true, minimumHeight: 400})
  ```

## browser.percyFinalizeBuild

Should be called from an after test hook. Will marked the build finished, so percy.io knows it doesn't needs to wait for further snapshots.


  ```js
  after(function() {
    browser.percyFinalizeBuild();
  });
  ```

# Development

# recapturing nock flow

REC_PERCY_TOKEN=f32... REC_PRECY_PROJECT=<org>/<proj> NOCK_REC=1 npm test
