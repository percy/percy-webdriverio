const expect = require('expect');
const helpers = require('@percy/sdk-utils/test/helpers');
const percySnapshot = require('../index.js');

describe('percySnapshot', () => {
  let og;

  before(async () => {
    await helpers.mockSite();
  });

  after(async () => {
    await helpers.closeSite();
  });

  beforeEach(async function() {
    og = browser;
    this.timeout(0);
    await helpers.setup();
    await browser.url('http://localhost:8000');
  });

  afterEach(async () => {
    await helpers.teardown();
    browser = og;
  });

  it('throws an error when the browser object is missing', () => {
    browser = null;

    expect(() => percySnapshot())
      .toThrow('The WebdriverIO `browser` object is required.');
  });

  it('throws an error when a name is not provided', () => {
    expect(() => percySnapshot())
      .toThrow('The `name` argument is required.');
  });

  it('disables snapshots when the healthcheck fails', async () => {
    await helpers.testFailure('/percy/healthcheck');

    await percySnapshot('Snapshot 1');
    await percySnapshot('Snapshot 2');

    await expect(helpers.getRequests()).resolves.toEqual([
      ['/percy/healthcheck']
    ]);

    expect(helpers.logger.stderr).toEqual([]);
    expect(helpers.logger.stdout).toEqual([
      '[percy] Percy is not running, disabling snapshots'
    ]);
  });

  it('posts snapshots to the local percy server', async () => {
    await percySnapshot('Snapshot 1');
    await percySnapshot('Snapshot 2');

    await expect(helpers.getRequests()).resolves.toEqual([
      ['/percy/healthcheck'],
      ['/percy/dom.js'],
      ['/percy/snapshot', {
        name: 'Snapshot 1',
        url: 'http://localhost:8000/',
        domSnapshot: '<html><head></head><body>Snapshot Me</body></html>',
        clientInfo: expect.stringMatching(/@percy\/webdriverio\/.+/),
        environmentInfo: expect.stringMatching(/webdriverio\/.+/)
      }],
      ['/percy/snapshot', expect.objectContaining({
        name: 'Snapshot 2'
      })]
    ]);

    expect(helpers.logger.stdout).toEqual([]);
    expect(helpers.logger.stderr).toEqual([]);
  });

  it('handles snapshot failures', async () => {
    await helpers.testFailure('/percy/snapshot', 'failure');

    await percySnapshot('Snapshot 1');

    expect(helpers.logger.stdout).toHaveLength(0);
    expect(helpers.logger.stderr).toEqual([
      '[percy] Could not take DOM snapshot "Snapshot 1"',
      '[percy] Error: failure'
    ]);
  });

  it('works in standalone mode', async () => {
    browser = null;

    await percySnapshot(og, 'Snapshot 1');
    await percySnapshot(og, 'Snapshot 2');

    await expect(helpers.getRequests()).resolves.toEqual([
      ['/percy/healthcheck'],
      ['/percy/dom.js'],
      ['/percy/snapshot', expect.objectContaining({
        name: 'Snapshot 1'
      })],
      ['/percy/snapshot', expect.objectContaining({
        name: 'Snapshot 2'
      })]
    ]);

    expect(helpers.logger.stderr).toEqual([]);
  });

  it('throws the proper argument error in standalone mode', async () => {
    browser = null;

    expect(() => percySnapshot())
      .toThrow('The WebdriverIO `browser` object is required.');
  });
});
