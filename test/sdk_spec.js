const should = require('chai').should()
const httpServer = require('http-server')
const { percySnapshot } = require('../dist')

describe('percy-webdriverio SDK', function() {
  const PORT = 8000
  const TEST_URL = `http://localhost:${PORT}`

  let server = null
  let page = null

  before(async function() {
    // Start local server to host app under test.
    server = httpServer.createServer({ root: `${__dirname}/testapp` })
    server.listen(PORT)
  })

  after(async function() {
    // Shut down the HTTP server.
    server.close()
  })

  describe('with local app', async function() {
    beforeEach(async function() {
      await browser.url(TEST_URL)
    })

    afterEach(async function() {
      // Clear local storage to start always with a clean slate.
      await browser.clearLocalStorage()
    })

    it('snapshots with provided name', async function() {
      await percySnapshot(browser, this.test.fullTitle())
    })

    it('snapshots with provided name and widths', async function() {
      await percySnapshot(browser, this.test.fullTitle(), {
        widths: [768, 992, 1200],
      })
    })

    it('snapshots with minHeight', async function() {
      await percySnapshot(browser, this.test.fullTitle(), { minHeight: 2000 })
    })

    it('takes multiple snapshots in one test', async function() {
      // Add a todo.
      const inputField = await $('.new-todo')
      await inputField.sendKeys(['A thing to accomplish', '\uE007'])

      let itemsLeft = await browser.execute(
        () => document.querySelector('.todo-count').textContent
      )
      itemsLeft.should.eq('1 item left')
      await percySnapshot(browser, `${this.test.fullTitle()} #1`)

      const inputToggle = await $('input.toggle')
      await inputToggle.click()
      itemsLeft = await browser.execute(
        () => document.querySelector('.todo-count').textContent
      )
      itemsLeft.should.eq('0 items left')
      await percySnapshot(browser, `${this.test.fullTitle()} #2`)
    })
  })

  describe('with live sites', async function() {
    it('snapshots HTTPS website', async function() {
      await browser.url('https://polaris.shopify.com/')
      await percySnapshot(browser, this.test.fullTitle(), {
        widths: [768, 992, 1200],
      })
    })

    it('snapshots website with strict CSP', async function() {
      await browser.url('https://buildkite.com/')
      await percySnapshot(browser, this.test.fullTitle(), {
        widths: [768, 992, 1200],
      })
    })
  })
})
