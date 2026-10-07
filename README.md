# @percy/webdriverio

[![Version](https://img.shields.io/npm/v/@percy/webdriverio.svg)](https://www.npmjs.com/package/@percy/webdriverio)
![Test](https://github.com/percy/percy-webdriverio/workflows/Test/badge.svg)

[Percy](https://percy.io) visual testing for [WebdriverIO](http://webdriver.io/).

## Installation

```sh-session
$ npm install --save-dev @percy/cli @percy/webdriverio
```
## Compatibility

| `@percy/webdriverio` | WebdriverIO                |
|----------------------|----------------------------|
| 4.x                  | 8 (8.14.0 or later), 9, 10 |
| 3.x                  | 6, 7, 8, 9                 |

WebdriverIO sets the Node.js version you need. WebdriverIO 10 needs Node.js 22.19.0 or later.

Cross-origin iframes are captured in WebDriver Classic sessions and in WebDriver BiDi sessions
(the WebdriverIO 10 default for Chrome and Firefox).

With WebdriverIO 10, you can also give a browsing context as the first argument. The result of
`browser.url()` works in BiDi and Classic sessions:

```javascript
const page = await browser.url('https://example.com');
await percySnapshot(page, 'Example page');
```

In a BiDi session, `browser.newWindow()` also returns a browsing context. In a Classic session it
switches the session to the new window, so give `browser`.

## Usage

This is an example using the `percySnapshot()` function in async mode.

```javascript
const percySnapshot = require('@percy/webdriverio');

describe('webdriver.io page', () => {
  it('should have the right title', async () => {
    await browser.url('https://webdriver.io');
    await expect(browser).toHaveTitle('WebdriverIO · Next-gen browser and mobile automation test framework for Node.js');
    await percySnapshot('webdriver.io page');
  });
});
```

Running the test above will result in the following log:

```sh-session
$ wdio wdio.conf.js
...

[...] webdriver.io page
[percy] Percy is not running, disabling snapshots
[...]    ✓ should have the right title

...
```

When running with [`percy
exec`](https://github.com/percy/cli/tree/master/packages/cli-exec#percy-exec), and your project's
`PERCY_TOKEN`, a new Percy build will be created and snapshots will be uploaded to your project.

```sh-session
$ export PERCY_TOKEN=[your-project-token]
$ percy exec -- wdio wdio.conf.js
[percy] Percy has started!
[percy] Created build #1: https://percy.io/[your-project]
[percy] Running "wdio wdio.conf.js"
...

[...] webdriver.io page
[percy] Snapshot taken "webdriver.io page"
[...]    ✓ should have the right title

...
[percy] Stopping percy...
[percy] Finalized build #1: https://percy.io/[your-project]
[percy] Done!
```

### Standalone mode

When using WebdriverIO in [standalone mode](https://webdriver.io/docs/setuptypes.html), the browser
object must be provided as the first argument to the `percySnapshot` function.

```javascript
const { remote } = require('webdriverio');
const percySnapshot = require('@percy/webdriverio');

(async () => {
  const browser = await remote({
    logLevel: 'trace',
    capabilities: {
      browserName: 'chrome'
    }
  });

  await browser.url('https://duckduckgo.com');

  const inputElem = await browser.$('#search_form_input_homepage');
  await inputElem.setValue('WebdriverIO');

  const submitBtn = await browser.$('#search_button_homepage');
  await submitBtn.click();

  // the browser object is required in standalone mode
  await percySnapshot(browser, 'WebdriverIO at DuckDuckGo');

  await browser.deleteSession();
})().catch((e) => console.error(e));
```

## Configuration

`percySnapshot(name[, options])`

`percySnapshot(browser, name[, options])` (required in standalone mode)

`percySnapshot(context, name[, options])` (WebdriverIO 10)

- `browser` - The WebdriverIO browser object. Without it, the global `browser` of the testrunner
  is used.
- `context` - A WebdriverIO 10 browsing context, for example the result of `browser.url()`. See
  [Compatibility](#compatibility).
- `name` (**required**) - The snapshot name; must be unique to each snapshot
- `options` - [See per-snapshot configuration options](https://www.browserstack.com/docs/percy/take-percy-snapshots/overview#per-snapshot-configuration)

## Upgrading

### Automatically with `@percy/migrate`

We built a tool to help automate migrating to the new CLI toolchain! Migrating
can be done by running the following commands and following the prompts:

``` shell
$ npx @percy/migrate
? Are you currently using @percy/webdriverio? Yes
? Install @percy/cli (required to run percy)? Yes
? Migrate Percy config file? Yes
? Upgrade SDK to @percy/webdriverio@2.0.0? Yes
```

This will automatically run the changes described below for you.

### Manually

If you're coming from a pre-2.0 version of this package, the `percySnapshot` function is now the default 
export, and the `browser` argument is now only required when used in standalone mode.

```javascript
// before 
const { percySnapshot } = require('@percy/webdriverio');
await percySnapshot(browser, 'Snapshot name', options);

// after
const percySnapshot = require('@percy/webdriverio');
await percySnapshot('Snapshot name', options);

// in standalone mode, browser is still required
await percySnapshot(browser, 'Snapshot name', options);
```

### Migrating Config

If you have a previous Percy configuration file, migrate it to the newest version with the
[`config:migrate`](https://github.com/percy/cli/tree/master/packages/cli-config#percy-configmigrate-filepath-output) command:

```sh-session
$ percy config:migrate
```
