# Releasing

1. `git checkout master`
1. `git pull origin master`
1. `git checkout -b version-bump`
1. `npm version x.x.x`
1. `git push origin version-bump`
1. Ensure tests have passed and merge PR
1. `git push --tags`
1. Draft and publish a [new release on github](https://github.com/percy/percy-webdriverio/releases)
1. `npm publish`
1. [Visit NPM](https://www.npmjs.com/package/@percy-io/percy-webdriverio) and see that your version is now live.
