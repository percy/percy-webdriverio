const http = require('http');
const helpers = require('@percy/sdk-utils/test/helpers');
const utils = require('@percy/sdk-utils');
const percySnapshot = require('../index.js');

// Forward-compat shim: `utils.runReadinessGate` is the orchestrator added
// in @percy/sdk-utils 1.31.15. Until that version is published, polyfill
// it here so tests exercise the real call shape instead of being skipped
// by the SDK's typeof guard. Once 1.31.15 lands, this becomes a no-op.
if (typeof utils.runReadinessGate !== 'function') {
  utils.runReadinessGate = async function runReadinessGate(evalScript, snapshotOptions, opts) {
    snapshotOptions = snapshotOptions || {};
    opts = opts || {};
    const callback = !!opts.callback;
    const log = opts.log;
    if (typeof utils.isReadinessDisabled === 'function' && utils.isReadinessDisabled(snapshotOptions)) return null;
    const cfg = typeof utils.getReadinessConfig === 'function'
      ? utils.getReadinessConfig(snapshotOptions)
      : Object.assign({},
          (utils.percy && utils.percy.config && utils.percy.config.snapshot && utils.percy.config.snapshot.readiness) || {},
          (snapshotOptions && snapshotOptions.readiness) || {});
    const script = typeof utils.waitForReadyScript === 'function'
      ? utils.waitForReadyScript(cfg, { callback })
      : null;
    if (!script) return null;
    try {
      return await evalScript(script);
    } catch (err) {
      if (log && typeof log.debug === 'function') {
        log.debug('waitForReady failed, proceeding to serialize: ' + ((err && err.message) || err));
      }
      return null;
    }
  };
}

describe('percySnapshot', () => {
  let og;

  beforeEach(async function() {
    og = browser;
    await helpers.setupTest();
    await browser.url(helpers.testSnapshotURL);
  });

  afterEach(() => {
    browser = og;
  });

  it('throws an error when the browser object is missing', () => {
    browser = null;

    expect(() => percySnapshot())
      .toThrowError('The WebdriverIO `browser` object is required.');
  });

  it('throws an error when a name is not provided', () => {
    expect(() => percySnapshot())
      .toThrowError('The `name` argument is required.');
  });

  it('disables snapshots when the healthcheck fails', async () => {
    await helpers.test('error', '/percy/healthcheck');

    await percySnapshot('Snapshot 1');
    await percySnapshot('Snapshot 2');

    expect(helpers.logger.stdout).toEqual(jasmine.arrayContaining([
      '[percy] Percy is not running, disabling snapshots'
    ]));
  });

  it('posts snapshots to the local percy server', async () => {
    await percySnapshot('Snapshot 1');
    await percySnapshot('Snapshot 2');

    expect(await helpers.get('logs')).toEqual(jasmine.arrayContaining([
      'Snapshot found: Snapshot 1',
      'Snapshot found: Snapshot 2',
      `- url: ${helpers.testSnapshotURL}`,
      jasmine.stringMatching(/clientInfo: @percy\/webdriverio\/.+/),
      jasmine.stringMatching(/environmentInfo: webdriverio\/.+/)
    ]));
  });

  it('posts snapshots to the local percy server with sync = true', async () => {
    const mockedPostCall = spyOn(percySnapshot, 'request').and.callFake(() => {
      return {
        body: {
          data: {
            'snapshot-name': 'Snapshot 1',
            status: 'success'
          }
        }
      };
    });

    const resp = await percySnapshot('Snapshot 1', { sync: true });

    expect(resp).toEqual({
      'snapshot-name': 'Snapshot 1',
      status: 'success'
    });

    expect(mockedPostCall).toHaveBeenCalledTimes(1);
  });

  it('posts snapshots when config.snapshot is undefined', async () => {
    await percySnapshot('Snapshot to populate config');

    const savedConfig = utils.percy.config;
    utils.percy.config = { ...savedConfig, snapshot: undefined };

    await percySnapshot('Snapshot without config');

    utils.percy.config = savedConfig;

    expect(await helpers.get('logs')).toEqual(jasmine.arrayContaining([
      'Snapshot found: Snapshot without config'
    ]));
  });

  it('handles snapshot failures', async () => {
    await helpers.test('error', '/percy/snapshot');

    await percySnapshot('Snapshot 1');

    expect(helpers.logger.stderr).toEqual(jasmine.arrayContaining([
      '[percy] Could not take DOM snapshot "Snapshot 1"'
    ]));
  });

  it('works in standalone mode', async () => {
    browser = null;

    await percySnapshot(og, 'Snapshot 1');
    await percySnapshot(og, 'Snapshot 2');

    expect(await helpers.get('logs')).toEqual(jasmine.arrayContaining([
      'Snapshot found: Snapshot 1',
      'Snapshot found: Snapshot 2',
      `- url: ${helpers.testSnapshotURL}`,
      jasmine.stringMatching(/clientInfo: @percy\/webdriverio\/.+/),
      jasmine.stringMatching(/environmentInfo: webdriverio\/.+/)
    ]));
  });

  it('throws the proper argument error in standalone mode', () => {
    browser = null;

    expect(() => percySnapshot())
      .toThrowError('The WebdriverIO `browser` object is required.');
  });

  it('throws error for percy on automate session', async () => {
    spyOn(percySnapshot, 'isPercyEnabled').and.resolveTo(true);
    utils.percy.type = 'automate';

    let error = null;
    try {
      await percySnapshot('Snapshot 2');
    } catch (e) {
      error = e.message;
    }

    expect(error).toEqual('You are using Percy on Automate session with WebdriverIO. For using WebdriverIO correctly, please use https://github.com/percy/percy-selenium-js/ or https://github.com/percy/percy-appium-js/');
  });

  it('passes options to the DOM serialization and captures domSnapshot and url', async () => {
    const requestSpy = spyOn(percySnapshot, 'request').and.callThrough();

    const snapshotOptions = {
      enableJavaScript: true,
      widths: [375, 1280],
      minHeight: 1024,
      percyCSS: '.custom { display: none; }'
    };

    await percySnapshot('Snapshot with options', snapshotOptions);

    // Verify the request was called with the snapshot data
    expect(requestSpy).toHaveBeenCalledTimes(1);

    const callArgs = requestSpy.calls.mostRecent().args[0];

    // Verify that domSnapshot was captured
    expect(callArgs.domSnapshot).toBeDefined();

    // Verify that url was captured
    expect(callArgs.url).toBeDefined();
    expect(callArgs.url).toBe(helpers.testSnapshotURL);

    // Verify that options were passed through
    expect(callArgs.enableJavaScript).toBe(true);
    expect(callArgs.widths).toEqual([375, 1280]);
    expect(callArgs.minHeight).toBe(1024);
    expect(callArgs.percyCSS).toBe('.custom { display: none; }');
    expect(callArgs.name).toBe('Snapshot with options');

    // Verify the snapshot was posted successfully
    expect(await helpers.get('logs')).toEqual(jasmine.arrayContaining([
      'Snapshot found: Snapshot with options'
    ]));
  });

  it('reports the installed webdriverio version as environmentInfo', async () => {
    const requestSpy = spyOn(percySnapshot, 'request').and.callThrough();

    await percySnapshot('Environment info');

    const { environmentInfo } = requestSpy.calls.mostRecent().args[0];
    expect(environmentInfo).toMatch(/^webdriverio\/\d+\.\d+\.\d+/);
    // CI sets WDIO_MAJOR per matrix job, so a job that installed another
    // major fails here instead of testing the wrong version.
    if (process.env.WDIO_MAJOR) {
      expect(environmentInfo).toMatch(new RegExp(`^webdriverio/${process.env.WDIO_MAJOR}\\.`));
    }
  });

  it('attaches readiness diagnostics from the real browser', async () => {
    const requestSpy = spyOn(percySnapshot, 'request').and.callThrough();

    await percySnapshot('Readiness diagnostics');

    const { domSnapshot } = requestSpy.calls.mostRecent().args[0];
    expect(domSnapshot.readiness_diagnostics).toEqual(jasmine.any(Object));
  });

  it('does not include corsIframes when page has no iframes', async () => {
    const requestSpy = spyOn(percySnapshot, 'request').and.callThrough();

    await percySnapshot('No Iframes Snapshot');

    expect(requestSpy).toHaveBeenCalledTimes(1);
    const callArgs = requestSpy.calls.mostRecent().args[0];

    expect(callArgs.domSnapshot).toBeDefined();
    expect(callArgs.domSnapshot.corsIframes).toBeUndefined();
  });

  it('skips iframes with unsupported src', async () => {
    const requestSpy = spyOn(percySnapshot, 'request').and.callThrough();

    // Inject iframes with unsupported srcs
    await browser.execute(() => {
      let iframe1 = document.createElement('iframe');
      iframe1.src = 'about:blank';
      document.body.appendChild(iframe1);

      let iframe2 = document.createElement('iframe');
      iframe2.src = 'javascript:void(0)';
      document.body.appendChild(iframe2);

      let iframe3 = document.createElement('iframe');
      iframe3.src = 'data:text/html,<p>test</p>';
      document.body.appendChild(iframe3);
    });

    await percySnapshot('Unsupported Iframe Src Snapshot');

    expect(requestSpy).toHaveBeenCalledTimes(1);
    const callArgs = requestSpy.calls.mostRecent().args[0];
    expect(callArgs.domSnapshot).toBeDefined();
    expect(callArgs.domSnapshot.corsIframes).toBeUndefined();
  });

  it('skips iframes with srcdoc attribute', async () => {
    const requestSpy = spyOn(percySnapshot, 'request').and.callThrough();

    await browser.execute(() => {
      let iframe = document.createElement('iframe');
      iframe.src = 'https://cross-origin.example.com/page';
      iframe.srcdoc = '<p>srcdoc content</p>';
      iframe.setAttribute('data-percy-element-id', 'srcdoc-1');
      document.body.appendChild(iframe);
    });

    await percySnapshot('Srcdoc Iframe Snapshot');

    expect(requestSpy).toHaveBeenCalledTimes(1);
    const callArgs = requestSpy.calls.mostRecent().args[0];
    expect(callArgs.domSnapshot).toBeDefined();
    expect(callArgs.domSnapshot.corsIframes).toBeUndefined();
  });

  it('skips same-origin iframes', async () => {
    const requestSpy = spyOn(percySnapshot, 'request').and.callThrough();

    // Inject a same-origin iframe (same host as test page)
    await browser.execute((snapshotUrl) => {
      let iframe = document.createElement('iframe');
      iframe.src = snapshotUrl;
      iframe.setAttribute('data-percy-element-id', 'same-origin-1');
      document.body.appendChild(iframe);
    }, helpers.testSnapshotURL);

    await percySnapshot('Same Origin Iframe Snapshot');

    expect(requestSpy).toHaveBeenCalledTimes(1);
    const callArgs = requestSpy.calls.mostRecent().args[0];
    expect(callArgs.domSnapshot).toBeDefined();
    expect(callArgs.domSnapshot.corsIframes).toBeUndefined();
  });

  it('skips cross-origin iframes without data-percy-element-id', async () => {
    const requestSpy = spyOn(percySnapshot, 'request').and.callThrough();

    await browser.execute(() => {
      let iframe = document.createElement('iframe');
      iframe.src = 'https://cross-origin.example.com/page';
      document.body.appendChild(iframe);
    });

    await percySnapshot('No Percy Element Id Snapshot');

    expect(requestSpy).toHaveBeenCalledTimes(1);
    const callArgs = requestSpy.calls.mostRecent().args[0];
    expect(callArgs.domSnapshot).toBeDefined();
    expect(callArgs.domSnapshot.corsIframes).toBeUndefined();
  });

  it('skips iframes with invalid URL src', async () => {
    const requestSpy = spyOn(percySnapshot, 'request').and.callThrough();

    await browser.execute(() => {
      let iframe = document.createElement('iframe');
      iframe.src = 'not-a-valid-url';
      iframe.setAttribute('data-percy-element-id', 'invalid-url-1');
      document.body.appendChild(iframe);
    });

    await percySnapshot('Invalid URL Iframe Snapshot');

    expect(requestSpy).toHaveBeenCalledTimes(1);
    const callArgs = requestSpy.calls.mostRecent().args[0];
    expect(callArgs.domSnapshot).toBeDefined();
    expect(callArgs.domSnapshot.corsIframes).toBeUndefined();
  });

  it('handles processFrame failure for cross-origin iframes gracefully', async () => {
    const requestSpy = spyOn(percySnapshot, 'request').and.callThrough();

    // Inject a cross-origin iframe with percy-element-id
    // switchFrame will fail since the iframe cannot actually load cross-origin content
    await browser.execute(() => {
      let iframe = document.createElement('iframe');
      iframe.src = 'https://cross-origin.example.com/page';
      iframe.setAttribute('data-percy-element-id', 'cors-1');
      document.body.appendChild(iframe);
    });

    await percySnapshot('Cross Origin Iframe Snapshot');

    expect(requestSpy).toHaveBeenCalledTimes(1);
    const callArgs = requestSpy.calls.mostRecent().args[0];
    expect(callArgs.domSnapshot).toBeDefined();
    // processFrame should fail and return null, so no corsIframes
    expect(callArgs.domSnapshot.corsIframes).toBeUndefined();
  });

  it('skips iframes with no src attribute', async () => {
    const requestSpy = spyOn(percySnapshot, 'request').and.callThrough();

    await browser.execute(() => {
      let iframe = document.createElement('iframe');
      document.body.appendChild(iframe);
    });

    await percySnapshot('No Src Iframe Snapshot');

    expect(requestSpy).toHaveBeenCalledTimes(1);
    const callArgs = requestSpy.calls.mostRecent().args[0];
    expect(callArgs.domSnapshot).toBeDefined();
    expect(callArgs.domSnapshot.corsIframes).toBeUndefined();
  });

  describe('readiness gate', () => {
    // wdio 9+ ships `browser` as a proxy with non-writable accessors;
    // jasmine's `spyOn` either refuses to attach ("not declared writable")
    // or silently misbehaves depending on the resolved/rejected value. Build
    // a plain object with hand-rolled call recorders per spec so behaviour
    // is deterministic. The outer afterEach in `describe('percySnapshot')`
    // restores `browser = og`, so this swap is scoped to each spec.
    // The injected PercyDOM bundle also mentions `PercyDOM.waitForReady`, so
    // match the guard that only the sdk-utils readiness script contains.
    function isReadinessScript(script) {
      return typeof script === 'string' && script.includes("typeof PercyDOM !== 'undefined'");
    }

    function buildBrowser({ readinessImpl, executeImpl } = {}) {
      const readinessCalls = [];
      const executeCalls = [];
      browser = {
        call: (fn) => fn(),
        execute: (...args) => {
          executeCalls.push(args);
          if (isReadinessScript(args[0])) {
            readinessCalls.push(args);
            return readinessImpl ? readinessImpl(...args) : Promise.resolve();
          }
          return executeImpl
            ? executeImpl(...args)
            : Promise.resolve({
              domSnapshot: { html: '<html></html>', resources: [] },
              url: 'http://localhost/'
            });
        }
      };
      return { readinessCalls, executeCalls };
    }

    it('calls execute with a promise-returning waitForReady script before serialize', async () => {
      const { readinessCalls, executeCalls } = buildBrowser({
        readinessImpl: () => Promise.resolve({ ok: true })
      });

      await percySnapshot('readiness-happy-path');

      expect(readinessCalls.length).toBe(1);
      // No extra arguments: the readiness config is inlined into the script.
      expect(readinessCalls[0].length).toBe(1);
      // execute runs the string as a function body, so it needs an explicit
      // return; the promise-mode script has no done callback.
      expect(readinessCalls[0][0]).toMatch(/^return \(/);
      expect(readinessCalls[0][0]).not.toContain('arguments[arguments.length - 1]');
      const serializeIndex = executeCalls.findIndex((args) => typeof args[0] === 'function');
      const readinessIndex = executeCalls.findIndex((args) => isReadinessScript(args[0]));
      expect(readinessIndex).toBeLessThan(serializeIndex);
    });

    it('inlines per-snapshot readiness config as JSON into the script', async () => {
      const { readinessCalls } = buildBrowser({
        readinessImpl: () => Promise.resolve(null)
      });
      const readiness = { preset: 'strict', stabilityWindowMs: 500 };

      await percySnapshot('readiness-config', { readiness });

      expect(readinessCalls.length).toBe(1);
      // sdk-utils inlines the config via JSON.stringify rather than passing
      // it as a separate b.execute argument.
      expect(readinessCalls[0][0]).toContain('"preset":"strict"');
      expect(readinessCalls[0][0]).toContain('"stabilityWindowMs":500');
    });

    it('skips the readiness script when preset is disabled', async () => {
      const { readinessCalls } = buildBrowser();

      await percySnapshot('readiness-disabled', { readiness: { preset: 'disabled' } });

      expect(readinessCalls.length).toBe(0);
    });

    it('still serializes when the readiness script rejects', async () => {
      // Factory function (not Promise.reject literal) so the rejection is
      // produced only when the SDK awaits — avoids an unhandled-rejection.
      buildBrowser({
        readinessImpl: () => Promise.reject(new Error('readiness boom'))
      });

      await percySnapshot('readiness-reject');

      expect(helpers.logger.stderr).not.toEqual(jasmine.arrayContaining([
        '[percy] Could not take DOM snapshot "readiness-reject"'
      ]));
    });

    it('still serializes when the readiness script rejects with a non-Error', async () => {
      // Covers the `err?.message || err` second branch: rejection value has
      // no `.message`, so logging falls through to stringifying err itself.
      buildBrowser({
        readinessImpl: () => Promise.reject('plain-string-rejection')
      });

      await percySnapshot('readiness-reject-string');

      expect(helpers.logger.stderr).not.toEqual(jasmine.arrayContaining([
        '[percy] Could not take DOM snapshot "readiness-reject-string"'
      ]));
    });
  });
});

describe('cross-origin iframes in a real browser', () => {
  // The page under test is served by the Percy test server on localhost.
  // These fixtures are served on 127.0.0.1, so they are cross-origin to it;
  // the leaf frame of /nested is on localhost again, so it is cross-origin
  // to its 127.0.0.1 parent.
  let server, port;

  beforeAll(async () => {
    server = http.createServer((req, res) => {
      res.setHeader('Content-Type', 'text/html');
      if (req.url === '/nested') {
        res.end('<!doctype html><html><body><p>cors nested</p>' +
          `<iframe src="http://localhost:${port}/child" data-percy-element-id="e2e-leaf"></iframe>` +
          '</body></html>');
      } else if (req.url === '/nested-ignore') {
        res.end('<!doctype html><html><body><p>cors nested</p>' +
          `<iframe src="http://localhost:${port}/child" data-percy-element-id="e2e-leaf" class="no-percy"></iframe>` +
          '</body></html>');
      } else {
        res.end('<!doctype html><html><body><p>cors child</p></body></html>');
      }
    });
    await new Promise((resolve) => server.listen(0, resolve));
    port = server.address().port;
  });

  afterAll(async () => {
    await new Promise((resolve) => server.close(resolve));
  });

  beforeEach(async () => {
    await helpers.setupTest();
    await browser.url(helpers.testSnapshotURL);
  });

  async function addIframe(src, id) {
    await browser.execute(async (frameSrc, frameId) => {
      let iframe = document.createElement('iframe');
      iframe.src = frameSrc;
      iframe.setAttribute('data-percy-element-id', frameId);
      let loaded = new Promise((resolve) => { iframe.onload = resolve; });
      document.body.appendChild(iframe);
      await loaded;
    }, src, id);
  }

  it('runs in the session protocol that the CI job asks for', () => {
    // WDIO_CLASSIC=1 must give a Classic session, or the Classic switchFrame
    // path is not what the e2e specs below exercise.
    if (process.env.WDIO_CLASSIC) expect(browser.isBidi).toBe(false);
  });

  it('captures a cross-origin iframe', async () => {
    const requestSpy = spyOn(percySnapshot, 'request').and.callThrough();
    await addIframe(`http://127.0.0.1:${port}/child`, 'e2e-cors');

    await percySnapshot('E2E cross-origin iframe');

    const { corsIframes } = requestSpy.calls.mostRecent().args[0].domSnapshot;
    expect(corsIframes.length).toBe(1);
    expect(corsIframes[0].iframeData.percyElementId).toBe('e2e-cors');
    expect(corsIframes[0].frameUrl).toBe(`http://127.0.0.1:${port}/child`);
    expect(corsIframes[0].iframeSnapshot.html).toContain('cors child');
  });

  it('skips a cross-origin iframe matched by ignoreIframeSelectors', async () => {
    const requestSpy = spyOn(percySnapshot, 'request').and.callThrough();
    await addIframe(`http://127.0.0.1:${port}/child`, 'e2e-cors');

    await percySnapshot('E2E ignored iframe', {
      ignoreIframeSelectors: ['[data-percy-element-id="e2e-cors"]']
    });

    const { domSnapshot } = requestSpy.calls.mostRecent().args[0];
    expect(domSnapshot.corsIframes).toBeUndefined();
  });

  it('captures a nested cross-origin iframe', async () => {
    const requestSpy = spyOn(percySnapshot, 'request').and.callThrough();
    await addIframe(`http://127.0.0.1:${port}/nested`, 'e2e-cors');

    await percySnapshot('E2E nested cross-origin iframe');

    const { corsIframes } = requestSpy.calls.mostRecent().args[0].domSnapshot;
    expect(corsIframes.map((frame) => frame.iframeData.percyElementId)).toEqual(['e2e-cors', 'e2e-leaf']);
  });

  it('captures a tab held from newWindow, with its cross-origin iframes (webdriverio 10 BiDi)', async () => {
    if (!browser.isBidi || typeof browser.browsingContexts !== 'function') {
      pending('needs a webdriverio 10 BiDi session');
      return;
    }
    const requestSpy = spyOn(percySnapshot, 'request').and.callThrough();
    const tab = await browser.newWindow(`http://127.0.0.1:${port}/nested`, { type: 'tab' });
    try {
      await percySnapshot(tab, 'E2E held tab');
    } finally {
      await tab.closeWindow();
    }

    const { url, domSnapshot } = requestSpy.calls.mostRecent().args[0];
    expect(url).toBe(`http://127.0.0.1:${port}/nested`);
    expect(domSnapshot.html).toContain('cors nested');
    expect(domSnapshot.corsIframes.map((frame) => frame.iframeData.percyElementId)).toEqual(['e2e-leaf']);
  });

  it('skips a nested cross-origin iframe matched by ignoreIframeSelectors', async () => {
    // The check for the leaf runs inside the parent frame's scope; the
    // parent frame itself must still be captured.
    const requestSpy = spyOn(percySnapshot, 'request').and.callThrough();
    await addIframe(`http://127.0.0.1:${port}/nested-ignore`, 'e2e-cors');

    await percySnapshot('E2E nested ignored iframe', { ignoreIframeSelectors: ['.no-percy'] });

    const { corsIframes } = requestSpy.calls.mostRecent().args[0].domSnapshot;
    expect(corsIframes.map((frame) => frame.iframeData.percyElementId)).toEqual(['e2e-cors']);
  });

  it('captures through the browsing context that browser.url() returns', async () => {
    const page = await browser.url(helpers.testSnapshotURL);
    // webdriverio 8 returns nothing and 9 returns the request; only 10
    // returns a browsing context (BiDi) or a Classic stand-in.
    if (!page || typeof page.execute !== 'function') {
      pending('browser.url() returns a browsing context only in webdriverio 10');
      return;
    }
    const requestSpy = spyOn(percySnapshot, 'request').and.callThrough();
    await addIframe(`http://127.0.0.1:${port}/nested`, 'e2e-cors');

    await percySnapshot(page, 'E2E url() root');

    const { url, domSnapshot } = requestSpy.calls.mostRecent().args[0];
    expect(url).toBe(helpers.testSnapshotURL);
    expect(domSnapshot.corsIframes.map((frame) => frame.iframeData.percyElementId)).toEqual(['e2e-cors', 'e2e-leaf']);
  });

  it('leaves the session on the top document after the capture', async () => {
    await addIframe(`http://127.0.0.1:${port}/nested`, 'e2e-cors');

    await percySnapshot('E2E restore');

    expect(await browser.execute(() => document.URL)).toBe(helpers.testSnapshotURL);
  });
});

describe('percySnapshot with a held browsing context', () => {
  beforeEach(async () => {
    await helpers.setupTest();
  });

  it('runs a browsing context through the call command of its browser', async () => {
    // A webdriverio 10 BrowsingContext has no call command; it is marked with
    // the wdio.kind symbol and links to the browser that owns it.
    const requestSpy = spyOn(percySnapshot, 'request').and.callThrough();
    const owner = { call: jasmine.createSpy('call').and.callFake((fn) => fn()) };
    const context = {
      [Symbol.for('wdio.kind')]: 'browsing-context',
      browser: owner,
      isBidi: true,
      frame: () => Promise.reject(new Error('no frames expected')),
      $$: () => Promise.resolve([]),
      execute: (script) => Promise.resolve(typeof script === 'function'
        ? { domSnapshot: { html: '<html>tab</html>', resources: [] }, url: 'http://localhost/tab' }
        : undefined)
    };

    await percySnapshot(context, 'Held context');

    expect(owner.call).toHaveBeenCalledTimes(1);
    expect(requestSpy).toHaveBeenCalledTimes(1);
    expect(requestSpy.calls.mostRecent().args[0].url).toBe('http://localhost/tab');
  });

  it('throws at once when the first argument is not a browser or browsing context', () => {
    // For example what newWindow() returns in a WebDriver Classic session.
    expect(() => percySnapshot({ handle: 'window-1', type: 'tab' }, 'Not a browser'))
      .toThrowError('The first argument must be a WebdriverIO browser or browsing context.');
  });
});

describe('isUnsupportedIframeSrc', () => {
  const { isUnsupportedIframeSrc } = require('../index.js');

  it('returns true for null/undefined/empty src', () => {
    expect(isUnsupportedIframeSrc(null)).toBe(true);
    expect(isUnsupportedIframeSrc(undefined)).toBe(true);
    expect(isUnsupportedIframeSrc('')).toBe(true);
  });

  it('returns true for about:blank', () => {
    expect(isUnsupportedIframeSrc('about:blank')).toBe(true);
  });

  it('returns true for about:srcdoc', () => {
    expect(isUnsupportedIframeSrc('about:srcdoc')).toBe(true);
  });

  it('returns true for javascript: URLs', () => {
    expect(isUnsupportedIframeSrc('javascript:void(0)')).toBe(true);
  });

  it('returns true for data: URLs', () => {
    expect(isUnsupportedIframeSrc('data:text/html,<h1>Test</h1>')).toBe(true);
  });

  it('returns true for blob: URLs', () => {
    expect(isUnsupportedIframeSrc('blob:http://example.com/abc')).toBe(true);
  });

  it('returns true for vbscript: URLs', () => {
    expect(isUnsupportedIframeSrc('vbscript:msgbox')).toBe(true);
  });

  it('returns true for chrome: URLs', () => {
    expect(isUnsupportedIframeSrc('chrome://settings')).toBe(true);
  });

  it('returns true for chrome-extension: URLs', () => {
    expect(isUnsupportedIframeSrc('chrome-extension://abc/page.html')).toBe(true);
  });

  it('returns true for file: URLs (any case)', () => {
    expect(isUnsupportedIframeSrc('file:///etc/passwd')).toBe(true);
    expect(isUnsupportedIframeSrc('FILE:///C:/Users')).toBe(true);
  });

  it('returns false for http URLs', () => {
    expect(isUnsupportedIframeSrc('http://example.com')).toBe(false);
  });

  it('returns false for https URLs', () => {
    expect(isUnsupportedIframeSrc('https://example.com/iframe')).toBe(false);
  });
});

describe('getOrigin', () => {
  const { getOrigin } = require('../index.js');

  it('extracts origin from a valid URL', () => {
    expect(getOrigin('https://example.com/path')).toBe('https://example.com');
  });

  it('includes port in origin when specified', () => {
    expect(getOrigin('http://localhost:8080/page')).toBe('http://localhost:8080');
  });

  it('returns null for invalid URLs', () => {
    expect(getOrigin('not-a-url')).toBeNull();
  });

  it('returns null for empty string', () => {
    expect(getOrigin('')).toBeNull();
  });
});

