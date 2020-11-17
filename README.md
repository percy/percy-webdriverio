# @percy/webdriverio

[![Version](https://img.shields.io/npm/v/@percy/webdriverio.svg)](https://www.npmjs.com/package/@percy/webdriverio)
![Test](https://github.com/percy/percy-webdriverio/workflows/Test/badge.svg)

[Percy](https://percy.io) visual testing for [WebdriverIO](http://webdriver.io/).

## Installation

Using yarn:

```sh-session
$ yarn add --dev @percy/cli @percy/webdriverio@next
```

Using npm:

```sh-session
$ npm install --save-dev @percy/cli @percy/webdriverio@next
```
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
  percySnapshot(browser, 'WebdriverIO at DuckDuckGo');

  await browser.deleteSession();
})().catch((e) => console.error(e));
```

## Configuration

`percySnapshot(name[, options])`

`percySnapshot(browser, name[, options])` (standalone mode only)

- `browser` (**required**) - The WebdriverIO browser object
- `name` (**required**) - The snapshot name; must be unique to each snapshot
- `options` - Additional snapshot options (overrides any project options)
  - `options.widths` - An array of widths to take screenshots at
  - `options.minHeight` - The minimum viewport height to take screenshots at
  - `options.percyCSS` - Percy specific CSS only applied in Percy's rendering environment
  - `options.requestHeaders` - Headers that should be used during asset discovery
  - `options.enableJavaScript` - Enable JavaScript in Percy's rendering environment

## Upgrading

If you're coming from a pre-2.0 version of this package, the `browser` argument is now only required
when used in standalone mode.

```javascript
// before (or in standalone mode)
await percySnapshot(browser, 'Snapshot name', options);

// after (using the WDIO testrunner)
await percySnapshot('Snapshot name', options);
```

### Migrating Config

If you have a previous Percy configuration file, migrate it to the newest version with the
[`config:migrate`](https://github.com/percy/cli/tree/master/packages/cli-config#percy-configmigrate-filepath-output) command:

```sh-session
$ percy config:migrate
```
