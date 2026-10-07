// Compiled by `yarn test:types:consumer` the way a WebdriverIO 10 testrunner
// project with TypeScript 6 compiles it (types list from the v10 guide).
import percySnapshot from '@percy/webdriverio';

describe('percySnapshot in a testrunner project', () => {
  it('accepts every documented call form', async () => {
    await percySnapshot('Snapshot name');
    await percySnapshot('Snapshot name', { widths: [1000] });
    await percySnapshot(browser, 'Snapshot name');

    // README: browsing context example
    const page = await browser.url('https://example.com');
    await percySnapshot(page, 'Example page');

    // @ts-expect-error unknown snapshot option
    await percySnapshot(browser, 'Snapshot name', { foo: 'bar' });
    // @ts-expect-error the name is required
    await percySnapshot(browser);
  });
});
