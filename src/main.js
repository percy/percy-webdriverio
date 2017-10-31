import PercyClient from 'percy-client';
import Environment from 'percy-client/dist/environment';

import { version } from '../package.json';

import FileSystemAssetLoader from './fileSystemAssetLoader';

function parseMissingResources(response) {
  return (
    (response.body.data &&
      response.body.data.relationships &&
      response.body.data.relationships['missing-resources'] &&
      response.body.data.relationships['missing-resources'].data) ||
    []
  );
}

function gatherBuildResources(assetLoaders, percyClient) {
  return new Promise((resolve, reject) => {
    Promise.all(assetLoaders.map(loader => loader.findBuildResources(percyClient)))
      .then(listOfResources => {
        resolve([].concat(...listOfResources));
      })
      .catch(err => {
        // eslint-disable-next-line no-console
        console.log('[percy webdriverio] gatherBuildResources.XXX.reject', err);
        reject(err);
      });
  });
}

function uploadMissingResources(percyClient, buildId, response, shaToResource) {
  const missingResources = parseMissingResources(response);
  const promises = [];
  if (missingResources.length > 0) {
    for (const missingResource of missingResources) {
      promises.push(
        percyClient
          .uploadResource(buildId, shaToResource[missingResource.id].content)
          .then(() => {})
          // eslint-disable-next-line no-console
          .catch(err => console.log('[percy webdriverio] uploadMissingResources', err)),
      );
    }
  }
  return Promise.all(promises);
}

class WebdriverPercy {
  constructor(browser) {
    if (!browser) {
      throw new Error('A WebdriverIO instance is needed to initialise percy-webdriverio');
    }
    browser.percy = { assetLoaders: [] };

    const enabled = isEnabled();
    const token = process.env.PERCY_TOKEN;
    const apiUrl = process.env.PERCY_API;
    const clientInfo = `percy-webdriverio ${version}`;
    browser.percy.environment = new Environment(process.env);
    browser.percy.percyClient = new PercyClient({ token, apiUrl, clientInfo });

    // adding `async` as function name disables the synchronous behavior of WebdriverIO commands
    // eslint-disable-next-line prefer-arrow-callback
    browser.addCommand('__percyReinit', function async() {
      browser.percy = { assetLoaders: [] };
      browser.percy.environment = new Environment(process.env);
      browser.percy.percyClient = new PercyClient({ token, apiUrl, clientInfo });
    });

    browser.addCommand('percyFinalizeBuild', () => {
      throw new Error(
        '[percy] browser.percyFinalizeBuild is deprecated, see https://github.com/percy/percy-webdriverio/pull/19',
      );
    });

    browser.addCommand('percyUseAssetLoader', () => {
      throw new Error(
        '[percy] browser.percyUseAssetLoader is deprecated, see https://github.com/percy/percy-webdriverio/pull/19',
      );
    });

    browser.addCommand('percySnapshot', function async(name, options = {}) {
      if (!enabled) {
        browser.logger.info('Percy disabled, skipping screenshot: ' + name);
        return;
      }
      const percy = browser.percy;
      const browserInstance = this;
      const percyClient = percy.percyClient;
      return new Promise((resolve, reject) => {
        Promise.resolve(browserInstance.getSource())
          .then(source => {
            percyBuildId('percySnapshot')
              .then(buildId => {
                const rootResource = percyClient.makeResource({
                  resourceUrl: '/',
                  content: source,
                  isRoot: true,
                  mimetype: 'text/html',
                });
                percyClient
                  .createSnapshot(buildId, [rootResource], {
                    name,
                    widths: options.widths,
                    enableJavaScript: options.enableJavaScript,
                    minimumHeight: options.minimumHeight,
                  })
                  .then(snapshotResponse => {
                    const snapshotId = snapshotResponse.body.data.id;
                    const shaToResource = {};
                    shaToResource[rootResource.sha] = rootResource;
                    uploadMissingResources(percyClient, buildId, snapshotResponse, shaToResource)
                      .then(() => {
                        percyClient
                          .finalizeSnapshot(snapshotId)
                          .then(() => {
                            browser.logger.info('percy finalizeSnapshot');
                            resolve();
                          })
                          .catch(err => {
                            browser.logger.error(`percy finalizeSnapshot failed: ${err}`);
                            reject(err);
                          });
                      })
                      .catch(err => {
                        browser.logger.error(`percy uploadMissingResources failed: ${err}`);
                        reject(err);
                      });
                  })
                  .catch(err => {
                    browser.logger.error(`percy createSnapshot failed: ${err}`);
                    resolve();
                  });
              })
              .catch(err => {
                browser.logger.error(`percy snapshot failed to createBuild: ${err}`);
                reject(err);
              });
          })
          .catch(err => {
            browser.logger.error(`percy snapshot failed to get source from browser: ${err}`);
            reject(err);
          });
      });
    });
  }
}

export function init(webdriverInstance, options) {
  return new WebdriverPercy(webdriverInstance, options);
}

export function assetLoader(type, options) {
  switch (type) {
    case 'filesystem':
      return new FileSystemAssetLoader(options);
    default:
      throw new Error(`Unexpected asset loader type: ${type}`);
  }
}

function createPercyClient() {
  const token = process.env.PERCY_TOKEN;
  const apiUrl = process.env.PERCY_API;
  const clientInfo = `percy-webdriverio ${version}`;
  return new PercyClient({ token, apiUrl, clientInfo });
}

function isEnabled() {
  const hasRequiredVars = Boolean(process.env.PERCY_TOKEN) && Boolean(process.env.PERCY_PROJECT);
  const hasDisableVar = parseInt(process.env.PERCY_ENABLE) === 0;
  const hasForceEnable = parseInt(process.env.PERCY_ENABLE) === 1;
  return hasForceEnable || (hasRequiredVars && !hasDisableVar);
}

function logError(message) {
  console.log(`[percy] ${message}`); // eslint-disable-line no-console
}

function logInfo(message) {
  console.log(`[percy] ${message}`); // eslint-disable-line no-console
}

function percyBuildId(caller) {
  return new Promise((resolve, reject) => {
    if (process.env.PERCY_WEBDRIVERIO_BUILD === undefined) {
      reject(new Error(`[percy] ${caller}: createBuild needs to be called in onPrepare`));
    } else {
      resolve(process.env.PERCY_WEBDRIVERIO_BUILD);
    }
  });
}

export function finalizeBuild() {
  if (!isEnabled()) {
    return;
  }
  let percyClient = createPercyClient();
  return new Promise((resolve, reject) => {
    percyBuildId('finalizeBuild')
      .then(buildId => {
        percyClient
          .finalizeBuild(buildId)
          .then(() => {
            logInfo(`finalizedBuild[${buildId}]: ok`);
            resolve(true);
          })
          .catch(err => {
            logError(`finalizedBuild[${buildId}]: ${err}`);
            reject(err);
          });
      })
      .catch(err => {
        logError('finalizedBuild failed to get build id');
        reject(err);
      });
  });
}

export function __reinit(browser) {
  browser.__percyReinit();
  delete process.env.PERCY_WEBDRIVERIO_BUILD;
}

export function createBuild(assetLoaders) {
  if (!isEnabled()) {
    logInfo(
      'Percy disabled. Set the PERCY_TOKEN and PERCY_PROJECT and unset PERCY_ENABLE to re-enable Percy.',
    );
    return new Promise(resolve => {
      resolve(null);
    });
  }
  return new Promise((resolve, reject) => {
    let percyClient = createPercyClient();
    let environment = new Environment(process.env);
    gatherBuildResources(assetLoaders || [], percyClient)
      .then(resources => {
        percyClient
          .createBuild(environment.repo, { resources })
          .then(buildResponse => {
            const buildId = buildResponse.body.data.id;
            const shaToResource = {};
            for (const resource of resources) {
              shaToResource[resource.sha] = resource;
            }
            uploadMissingResources(percyClient, buildId, buildResponse, shaToResource)
              .then(() => {
                process.env.PERCY_WEBDRIVERIO_BUILD = buildId;
                resolve(buildId);
              })
              .catch(err => {
                logError(`createBuild: failed to upload resources: ${err}`);
                reject(err);
              });
          })
          .catch(err => {
            logError(`createBuild: createBuild failed: ${err}`);
            reject(err);
          });
      })
      .catch(err => {
        logError(`createBuild: gatherBuildResources failed: ${err}`);
        reject(err);
      });
  });
}
