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

    let reply = options.reply || [
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
    ];

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
      .reply(reply[0], reply[1], []);
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
          attributes: {
            branch: 'master',
            'target-branch': null,
            'commit-sha': 'abc',
            'pull-request-number': '100',
            'parallel-nonce': null,
            'parallel-total-shards': null,
          },
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
              'user-agent': `Percy/v1 percy-webdriverio ${version} percy-js/2.5.0 (node)`,
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

function assertLogs(block, pattern) {
  let logMessages = [];
  browser.logger.setupWriteStream({
    logOutput: {
      write: msg => {
        logMessages.push(msg);
      },
      writable: true,
    },
  });
  block();
  browser.logger.setupWriteStream({});
  if (!logMessages.some(msg => msg.match(pattern))) {
    assert.fail(`did not log message matching: ${pattern}`);
  }
}

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
              'PCFET0NUWVBFIGh0bWw+PGh0bWwgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzE5OTkveGh0bWwiPjxoZWFkPgogIDx0aXRsZT5IZWxsbyB3b3JsZDwvdGl0bGU+CjwvaGVhZD4KPGJvZHk+CiAgPGI+SGVsbG8gd29ybGQ8L2I+CiAgPGRpdiBjbGFzcz0icmVkIj5Gb288L2Rpdj4KCgo8L2JvZHk+PC9odG1sPg==',
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
    const pageOtherSHA = '6882330355e3a63e167595a58545fde48d3e815c6a1e5a12e7ba3922b3caa658';

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

    const staticServerPort = 4567;
    percy.__reinit(browser);
    browser.sync_percy_createBuild();
    browser.url(`localhost:${staticServerPort}/fixtures/index.html`);
    assert.equal(browser.getTitle(), 'Hello world');
    browser.percySnapshot('testPercy');

    browser.url(`localhost:${staticServerPort}/fixtures/other.html`);

    nmock.snapshot({
      resources: [{ id: pageOtherSHA, url: '/', mimetype: 'text/html', root: true }],
      name: 'testPercy',
      missing: [],
      snapshotId,
      buildId,
      reply: [
        400,
        {
          errors: [
            { status: 'bad_request' },
            {
              source: { pointer: '/data/attributes/base' },
              detail:
                "The name of each snapshot must be unique, and this name already exists in the build: 'testPercy' -- You can fix this by passing a 'name' param when creating the snapshot. See the docs for more info on identifying snapshots for your specific client: https://percy.io/docs",
            },
          ],
        },
      ],
    });
    nmock.finalizeBuild({ buildId });
    nmock.finalizeSnapshot({ snapshotId });

    assertLogs(() => browser.percySnapshot('testPercy'), /name of each snapshot must be unique/);
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
