/* global describe it browser */
const assert = require('assert');
const nock = require('nock');
const version = require('../../package.json').version;

function nockFinalizeSnapshot(options) {
  const { snapshotId } = options;
  nock('https://percy.io:443', { encodedQueryParams: true })
    .post(`/api/v1/snapshots/${snapshotId}/finalize`, {})
    .reply(200, { success: true }, []);
}

function nockFinalizeBuild(options) {
  const { buildId } = options;
  nock('https://percy.io:443', { encodedQueryParams: true })
    .post(`/api/v1/builds/${buildId}/finalize`, {})
    .reply(200, { success: true }, []);
}

function nockSnapshot(options) {
  const { buildId, snapshotId } = options;
  const resources = options.resources.map((r) => {
    return {
      type: 'resources',
      id: r.id,
      attributes: { 'resource-url': r.url, mimetype: r.mimetype, 'is-root': (r.root ? true : null) } };
  });
  const missingResources = options.missing.map((sha) => { return { type: 'resources', id: sha }; });
  nock('https://percy.io:443', { encodedQueryParams: true })
    .post(`/api/v1/builds/${buildId}/snapshots/`, {
      data: {
        type: 'snapshots',
        attributes: { name: 'testPercy', 'enable-javascript': null, widths: null, 'minimum-height': null },
        relationships: {
          resources: {
            data: resources
          } } } })
    .reply(201, {
      data: {
        type: 'snapshots',
        id: snapshotId,
        attributes: { name: 'testPercy' },
        links: { self: `/api/v1/snapshots/${snapshotId}` },
        relationships: {
          build: { links: { self: `/api/v1/snapshots/${snapshotId}/relationships/build`, related: `/api/v1/snapshots/${snapshotId}/build` } },
          screenshots: { links: { self: `/api/v1/snapshots/${snapshotId}/relationships/screenshots`, related: `/api/v1/snapshots/${snapshotId}/screenshots` } },
          'missing-resources': { links: { self: `/api/v1/snapshots/${snapshotId}/relationships/missing-resources`, related: `/api/v1/snapshots/${snapshotId}/missing-resources` },
            data: missingResources }
        }
      },
      included: [] }, []);
}

function nockStartBuild(options) {
  const { buildId } = options;
  nock('https://percy.io:443', { encodedQueryParams: true })
    .post('/api/v1/repos/dummy-repo/dummy-project/builds/',
    { data: {
      type: 'builds',
      attributes: { branch: 'master' },
      relationships: { resources: { data: [] } }
    } }).matchHeader('User-Agent', new RegExp(`percy-webdriverio ${version}`))
    .reply(201, {
      data: {
        type: 'builds',
        id: buildId,
        attributes: {
          branch: 'master',
          'build-number': 113,
          'web-url': `https://percy.io/dummy-repo/dummy-project/builds/${buildId}`,
          'user-agent': `Percy/v1 percy-webdriverio ${version} percy-js/2.1.3 (node)` },
        links: { self: `/api/v1/builds/${buildId}` },
        relationships: {
          snapshots: { links: { related: `/api/v1/builds/${buildId}/snapshots` } },
          'missing-resources': { links: { related: `/api/v1/builds/${buildId}/missing-resources` },
            data: [] }
        },
        meta: { 'finalize-link': `/api/v1/builds/${buildId}/finalize` }
      },
      included: [] }, []);
}

describe('WDIO with percy', () => {
  it('will not smoke', () => {
    nock('https://percy.io:443').log(console.log); // eslint-disable-line no-console
    const buildId = '296728';
    const snapshotId = '9499661';
    const pageSHA = '2733e50faa4486da67da7506edd34d6724b4fe7983f4b7d1015b62d228840e5e';

    nockStartBuild({ buildId });

    nockSnapshot({
      resources: [
        { id: pageSHA, url: '/', mimetype: 'text/html', root: true }],
      name: 'testPercy',
      missing: [],
      snapshotId,
      buildId
    });

    nockFinalizeSnapshot({ snapshotId });
    nockFinalizeBuild({ buildId });

    const staticServerPort = 4567;
    browser.url(`localhost:${staticServerPort}/fixtures/index.html`);
    assert.equal(browser.getTitle(), 'Hello world');
    browser.percySnapshot('testPercy');
    browser.percyFinalizeBuild();
  });

  it('will not smoke with asset loader', () => {
    nock('https://percy.io:443').log(console.log); // eslint-disable-line no-console
    const capture = (process.env.NOCK_REC === '1');
    if (capture) {
      nock.recorder.rec();
    } else {
      const buildId = '296728';
      const snapshotId = '9499661';
      const pageSHA = '2733e50faa4486da67da7506edd34d6724b4fe7983f4b7d1015b62d228840e5e';
      const appJSSHA = '3188aaba4042aa18aa859ddfe17e2d7f138702f9a998d73fd641bef45622ba5b';
      const appCSSSHA = 'ca00f77658989e0d71e3dfa552d33422cf28b12a15ba1c0195152845243e0d91';

      nockStartBuild({ buildId });
      nockSnapshot({
        resources: [
          { id: appCSSSHA, url: '/app.css', mimetype: 'text/css' },
          { id: appJSSHA, url: '/app.js', mimetype: 'application/javascript' },
          { id: pageSHA, url: '/', mimetype: 'text/html', root: true }],
        name: 'testPercy',
        missing: [appCSSSHA, pageSHA],
        snapshotId,
        buildId
      });
      nock('https://percy.io:443', { encodedQueryParams: true })
        .post(`/api/v1/builds/${buildId}/resources/`, { data: {
          type: 'resources',
          id: appCSSSHA,
          attributes: {
            'base64-content': 'ZGl2LnJlZCB7CiAgYm9yZGVyOiAxcHggc29saWQgcmVkOwp9Cg==' } } })
        .reply(200, {});
      nock('https://percy.io:443', { encodedQueryParams: true })
        .post(`/api/v1/builds/${buildId}/resources/`, { data: {
          type: 'resources',
          id: pageSHA,
          attributes: {
            'base64-content': 'PCFET0NUWVBFIGh0bWw+PGh0bWwgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzE5OTkveGh0bWwiPjxoZWFkPgogIDx0aXRsZT5IZWxsbyB3b3JsZDwvdGl0bGU+CjwvaGVhZD4KPGJvZHk+CiAgPGI+SGVsbG8gd29ybGQ8L2I+CiAgPGRpdiBjbGFzcz0icmVkIj5Gb288L2Rpdj4KCgo8L2JvZHk+PC9odG1sPg==' } } })
        .reply(200, {});

      nockFinalizeSnapshot({ snapshotId });
      nockFinalizeBuild({ buildId });
    }
    const staticServerPort = 4567;
    browser.percyUseAssetLoader('filesystem', { buildDir: '../fixtures/assets' });
    browser.url(`localhost:${staticServerPort}/fixtures/index.html`);
    assert.equal(browser.getTitle(), 'Hello world');
    browser.percySnapshot('testPercy');
    browser.percyFinalizeBuild();
  });
});
