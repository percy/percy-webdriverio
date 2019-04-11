const should = require('chai').should()
const httpServer = require('http-server')
const { percySnapshot } = require('../dist')

describe('percy-webdriverio SDK', function() {
  const PORT = 8000
  const TEST_URL = `http://localhost:${PORT}`

  let server = null

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
    it('snapshots a website with HTTP', async function() {
      await browser.url('http://example.com/')
      await percySnapshot(browser, this.test.fullTitle())
    })

    it('snapshots a website with HTTPS, strict CSP, CORS and HSTS setup', async function() {
      await browser.url('https://sdk-test.percy.dev')
      await percySnapshot(browser, this.test.fullTitle())
    })
  })
})
