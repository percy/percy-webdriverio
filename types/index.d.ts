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

export default function percySnapshot(
  browser: WebdriverIO.Browser,
  name: string,
  options?: SnapshotOptions
): Promise<void | { [key: string]: any }>;

export default function percySnapshot(
  context: WebdriverIO.BrowsingContext,
  name: string,
  options?: SnapshotOptions
): Promise<void | { [key: string]: any }>;

export default function percySnapshot(
  name: string,
  options?: SnapshotOptions
): Promise<void | { [key: string]: any }>;
