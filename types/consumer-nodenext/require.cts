// Compiled by `yarn test:types:consumer`: a CommonJS file with NodeNext
// resolution (create-wdio generates NodeNext for CommonJS projects).
import percySnapshot = require('@percy/webdriverio');

export async function snapshot(): Promise<void> {
  await percySnapshot('Snapshot name');
}
