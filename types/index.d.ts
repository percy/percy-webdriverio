import { SnapshotOptions } from '@percy/core';
import { Browser } from 'webdriverio';

export default function percySnapshot(
  browser: Browser,
  name: string,
  options?: SnapshotOptions
): Promise<void>;

export default function percySnapshot(
  name: string,
  options?: SnapshotOptions
): Promise<void>;
