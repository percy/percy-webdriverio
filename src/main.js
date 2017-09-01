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

function gatherSnapshotResources(assetLoaders, rootPage, percyClient) {
  return new Promise((resolve, reject) => {
    Promise.all(assetLoaders.map(loader => loader.findSnapshotResources(rootPage, percyClient)))
      .then(listOfResources => {
        resolve([].concat(...listOfResources));
      })
      .catch(err => {
        console.log('[percy webdriverio] gatherSnapshotResources.XXX.reject', err); // eslint-disable-line no-console
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
      throw new Error('A WebdriverIO instance is needed to initialise wdio-screenshot');
    }
    browser.percy = { assetLoaders: [] };

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

    // adding `async` as function name disables the synchronous behavior of WebdriverIO commands
    // eslint-disable-next-line prefer-arrow-callback
    browser.addCommand('percyFinalizeBuild', function async() {
      const percy = browser.percy;
      const percyClient = browser.percy.percyClient;
      return new Promise((resolve, reject) => {
        percy.createBuild
          .then(percyBuildId => {
            percyClient
              .finalizeBuild(percyBuildId)
              .then(() => {
                browser.logger.info(`percy finalizedBuild[${percyBuildId}]: ok`);
                resolve(true);
              })
              .catch(err => {
                browser.logger.error(`percy finalizedBuild[${percyBuildId}]: ${err}`);
                reject(err);
              });
          })
          .catch(err => {
            browser.logger.error('percy finalizedBuild failed to get build id');
            reject(err);
          });
      });
    });

    browser.addCommand('percyUseAssetLoader', (type, options) => {
      const percy = browser.percy;
      switch (type) {
        case 'filesystem':
          percy.assetLoaders.push(new FileSystemAssetLoader(options));
          break;
        default:
          throw new Error(`Unexpected asset loader type: ${type}`);
      }
    });

    browser.addCommand('percySnapshot', function async(name, options = {}) {
      const percy = browser.percy;
      const browserInstance = this;
      const percyClient = percy.percyClient;
      const environment = percy.environment;
      if (percy.createBuild === undefined) {
        percy.createBuild = new Promise((resolve, reject) => {
          percyClient
            .createBuild(environment.repo, { resources: [] })
            .then(buildResponse => {
              const buildId = buildResponse.body.data.id;
              resolve(buildId);
            })
            .catch(err => {
              browser.logger.error(`percy snapshot failed to creteBuild: ${err}`);
              reject(err);
            });
        });
      }
      return new Promise((resolve, reject) => {
        Promise.resolve(browserInstance.getSource())
          .then(source => {
            percy.createBuild
              .then(buildId => {
                const rootResource = percyClient.makeResource({
                  resourceUrl: '/',
                  content: source,
                  isRoot: true,
                  mimetype: 'text/html',
                });
                gatherSnapshotResources(percy.assetLoaders, source, percyClient)
                  .then(resources => {
                    const allResources = resources.concat([rootResource]);
                    percyClient
                      .createSnapshot(buildId, allResources, {
                        name,
                        widths: options.widths,
                        enableJavaScript: options.enableJavaScript,
                        minimumHeight: options.minimumHeight,
                      })
                      .then(snapshotResponse => {
                        const snapshotId = snapshotResponse.body.data.id;
                        const shaToResource = {};
                        shaToResource[rootResource.sha] = rootResource;
                        for (const resource of resources) {
                          shaToResource[resource.sha] = resource;
                        }
                        uploadMissingResources(
                          percyClient,
                          buildId,
                          snapshotResponse,
                          shaToResource,
                        )
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
                      });
                  })
                  .catch(err => {
                    browser.logger.error(
                      `percy snapshot failed to gatherSnapshotResources: ${err}`,
                    );
                    reject(err);
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
