var assert = require('assert');
var nock = require('nock');
var version = require('../../package.json').version;

describe('WDIO with percy', function() {
  it('will not smoke', function() {
    nock('https://percy.io:443').log(console.log);
    const buildId = "296728";
    const snapshotId = "9499661";
    const pageSHA = "2733e50faa4486da67da7506edd34d6724b4fe7983f4b7d1015b62d228840e5e";
    nock('https://percy.io:443', {"encodedQueryParams":true})
      .post('/api/v1/repos/dummy-repo/dummy-project/builds/',
        {"data":{
          "type":"builds",
            "attributes": {"branch":"master"},
            "relationships":{"resources":{"data":[]}}
          }}).matchHeader('User-Agent', new RegExp(`percy-webdriverio ${version}`))
      .reply(201, {
        "data":{
          "type":"builds",
          "id":buildId,
          "attributes": {
            "branch":"master",
            "build-number":113,
            "web-url":`https://percy.io/dummy-repo/dummy-project/builds/${buildId}`,
            "user-agent":`Percy/v1 percy-webdriverio ${version} percy-js/2.1.3 (node)`},
          "links":{"self":`/api/v1/builds/${buildId}`},
          "relationships":
            {
              "snapshots":
                {"links":{"self":`/api/v1/builds/${buildId}/relationships/snapshots`,"related":`/api/v1/builds/${buildId}/snapshots`}},
              "missing-resources":
                {"links":{"self":`/api/v1/builds/${buildId}/relationships/missing-resources`,"related":`/api/v1/builds/${buildId}/missing-resources`},"data":[]}
            },
          "meta":
            { "finalize-link":`/api/v1/builds/${buildId}/finalize`}
          },
        "included":
          [
            {"type":"projects","id":"1049",
              "attributes":{"name":"webdriver-io-test","slug":"webdriver-io-test","full-slug":"mfazekas/webdriver-io-test","is-enabled":true,"diff-base":"automatic"},
              "links":{"self":"/api/v1/projects/mfazekas/webdriver-io-test"}},
            {"type":"builds","id":"293085","attributes":{"branch":"master","build-number":111,"web-url":"https://percy.io/mfazekas/webdriver-io-test/builds/293085","state":"finished","is-pull-request":false,"pull-request-number":null,"pull-request-title":null,"user-agent":"Percy/v1 percy-js/2.1.3 (node/v6.11.0)"},"links":{"self":"/api/v1/builds/293085"},"relationships":{"project":{"links":{"self":"/api/v1/builds/293085/relationships/project","related":"/api/v1/builds/293085/project"},"data":{"type":"projects","id":"1049"}},"commit":{"links":{"self":"/api/v1/builds/293085/relationships/commit","related":"/api/v1/builds/293085/commit"},"data":null},"repo":{"links":{"self":"/api/v1/builds/293085/relationships/repo","related":"/api/v1/builds/293085/repo"},"data":null},"base-build":{"links":{"self":"/api/v1/builds/293085/relationships/base-build","related":"/api/v1/builds/293085/base-build"}},"approved-by":{"links":{"self":"/api/v1/builds/293085/relationships/approved-by","related":"/api/v1/builds/293085/approved-by"}},"snapshots":{"links":{"self":"/api/v1/builds/293085/relationships/snapshots","related":"/api/v1/builds/293085/snapshots"}},"comparisons":{"links":{"self":"/api/v1/builds/293085/relationships/comparisons","related":"/api/v1/builds/293085/comparisons"}},"missing-resources":{"links":{"self":"/api/v1/builds/293085/relationships/missing-resources","related":"/api/v1/builds/293085/missing-resources"}}},"meta":{"finalize-link":"/api/v1/builds/293085/finalize","approve-link":"/api/v1/builds/293085/approve"}}]}, []);

        nock('https://percy.io:443', {"encodedQueryParams":true})
          .post(`/api/v1/builds/${buildId}/snapshots/`,
            {"data":
              {"type":"snapshots",
                "attributes":{"name":"testPercy","enable-javascript":null,"widths":null,"minimum-height":null},
                "relationships":{"resources":
                  {"data":[{"type":"resources","id":pageSHA,"attributes":{"resource-url":"/","mimetype":"text/html","is-root":true}}]
              }}}})
          .reply(201, {"data":
            {
              "type":"snapshots",
              "id":snapshotId,
              "attributes":{"name":"testPercy"},
              "links":{"self":`/api/v1/snapshots/${snapshotId}`},
              "relationships":{
                "build":{"links":{"self":`/api/v1/snapshots/${snapshotId}/relationships/build`,"related":`/api/v1/snapshots/${snapshotId}/build`}},
                "screenshots":{"links":{"self":`/api/v1/snapshots/${snapshotId}/relationships/screenshots`,"related":`/api/v1/snapshots/${snapshotId}/screenshots`}},
                "missing-resources":{"links":{"self":`/api/v1/snapshots/${snapshotId}/relationships/missing-resources`,"related":`/api/v1/snapshots/${snapshotId}/missing-resources`},"data":[]}}},
              "included":[]}, []);

        nock('https://percy.io:443', {"encodedQueryParams":true})
          .post(`/api/v1/snapshots/${snapshotId}/finalize`, {})
          .reply(200, {"success":true}, []);
    var staticServerPort = 4567;
    browser.url(`localhost:${staticServerPort}/fixtures/index.html`);
    assert.equal(browser.getTitle(), 'Hello world');
    browser.percySnapshot('testPercy');
  });

  it('will not smoke with asset loader', function() {
    nock('https://percy.io:443').log(console.log);
    const capture = (process.env.NOCK_REC === "1");
    if (capture) {
      nock.recorder.rec();
    } else {
      const buildId = "296728";
      const snapshotId = "9499661";
      const pageSHA = "2733e50faa4486da67da7506edd34d6724b4fe7983f4b7d1015b62d228840e5e";
      const appJSSHA = "3188aaba4042aa18aa859ddfe17e2d7f138702f9a998d73fd641bef45622ba5b";
      const appCSSSHA = "ca00f77658989e0d71e3dfa552d33422cf28b12a15ba1c0195152845243e0d91";
      nock('https://percy.io:443', {"encodedQueryParams":true})
        .post('/api/v1/repos/dummy-repo/dummy-project/builds/',
          {"data":{
            "type":"builds",
              "attributes": {"branch":"master"},
              "relationships":{"resources":{"data":[]}}
            }})
        .reply(201, {
          "data":{
            "type":"builds",
            "id":buildId,
            "attributes": {
              "branch":"master",
              "build-number":113,
              "web-url":`https://percy.io/dummy-repo/dummy-project/builds/${buildId}`,
              "user-agent":"Percy/v1 percy-js/2.1.3 (node/v6.11.0)"},
            "links":{"self":`/api/v1/builds/${buildId}`},
            "relationships":
              {
                "snapshots":
                  {"links":{"self":`/api/v1/builds/${buildId}/relationships/snapshots`,"related":`/api/v1/builds/${buildId}/snapshots`}},
                "missing-resources":
                  {"links":{"self":`/api/v1/builds/${buildId}/relationships/missing-resources`,"related":`/api/v1/builds/${buildId}/missing-resources`},
                   "data":[]}
              },
            "meta":
              { "finalize-link":`/api/v1/builds/${buildId}/finalize`}
            },
          "included":
            [
              {"type":"projects","id":"1049",
                "attributes":{"name":"webdriver-io-test","slug":"webdriver-io-test","full-slug":"mfazekas/webdriver-io-test","is-enabled":true,"diff-base":"automatic"},
                "links":{"self":"/api/v1/projects/mfazekas/webdriver-io-test"}},
              {"type":"builds","id":"293085","attributes":{"branch":"master","build-number":111,"web-url":"https://percy.io/mfazekas/webdriver-io-test/builds/293085","state":"finished","is-pull-request":false,"pull-request-number":null,"pull-request-title":null,"user-agent":"Percy/v1 percy-js/2.1.3 (node/v6.11.0)"},"links":{"self":"/api/v1/builds/293085"},"relationships":{"project":{"links":{"self":"/api/v1/builds/293085/relationships/project","related":"/api/v1/builds/293085/project"},"data":{"type":"projects","id":"1049"}},"commit":{"links":{"self":"/api/v1/builds/293085/relationships/commit","related":"/api/v1/builds/293085/commit"},"data":null},"repo":{"links":{"self":"/api/v1/builds/293085/relationships/repo","related":"/api/v1/builds/293085/repo"},"data":null},"base-build":{"links":{"self":"/api/v1/builds/293085/relationships/base-build","related":"/api/v1/builds/293085/base-build"}},"approved-by":{"links":{"self":"/api/v1/builds/293085/relationships/approved-by","related":"/api/v1/builds/293085/approved-by"}},"snapshots":{"links":{"self":"/api/v1/builds/293085/relationships/snapshots","related":"/api/v1/builds/293085/snapshots"}},"comparisons":{"links":{"self":"/api/v1/builds/293085/relationships/comparisons","related":"/api/v1/builds/293085/comparisons"}},"missing-resources":{"links":{"self":"/api/v1/builds/293085/relationships/missing-resources","related":"/api/v1/builds/293085/missing-resources"}}},"meta":{"finalize-link":"/api/v1/builds/293085/finalize","approve-link":"/api/v1/builds/293085/approve"}}]}, []);

          nock('https://percy.io:443', {"encodedQueryParams":true})
            .post(`/api/v1/builds/${buildId}/snapshots/`,
              {"data":
                {"type":"snapshots",
                  "attributes":{"name":"testPercy","enable-javascript":null,"widths":null,"minimum-height":null},
                  "relationships":{"resources":
                    {"data":
                      [
                        {"type":"resources","id":appCSSSHA,"attributes":{"resource-url":"/app.css","mimetype":"text/css","is-root":null}},
                        {"type":"resources","id":appJSSHA,"attributes":{"resource-url":"/app.js","mimetype":"application/javascript","is-root":null}},
                        {"type":"resources","id":pageSHA,"attributes":{"resource-url":"/","mimetype":"text/html","is-root":true}},
                      ]
                }}}})
            .reply(201, {"data":
              {
                "type":"snapshots",
                "id":snapshotId,
                "attributes":{"name":"testPercy"},
                "links":{"self":`/api/v1/snapshots/${snapshotId}`},
                "relationships":{
                  "build":{"links":{"self":`/api/v1/snapshots/${snapshotId}/relationships/build`,"related":`/api/v1/snapshots/${snapshotId}/build`}},
                  "screenshots":{"links":{"self":`/api/v1/snapshots/${snapshotId}/relationships/screenshots`,"related":`/api/v1/snapshots/${snapshotId}/screenshots`}},
                  "missing-resources":{"links":{"self":`/api/v1/snapshots/${snapshotId}/relationships/missing-resources`,"related":`/api/v1/snapshots/${snapshotId}/missing-resources`},
                    "data":[
                      {"type":"resources","id":appCSSSHA},
                      {"type":"resources","id":pageSHA}]}
                }
              },
              "included":[]}, []);

          nock('https://percy.io:443', {"encodedQueryParams":true})
            .post(`/api/v1/builds/${buildId}/resources/`, {"data":{"type":"resources","id":appCSSSHA,"attributes":{"base64-content":"ZGl2LnJlZCB7CiAgYm9yZGVyOiAxcHggc29saWQgcmVkOwp9Cg=="}}}).reply(200, {});
          nock('https://percy.io:443', {"encodedQueryParams":true})
            .post(`/api/v1/builds/${buildId}/resources/`, {"data":{"type":"resources","id":pageSHA,"attributes":{"base64-content":"PCFET0NUWVBFIGh0bWw+PGh0bWwgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzE5OTkveGh0bWwiPjxoZWFkPgogIDx0aXRsZT5IZWxsbyB3b3JsZDwvdGl0bGU+CjwvaGVhZD4KPGJvZHk+CiAgPGI+SGVsbG8gd29ybGQ8L2I+CiAgPGRpdiBjbGFzcz0icmVkIj5Gb288L2Rpdj4KCgo8L2JvZHk+PC9odG1sPg=="}}}).
            reply(200, {});

          nock('https://percy.io:443', {"encodedQueryParams":true})
            .post(`/api/v1/snapshots/${snapshotId}/finalize`, {})
            .reply(200, {"success":true}, []);


    }
    var staticServerPort = 4567;
    browser.percyUseAssetLoader('filesystem', {buildDir: '../fixtures/assets'});
    browser.url(`localhost:${staticServerPort}/fixtures/index.html`);
    assert.equal(browser.getTitle(), 'Hello world');
    browser.percySnapshot('testPercy');
  });

});
