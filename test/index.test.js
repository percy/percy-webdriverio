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

  it('posts snapshots to the local percy server with sync = True', async () => {
    const resp = await percySnapshot('Snapshot 1');

    expect(resp).toEqual(jasmine.objectContaining({
      'snapshot-name': 'Snapshot 1',
      status: 'success'
    }));
    expect(await helpers.get('logs')).toEqual(jasmine.arrayContaining([
      'Snapshot found: Snapshot 1',
      `- url: ${helpers.testSnapshotURL}`,
      jasmine.stringMatching(/clientInfo: @percy\/webdriverio\/.+/),
      jasmine.stringMatching(/environmentInfo: webdriverio\/.+/)
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
    spyOn(percySnapshot, 'isPercyEnabled').and.returnValue(Promise.resolve(true));
    utils.percy.type = 'automate';

    let error = null;
    try {
      await percySnapshot('Snapshot 2');
    } catch (e) {
      error = e.message;
    }
    expect(error).toEqual('You are using Percy on Automate session with WebdriverIO. For using WebdriverIO correctly, please use https://github.com/percy/percy-selenium-js/ or https://github.com/percy/percy-appium-js/');
  });
});
