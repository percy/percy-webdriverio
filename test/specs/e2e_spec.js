/* global describe it browser */
const assert = require('assert');
const nock = require('nock');
const version = require('../../package.json').version;

const percy = require('../../dist/main.js');

class Nock {
  constructor(options) {
    this.options = options;
    this.capture = process.env.NOCK_REC === '1';
    if (this.capture) {
      nock.recorder.rec();
    }
  }
  finalizeSnapshot(options) {
    if (this.capture) {
      return;
    }
    const { snapshotId } = options;
    nock('https://percy.io:443', { encodedQueryParams: true })
      .post(`/api/v1/snapshots/${snapshotId}/finalize`, {})
      .reply(200, { success: true }, []);
  }
  finalizeBuild(options) {
    if (this.capture) {
      return;
    }
    const { buildId } = options;
    nock('https://percy.io:443', { encodedQueryParams: true })
      .post(`/api/v1/builds/${buildId}/finalize`, {})
      .reply(200, { success: true }, []);
  }
  snapshot(options) {
    if (this.capture) {
      return;
    }
    const { buildId, snapshotId } = options;
    const resources = options.resources.map(r => ({
      type: 'resources',
      id: r.id,
      attributes: {
        'resource-url': r.url,
        mimetype: r.mimetype,
        'is-root': r.root ? true : null,
      },
    }));
    const missingResources = options.missing.map(sha => ({ type: 'resources', id: sha }));

    nock('https://percy.io:443', { encodedQueryParams: true })
      .post(`/api/v1/builds/${buildId}/snapshots/`, {
        data: {
          type: 'snapshots',
          attributes: {
            name: 'testPercy',
            'enable-javascript': null,
            widths: null,
            'minimum-height': null,
          },
          relationships: {
            resources: {
              data: resources,
            },
          },
        },
      })
      .reply(
        201,
        {
          data: {
            type: 'snapshots',
            id: snapshotId,
            attributes: { name: 'testPercy' },
            links: { self: `/api/v1/snapshots/${snapshotId}` },
            relationships: {
              build: {
                links: {
                  self: `/api/v1/snapshots/${snapshotId}/relationships/build`,
                  related: `/api/v1/snapshots/${snapshotId}/build`,
                },
              },
              screenshots: {
                links: {
                  self: `/api/v1/snapshots/${snapshotId}/relationships/screenshots`,
                  related: `/api/v1/snapshots/${snapshotId}/screenshots`,
                },
              },
              'missing-resources': {
                links: {
                  self: `/api/v1/snapshots/${snapshotId}/relationships/missing-resources`,
                  related: `/api/v1/snapshots/${snapshotId}/missing-resources`,
                },
                data: missingResources,
              },
            },
          },
          included: [],
        },
        [],
      );
  }
  startBuild(options) {
    if (this.capture) {
      return;
    }
    const { buildId } = options;
    const resources = (options.resources || []).map(r => ({
      type: 'resources',
      id: r.id,
      attributes: {
        'resource-url': r.url,
        mimetype: r.mimetype,
        'is-root': r.root ? true : null,
      },
    }));
    const missingResources = (options.missing || []).map(sha => ({ type: 'resources', id: sha }));
    nock('https://percy.io:443', { encodedQueryParams: true })
      .post('/api/v1/projects/dummy-repo/dummy-project/builds/', {
        data: {
          type: 'builds',
          attributes: { branch: 'master' },
          relationships: { resources: { data: resources } },
        },
      })
      .matchHeader('User-Agent', new RegExp(`percy-webdriverio ${version}`))
      .reply(
        201,
        {
          data: {
            type: 'builds',
            id: buildId,
            attributes: {
              branch: 'master',
              'build-number': 113,
              'web-url': `https://percy.io/dummy-repo/dummy-project/builds/${buildId}`,
              'user-agent': `Percy/v1 percy-webdriverio ${version} percy-js/2.1.3 (node)`,
            },
            links: { self: `/api/v1/builds/${buildId}` },
            relationships: {
              snapshots: { links: { related: `/api/v1/builds/${buildId}/snapshots` } },
              'missing-resources': {
                links: { related: `/api/v1/builds/${buildId}/missing-resources` },
                data: missingResources,
              },
            },
            meta: { 'finalize-link': `/api/v1/builds/${buildId}/finalize` },
          },
          included: [],
        },
        [],
      );
  }
}

before(() => {
  // sync_percy_createBuild is only needed because percy.createBuild is async (returns a promise),
  // and we use addCommand to make it sync
  browser.addCommand('sync_percy_createBuild', function async(assetLoaders) {
    return percy.createBuild(assetLoaders);
  });
  browser.addCommand('sync_percy_finalizeBuild', function async() {
    return percy.finalizeBuild();
  });
});

describe('WDIO with percy', () => {
  it('will not smoke', () => {
    nock('https://percy.io:443').log(console.log); // eslint-disable-line no-console
    const buildId = '2967283';
    const snapshotId = '9499661';
    const pageSHA = '2733e50faa4486da67da7506edd34d6724b4fe7983f4b7d1015b62d228840e5e';

    const nmock = new Nock();
    nmock.startBuild({ buildId });

    nmock.snapshot({
      resources: [{ id: pageSHA, url: '/', mimetype: 'text/html', root: true }],
      name: 'testPercy',
      missing: [],
      snapshotId,
      buildId,
    });

    nmock.finalizeSnapshot({ snapshotId });
    nmock.finalizeBuild({ buildId });

    const staticServerPort = 4567;
    percy.__reinit(browser);
    browser.sync_percy_createBuild();
    browser.url(`localhost:${staticServerPort}/fixtures/index.html`);
    assert.equal(browser.getTitle(), 'Hello world');
    browser.percySnapshot('testPercy');
    browser.sync_percy_finalizeBuild();
  });

  it('will not smoke with asset loader', () => {
    nock('https://percy.io:443').log(console.log); // eslint-disable-line no-console
    const buildId = '2967280';
    const snapshotId = '9499661';
    const pageSHA = '2733e50faa4486da67da7506edd34d6724b4fe7983f4b7d1015b62d228840e5e';
    const appJSSHA = '2055335bf4ad0140b23abf5695f57dc9b9b336edf69b97511946a9beafa75cc6';
    const appCSSSHA = 'ca00f77658989e0d71e3dfa552d33422cf28b12a15ba1c0195152845243e0d91';

    const nmock = new Nock();
    nmock.startBuild({
      buildId,
      resources: [
        { id: appCSSSHA, url: '/app.css', mimetype: 'text/css' },
        { id: appJSSHA, url: '/app.js', mimetype: 'application/javascript' },
      ],
      missing: [appCSSSHA],
    });
    nmock.snapshot({
      resources: [{ id: pageSHA, url: '/', mimetype: 'text/html', root: true }],
      name: 'testPercy',
      missing: [pageSHA],
      snapshotId,
      buildId,
    });
    nock('https://percy.io:443', { encodedQueryParams: true })
      .post(`/api/v1/builds/${buildId}/resources/`, {
        data: {
          type: 'resources',
          id: appCSSSHA,
          attributes: {
            'base64-content': 'ZGl2LnJlZCB7CiAgYm9yZGVyOiAxcHggc29saWQgcmVkOwp9Cg==',
          },
        },
      })
      .reply(200, {});
    nock('https://percy.io:443', { encodedQueryParams: true })
      .post(`/api/v1/builds/${buildId}/resources/`, {
        data: {
          type: 'resources',
          id: pageSHA,
          attributes: {
            'base64-content':
              'PGh0bWwgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzE5OTkveGh0bWwiPjxoZWFkPjwvaGVhZD48Ym9keT48cHJlIHN0eWxlPSJ3b3JkLXdyYXA6IGJyZWFrLXdvcmQ7IHdoaXRlLXNwYWNlOiBwcmUtd3JhcDsiPjwvcHJlPjwvYm9keT48L2h0bWw+',
          },
        },
      })
      .reply(200, {});

    nmock.finalizeSnapshot({ snapshotId });
    nmock.finalizeBuild({ buildId });

    const staticServerPort = 4567;
    percy.__reinit(browser);
    browser.sync_percy_createBuild([
      percy.assetLoader('filesystem', { buildDir: '../fixtures/assets' }),
    ]);
    browser.url(`localhost:${staticServerPort}/fixtures/index.html`);
    assert.equal(browser.getTitle(), 'Hello world');
    browser.percySnapshot('testPercy');
    browser.sync_percy_finalizeBuild();
  });
});

describe('corner cases', () => {
  it('will raise error if same snapshot name used', () => {
    nock('https://percy.io:443').log(console.log); // eslint-disable-line no-console
    const buildId = '2967283';
    const snapshotId = '9499661';
    const pageSHA = '2733e50faa4486da67da7506edd34d6724b4fe7983f4b7d1015b62d228840e5e';

    const nmock = new Nock();
    nmock.startBuild({ buildId });

    nmock.snapshot({
      resources: [{ id: pageSHA, url: '/', mimetype: 'text/html', root: true }],
      name: 'testPercy',
      missing: [],
      snapshotId,
      buildId,
    });

    nmock.finalizeSnapshot({ snapshotId });
    nmock.finalizeBuild({ buildId });

    const staticServerPort = 4567;
    percy.__reinit(browser);
    browser.sync_percy_createBuild();
    browser.url(`localhost:${staticServerPort}/fixtures/index.html`);
    assert.equal(browser.getTitle(), 'Hello world');
    browser.percySnapshot('testPercy');
    browser.sync_percy_finalizeBuild();
  });
});

describe('filesystem asset loader', () => {
  it('will use mountPath as root for assets', () => {
    nock('https://percy.io:443').log(console.log); // eslint-disable-line no-console
    const buildId = '2967281';
    const snapshotId = '94996612';
    const pageSHA = '2733e50faa4486da67da7506edd34d6724b4fe7983f4b7d1015b62d228840e5e';
    const appJSSHA = '2055335bf4ad0140b23abf5695f57dc9b9b336edf69b97511946a9beafa75cc6';
    const appCSSSHA = 'ca00f77658989e0d71e3dfa552d33422cf28b12a15ba1c0195152845243e0d91';

    const nmock = new Nock();
    nmock.startBuild({
      buildId,
      resources: [
        { id: appCSSSHA, url: '/foo/app.css', mimetype: 'text/css' },
        { id: appJSSHA, url: '/foo/app.js', mimetype: 'application/javascript' },
      ],
    });
    nmock.snapshot({
      resources: [{ id: pageSHA, url: '/', mimetype: 'text/html', root: true }],
      name: 'testPercy',
      missing: [],
      snapshotId,
      buildId,
    });
    nmock.finalizeSnapshot({ snapshotId });
    nmock.finalizeBuild({ buildId });

    const staticServerPort = 4567;
    percy.__reinit(browser);
    browser.sync_percy_createBuild([
      percy.assetLoader('filesystem', { buildDir: '../fixtures/assets', mountPath: '/foo' }),
    ]);
    browser.url(`localhost:${staticServerPort}/fixtures/index.html`);
    assert.equal(browser.getTitle(), 'Hello world');
    browser.percySnapshot('testPercy');
    browser.sync_percy_finalizeBuild();
  });

  it('will build correct resourceUrls when mountPath is /', () => {
    nock('https://percy.io:443').log(console.log); // eslint-disable-line no-console
    const buildId = '2967281';
    const snapshotId = '94996612';
    const pageSHA = '2733e50faa4486da67da7506edd34d6724b4fe7983f4b7d1015b62d228840e5e';
    const appJSSHA = '2055335bf4ad0140b23abf5695f57dc9b9b336edf69b97511946a9beafa75cc6';
    const appCSSSHA = 'ca00f77658989e0d71e3dfa552d33422cf28b12a15ba1c0195152845243e0d91';

    const nmock = new Nock();
    nmock.startBuild({
      buildId,
      resources: [
        { id: appCSSSHA, url: '/app.css', mimetype: 'text/css' },
        { id: appJSSHA, url: '/app.js', mimetype: 'application/javascript' },
      ],
    });
    nmock.snapshot({
      resources: [{ id: pageSHA, url: '/', mimetype: 'text/html', root: true }],
      name: 'testPercy',
      missing: [],
      snapshotId,
      buildId,
    });
    nmock.finalizeSnapshot({ snapshotId });
    nmock.finalizeBuild({ buildId });

    const staticServerPort = 4567;
    percy.__reinit(browser);
    browser.sync_percy_createBuild([
      percy.assetLoader('filesystem', { buildDir: '../fixtures/assets', mountPath: '/' }),
    ]);
    browser.url(`localhost:${staticServerPort}/fixtures/index.html`);
    browser.percySnapshot('testPercy');
    browser.sync_percy_finalizeBuild();
  });

  it('will raise if directory does not exists', () => {
    nock('https://percy.io:443').log(console.log); // eslint-disable-line no-console
    new Nock();

    percy.__reinit(browser);
    assert.throws(() => {
      browser.sync_percy_createBuild([
        percy.assetLoader('filesystem', { buildDir: '../fixtures/no_such_dir', mountPath: '/foo' }),
      ]);
    }, /no such file or directory, stat '.+[/\\]fixtures[/\\]no_such_dir'/);
    assert.throws(() => {
      browser.sync_percy_finalizeBuild();
    }, /createBuild needs to be called in onPrepare/);
  });
});
