const helpers = require('@percy/sdk-utils/test/helpers');
const utils = require('@percy/sdk-utils');
const percySnapshot = require('../index.js');

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
