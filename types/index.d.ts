import { SnapshotOptions } from '@percy/core';

declare global {
  namespace WebdriverIO {
    // WebdriverIO 10 defines BrowsingContext (for example the result of
    // browser.url()); this declaration merges with it and keeps the overload
    // below valid on WebdriverIO 8 and 9, which do not define it. The member
    // is the same as in WebdriverIO 10, and an empty interface would accept
    // any value as the first argument on WebdriverIO 8 and 9.
    interface BrowsingContext {
      browser: WebdriverIO.Browser;
    }
  }
}

declare function percySnapshot(
  browser: WebdriverIO.Browser,
  name: string,
  options?: SnapshotOptions
): Promise<void | { [key: string]: any }>;

declare function percySnapshot(
  context: WebdriverIO.BrowsingContext,
  name: string,
  options?: SnapshotOptions
): Promise<void | { [key: string]: any }>;

declare function percySnapshot(
  name: string,
  options?: SnapshotOptions
): Promise<void | { [key: string]: any }>;

// index.js sets module.exports to the function, so the types use export =.
// With export default, TypeScript (NodeNext, ESM) expects a default property
// that does not exist at runtime.
export = percySnapshot;
