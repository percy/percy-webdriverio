import { SnapshotOptions } from '@percy/core';

declare global {
  namespace WebdriverIO {
    // WebdriverIO 10 defines BrowsingContext (for example the result of
    // browser.url() in a BiDi session); this declaration merges with it and
    // keeps the overload below valid on older majors, which do not define it.
    // The member matches WebdriverIO 10; an empty interface would accept any
    // value as the first argument on the older majors.
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

// index.js sets module.exports to the function (CommonJS), so the types use
// `export =`. `export default` told TypeScript the function was at `.default`,
// which does not exist at runtime: it broke ESM projects on NodeNext (TS2349)
// and CommonJS projects without esModuleInterop (`.default is not a function`).
export = percySnapshot;
