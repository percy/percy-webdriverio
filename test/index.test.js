const helpers = require('@percy/sdk-utils/test/helpers');
const utils = require('@percy/sdk-utils');
const percySnapshot = require('../index.js');

describe('percySnapshot', () => {
  let og;
  let executeErrorsAfter = 0;
  let executeErrors = 0;

  beforeAll(async function() {
    // mock execute to return errors when we need
    await browser.overwriteCommand('execute', (orig, ...args) => {
      if (executeErrorsAfter > 0) {
        executeErrorsAfter -= 1;
      } else if (executeErrors > 0) {
        executeErrors -= 1;
        throw new Error("Something went wrong");
      }
      return orig(...args);
    })
  })

  beforeEach(async function() {
    og = browser;
    await helpers.setupTest();
    await browser.url(helpers.testSnapshotURL);
  });

  afterEach(async () => {
    browser = og;
    executeErrorsAfter = 0;
    executeErrors = 0;
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

  it('retying dom capture if it throws exception', async () => {
    executeErrors = 2;

    await percySnapshot('Snapshot 1');

    expect(helpers.logger.stderr).toEqual([
      '[percy] Could not take DOM snapshot "Snapshot 1" injectedScript: false, capturedDOM: false, Retrying...',
      '[percy] Something went wrong',
      '[percy] Could not take DOM snapshot "Snapshot 1" injectedScript: false, capturedDOM: false, Retrying...',
      '[percy] Something went wrong',
    ])

    expect(await helpers.get('logs')).toEqual(jasmine.arrayContaining([
      'Snapshot found: Snapshot 1',
      `- url: ${helpers.testSnapshotURL}`,
      jasmine.stringMatching(/clientInfo: @percy\/webdriverio\/.+/),
      jasmine.stringMatching(/environmentInfo: webdriverio\/.+/)
    ]));
  });

  it('does not inject dom script multiple times in retry on success', async () => {
    executeErrorsAfter = 1;
    executeErrors = 2;

    await percySnapshot('Snapshot 1');

    expect(helpers.logger.stderr).toEqual([
      '[percy] Could not take DOM snapshot "Snapshot 1" injectedScript: true, capturedDOM: false, Retrying...',
      '[percy] Something went wrong',
      '[percy] Could not take DOM snapshot "Snapshot 1" injectedScript: true, capturedDOM: false, Retrying...',
      '[percy] Something went wrong',
    ])

    expect(await helpers.get('logs')).toEqual(jasmine.arrayContaining([
      'Snapshot found: Snapshot 1',
      `- url: ${helpers.testSnapshotURL}`,
      jasmine.stringMatching(/clientInfo: @percy\/webdriverio\/.+/),
      jasmine.stringMatching(/environmentInfo: webdriverio\/.+/)
    ]));
  });

  it('does not capture dom multiple times in retry on success', async () => {
    await helpers.test('error', '/percy/snapshot');

    await percySnapshot('Snapshot 1');

    expect(helpers.logger.stderr).toEqual([
      '[percy] Could not take DOM snapshot "Snapshot 1" injectedScript: true, capturedDOM: true, Retrying...',
      '[percy] testing',
      '[percy] Could not take DOM snapshot "Snapshot 1" injectedScript: true, capturedDOM: true, Retrying...',
      '[percy] testing',
      '[percy] Could not take DOM snapshot "Snapshot 1"',
      '[percy] Error: testing'
    ])
  });

  it('retying dom capture throws if all retries exhausted', async () => {
      executeErrors = 10;
      await percySnapshot('Snapshot 1');

      expect(helpers.logger.stderr).toEqual([
        '[percy] Could not take DOM snapshot "Snapshot 1" injectedScript: false, capturedDOM: false, Retrying...',
        '[percy] Something went wrong',
        '[percy] Could not take DOM snapshot "Snapshot 1" injectedScript: false, capturedDOM: false, Retrying...',
        '[percy] Something went wrong',
        '[percy] Could not take DOM snapshot "Snapshot 1"',
        '[percy] Error: Something went wrong'
      ])

      expect(helpers.logger.stdout).toEqual([]);
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
});
