import request from 'request-promise';

export default class StaticUrlAssetLoader {
  constructor(options) {
    this.options = options;
  }
  findSnapshotResources(page, percyClient) {
    return new Promise((resolve) => {
      const resources = [];
      let inflight = 0;
      const options = this.options;
      const urls = options.urls;
      inflight += urls.length;
      for (const url of urls) {
        const fullUrl = options.base + url.url;
        request(fullUrl).then((content) => { // eslint-disable-line no-loop-func
          inflight -= 1;
          resources.push(percyClient.makeResource({
            resourceUrl: encodeURI(url.url),
            content,
            mimetype: url.mimetype
          }));
          if (inflight === 0) {
            resolve(resources);
          }
        }).catch((err) => { // eslint-disable-line no-loop-func
          console.log(`err in downloading ${fullUrl}`, err); // eslint-disable-line no-console
          inflight -= 1;
          if (inflight === 0) {
            resolve(resources);
          }
        });
      }
    });
  }
}
