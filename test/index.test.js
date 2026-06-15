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
    function buildBrowser({ executeAsyncImpl, executeImpl } = {}) {
      const executeAsyncCalls = [];
      const executeCalls = [];
      browser = {
        call: (fn) => fn(),
        executeAsync: (...args) => {
          executeAsyncCalls.push(args);
          return executeAsyncImpl ? executeAsyncImpl(...args) : Promise.resolve();
        },
        execute: (...args) => {
          executeCalls.push(args);
          return executeImpl
            ? executeImpl(...args)
            : Promise.resolve({
              domSnapshot: { html: '<html></html>', resources: [] },
              url: 'http://localhost/'
            });
        }
      };
      return { executeAsyncCalls, executeCalls };
    }

    it('calls executeAsync with waitForReady before serialize', async () => {
      const { executeAsyncCalls, executeCalls } = buildBrowser({
        executeAsyncImpl: () => Promise.resolve({ ok: true })
      });

      await percySnapshot('readiness-happy-path');

      expect(executeAsyncCalls.length).toBe(1);
      // sdk-utils.waitForReadyScript({ callback: true }) emits a STRING using
      // `arguments[arguments.length - 1]` for the executeAsync done callback.
      expect(typeof executeAsyncCalls[0][0]).toBe('string');
      expect(executeAsyncCalls[0][0]).toContain('PercyDOM.waitForReady');
      expect(executeAsyncCalls[0][0]).toContain('arguments[arguments.length - 1]');
      // execute is called twice: once to inject PercyDOM, once to serialize.
      expect(executeCalls.length).toBeGreaterThan(0);
    });

    it('inlines per-snapshot readiness config as JSON into the script', async () => {
      const { executeAsyncCalls } = buildBrowser({
        executeAsyncImpl: () => Promise.resolve(null)
      });
      const readiness = { preset: 'strict', stabilityWindowMs: 500 };

      await percySnapshot('readiness-config', { readiness });

      expect(executeAsyncCalls.length).toBe(1);
      // sdk-utils inlines the config via JSON.stringify rather than passing
      // it as a separate b.executeAsync argument.
      expect(executeAsyncCalls[0][0]).toContain('"preset":"strict"');
      expect(executeAsyncCalls[0][0]).toContain('"stabilityWindowMs":500');
    });

    it('skips executeAsync when preset is disabled', async () => {
      const { executeAsyncCalls } = buildBrowser();

      await percySnapshot('readiness-disabled', { readiness: { preset: 'disabled' } });

      expect(executeAsyncCalls.length).toBe(0);
    });

    it('still serializes when executeAsync rejects', async () => {
      // Factory function (not Promise.reject literal) so the rejection is
      // produced only when the SDK awaits — avoids an unhandled-rejection.
      buildBrowser({
        executeAsyncImpl: () => Promise.reject(new Error('readiness boom'))
      });

      await percySnapshot('readiness-reject');

      expect(helpers.logger.stderr).not.toEqual(jasmine.arrayContaining([
        '[percy] Could not take DOM snapshot "readiness-reject"'
      ]));
    });

    it('still serializes when executeAsync rejects with a non-Error', async () => {
      // Covers the `err?.message || err` second branch: rejection value has
      // no `.message`, so logging falls through to stringifying err itself.
      buildBrowser({
        executeAsyncImpl: () => Promise.reject('plain-string-rejection')
      });

      await percySnapshot('readiness-reject-string');

      expect(helpers.logger.stderr).not.toEqual(jasmine.arrayContaining([
        '[percy] Could not take DOM snapshot "readiness-reject-string"'
      ]));
    });
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

