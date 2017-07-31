# percy-webdriverio
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
        browser.percyUseAssetLoader('static_url', {base: 'http://webdriver.io', urls:[{url: '/js/app.js', mimetype:'text/javascript'}, {url:'/css/screen.css', mimetype:'text/css'}]})
        browser.url('http://webdriver.io');
        browser.percySnapshot('sample');
    });
});
```

# API

## browser.percyUseAssetLoader

Select the asset loader to load.
Since percy.io renders pages on the server side, you need to make sure assets (.js, .css, etc files) are inclued as well.

Currently 2 asset loaders are defined:

1. filesystem:
   load asssets from a given directory. Example:

   ```js
   browser.percyUseAssetLoader('filesystem', {buildDir: 'compiled-assets-dir'});
   ```

2. static_url:

    ```js
    browser.percyUseAssetLoader('static_url', {base: 'http://webdriver.io', urls:[{url: '/js/app.js', mimetype:'text/javascript'}, {url:'/css/screen.css', mimetype:'text/css'});
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
