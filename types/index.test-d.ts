/// <reference types="webdriverio" />
import { expectType, expectError } from 'tsd';
import percySnapshot from '.';

declare const browser: WebdriverIO.Browser;
declare const context: WebdriverIO.BrowsingContext;

expectError(percySnapshot());
expectError(percySnapshot(browser));

expectType<Promise<void | { [key: string]: any }>>(percySnapshot('Snapshot name'));
expectType<Promise<void | { [key: string]: any }>>(percySnapshot(browser, 'Snapshot name'));
expectType<Promise<void | { [key: string]: any }>>(percySnapshot('Snapshot name', { widths: [1000] }));
expectType<Promise<void | { [key: string]: any }>>(percySnapshot(browser, 'Snapshot name', { widths: [1000] }));

expectError(percySnapshot('Snapshot name', { foo: 'bar' }));
expectError(percySnapshot(browser, 'Snapshot name', { foo: 'bar' }));

expectType<Promise<void | { [key: string]: any }>>(percySnapshot(context, 'Snapshot name'));
expectType<Promise<void | { [key: string]: any }>>(percySnapshot(context, 'Snapshot name', { widths: [1000] }));
expectError(percySnapshot(context));

// Not a browser or a browsing context (also on WebdriverIO 8 and 9)
expectError(percySnapshot(42, 'Snapshot name'));
expectError(percySnapshot({ handle: 'window-1', type: 'tab' }, 'Snapshot name'));
expectError(percySnapshot('Snapshot name', 'not options'));
