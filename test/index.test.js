const expect = require('expect');
const sdk = require('@percy/sdk-utils/test/helper');

describe('percySnapshot', () => {
  let percySnapshot, og;

  before(async () => {
    await sdk.testsite.mock();
  });

  after(async () => {
    await sdk.testsite.close();
  });

  beforeEach(async function() {
    og = browser;
    this.timeout(0);
    await sdk.setup();
    await browser.url('http://localhost:8000');
    delete require.cache[require.resolve('..')];
    percySnapshot = require('..');
  });

  afterEach(async () => {
    await sdk.teardown();
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
    sdk.test.failure('/percy/healthcheck');

    await sdk.stdio(async () => {
      await percySnapshot('Snapshot 1');
      await percySnapshot('Snapshot 2');
    });

    expect(sdk.server.requests).toEqual([
      ['/percy/healthcheck']
    ]);

    expect(sdk.stdio[2]).toEqual([]);
    expect(sdk.stdio[1]).toEqual([
      '[percy] Percy is not running, disabling snapshots\n'
    ]);
  });

  it('posts snapshots to the local percy server', async () => {
    await sdk.stdio(async () => {
      await percySnapshot('Snapshot 1');
      await percySnapshot('Snapshot 2');
    });

    expect(sdk.server.requests).toEqual([
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

    expect(sdk.stdio[2]).toEqual([]);
  });

  it('handles snapshot failures', async () => {
    sdk.test.failure('/percy/snapshot', 'failure');

    await sdk.stdio(async () => {
      await percySnapshot('Snapshot 1');
    });

    expect(sdk.stdio[1]).toHaveLength(0);
    expect(sdk.stdio[2]).toEqual([
      '[percy] Could not take DOM snapshot "Snapshot 1"\n',
      '[percy] Error: failure\n'
    ]);
  });

  it('works in standalone mode', async () => {
    browser = null;

    delete require.cache[require.resolve('..')];
    percySnapshot = require('..');

    await sdk.stdio(async () => {
      await percySnapshot(og, 'Snapshot 1');
      await percySnapshot(og, 'Snapshot 2');
    });

    expect(sdk.server.requests).toEqual([
      ['/percy/healthcheck'],
      ['/percy/dom.js'],
      ['/percy/snapshot', expect.objectContaining({
        name: 'Snapshot 1'
      })],
      ['/percy/snapshot', expect.objectContaining({
        name: 'Snapshot 2'
      })]
    ]);

    expect(sdk.stdio[2]).toEqual([]);
  });

  it('throws the proper argument error in standalone mode', async () => {
    browser = null;

    delete require.cache[require.resolve('..')];
    percySnapshot = require('..');

    expect(() => percySnapshot())
      .toThrow('The WebdriverIO `browser` object is required.');
  });
});
