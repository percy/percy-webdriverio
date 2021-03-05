import { SnapshotOptions } from '@percy/core';

export default function percySnapshot(
  browser: WebdriverIO.Browser,
  name: string,
  options?: SnapshotOptions
): Promise<void>;

export default function percySnapshot(
  name: string,
  options?: SnapshotOptions
): Promise<void>;
