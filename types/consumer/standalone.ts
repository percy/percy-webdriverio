// Compiled by `yarn test:types:consumer`: standalone use with remote().
import { remote } from 'webdriverio';
import percySnapshot from '@percy/webdriverio';

const browser = await remote({ capabilities: { browserName: 'chrome' } });
await percySnapshot(browser, 'Standalone snapshot');
await browser.deleteSession();
