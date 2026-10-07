// Compiled by `yarn test:types:consumer` as an ESM project with NodeNext
// resolution compiles it. index.js is CommonJS, so the default import is
// the function itself, not an object with a default property.
import percySnapshot from '@percy/webdriverio';

describe('percySnapshot in an ESM NodeNext project', () => {
  it('calls the default import', async () => {
    await percySnapshot('Snapshot name');
    await percySnapshot(browser, 'Snapshot name', { widths: [1000] });
  });
});
