import walk from 'walk';
import path from 'path';
import fs from 'fs';
import mime from 'mime-types';

const MAX_FILE_SIZE_BYTES = 15728640;
const DEFAULT_SKIPPED_ASSETS = [];

export default class FileSystemAssetLoader {
  constructor(options) {
    options.skippedAssets = options.skippedAssets || DEFAULT_SKIPPED_ASSETS;
    this.options = options;
  }
  findSnapshotResources(page, percyClient) {
    return new Promise((resolve, reject) => {
      const options = this.options;
      const buildDir = options.buildDir;
      const mountPath = `${(options.mountPath || '')}/`;

      let isDirectory = false;
      try {
        isDirectory = fs.statSync(buildDir).isDirectory();
      } catch (err) {
        console.log("[xx] stat failed!");
        reject(err);
        return;
      }

      if (isDirectory) {
        console.log("[xx] is directory!")
        const resources = [];
        let errors;
        walk.walkSync(buildDir, {
          followLinks: true,
          listeners: {
            file: function file(root, fileStats, next) {
              const absolutePath = path.join(root, fileStats.name);
              let resourceUrl = absolutePath.replace(buildDir, '');
              if (path.sep === '\\') {
                // Windows support: transform filesystem backslashes into forward-slashes for the URL.
                resourceUrl = resourceUrl.replace('\\', '/');
              }
              if (resourceUrl.charAt(0) === '/') {
                resourceUrl = resourceUrl.substr(1);
              }
              for (const assetPattern of options.skippedAssets) {
                if (resourceUrl.match(assetPattern)) {
                  next();
                  return;
                }
              }
              if (fs.statSync(absolutePath).size > MAX_FILE_SIZE_BYTES) {
                console.warn('\n[percy][WARNING] Skipping large file: ', resourceUrl); // eslint-disable-line no-console
                return;
              }
              const content = fs.readFileSync(absolutePath);
              resources.push(percyClient.makeResource({
                resourceUrl: encodeURI(`${mountPath}${resourceUrl}`),
                content,
                mimetype: mime.lookup(resourceUrl)
              }));
              next();
            },
            errors: function handleErrors(root, fileStats, next) {
              errors = fileStats;
              next();
            }
          }
        });
        if (resources.length === 0 && errors) {
          reject(errors);
        } else {
          resolve(resources);
        }
      } else {
        console.log("[xxx] reject");
        reject(`${buildDir} is not a directory`);
      }
    });
  }
}
