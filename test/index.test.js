const helpers = require('@percy/sdk-utils/test/helpers');
const utils = require('@percy/sdk-utils');
const percySnapshot = require('../index.js');
const { browserWaitForReady } = percySnapshot.__test__;

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

  describe('readiness gate (PER-7348)', () => {
    it('calls executeAsync with waitForReady before serialize', async () => {
      const asyncSpy = spyOn(browser, 'executeAsync').and.returnValue(Promise.resolve({ ok: true }));

      await percySnapshot('readiness-happy-path');

      expect(asyncSpy).toHaveBeenCalled();
      const call = asyncSpy.calls.first();
      expect(call.args[0].toString()).toContain('waitForReady');
    });

    it('passes per-snapshot readiness config', async () => {
      const asyncSpy = spyOn(browser, 'executeAsync').and.returnValue(Promise.resolve(null));
      const readiness = { preset: 'strict', stabilityWindowMs: 500 };

      await percySnapshot('readiness-config', { readiness });

      expect(asyncSpy).toHaveBeenCalled();
      expect(asyncSpy.calls.first().args[1]).toEqual(readiness);
    });

    it('skips executeAsync when preset is disabled', async () => {
      const asyncSpy = spyOn(browser, 'executeAsync').and.returnValue(Promise.resolve());

      await percySnapshot('readiness-disabled', { readiness: { preset: 'disabled' } });

      expect(asyncSpy).not.toHaveBeenCalled();
    });

    it('still serializes when executeAsync rejects', async () => {
      spyOn(browser, 'executeAsync').and.returnValue(Promise.reject(new Error('readiness boom')));

      await percySnapshot('readiness-reject');

      expect(helpers.logger.stderr).not.toEqual(jasmine.arrayContaining([
        '[percy] Could not take DOM snapshot "readiness-reject"'
      ]));
    });

    it('still serializes when executeAsync rejects with a non-Error', async () => {
      // Covers the `err?.message || err` second branch: rejection value has
      // no `.message`, so logging falls through to stringifying err itself.
      spyOn(browser, 'executeAsync').and.returnValue(Promise.reject('plain-string-rejection'));

      await percySnapshot('readiness-reject-string');

      expect(helpers.logger.stderr).not.toEqual(jasmine.arrayContaining([
        '[percy] Could not take DOM snapshot "readiness-reject-string"'
      ]));
    });
  });
});

// Unit tests for the in-browser readiness invoker. Runs in Node against a
// stubbed `PercyDOM` global so the typeof-guard + try/catch branches get
// real statement/branch coverage instead of being suppressed.
describe('browserWaitForReady', () => {
  afterEach(() => {
    delete globalThis.PercyDOM;
  });

  it('invokes done with no args when PercyDOM is undefined', () => {
    const done = jasmine.createSpy('done');
    browserWaitForReady({ preset: 'balanced' }, done);
    expect(done).toHaveBeenCalledWith();
  });

  it('invokes done with no args when PercyDOM lacks waitForReady', () => {
    globalThis.PercyDOM = {};
    const done = jasmine.createSpy('done');
    browserWaitForReady({ preset: 'balanced' }, done);
    expect(done).toHaveBeenCalledWith();
  });

  it('invokes done with diagnostics when PercyDOM.waitForReady resolves', async () => {
    const diagnostics = { passed: true, preset: 'strict' };
    globalThis.PercyDOM = {
      waitForReady: jasmine.createSpy('waitForReady').and.returnValue(Promise.resolve(diagnostics))
    };
    const done = jasmine.createSpy('done');

    browserWaitForReady({ preset: 'strict' }, done);
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(globalThis.PercyDOM.waitForReady).toHaveBeenCalledWith({ preset: 'strict' });
    expect(done).toHaveBeenCalledWith(diagnostics);
  });

  it('invokes done with no args when PercyDOM.waitForReady rejects', async () => {
    globalThis.PercyDOM = {
      waitForReady: jasmine.createSpy('waitForReady').and.returnValue(Promise.reject(new Error('boom')))
    };
    const done = jasmine.createSpy('done');

    browserWaitForReady({ preset: 'balanced' }, done);
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(done).toHaveBeenCalledWith();
  });

  it('invokes done with no args when PercyDOM.waitForReady throws synchronously', () => {
    globalThis.PercyDOM = {
      waitForReady: () => { throw new Error('sync boom'); }
    };
    const done = jasmine.createSpy('done');

    browserWaitForReady({ preset: 'balanced' }, done);
    expect(done).toHaveBeenCalledWith();
  });
});
