/// <reference types="webdriverio" />
import { expectType, expectError } from 'tsd';
import percySnapshot from '.';

declare const browser: WebdriverIO.Browser;

expectError(percySnapshot());
expectError(percySnapshot(browser));

expectType<Promise<void | { [key: string]: any }>>(percySnapshot('Snapshot name'));
expectType<Promise<void | { [key: string]: any }>>(percySnapshot(browser, 'Snapshot name'));
expectType<Promise<void | { [key: string]: any }>>(percySnapshot('Snapshot name', { widths: [1000] }));
expectType<Promise<void | { [key: string]: any }>>(percySnapshot(browser, 'Snapshot name', { widths: [1000] }));

expectError(percySnapshot('Snapshot name', { foo: 'bar' }));
expectError(percySnapshot(browser, 'Snapshot name', { foo: 'bar' }));
