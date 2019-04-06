import fs from 'fs'
import { clientInfo } from './environment'
const { agentJsFilename, isAgentRunning, postSnapshot } = require('@percy/agent/dist/utils/sdk-utils')

declare var PercyAgent: any

/**
 * @param browser wdio Browser object that we are snapshotting. Required.
 * @param name Name of the snapshot that we're taking. Required.
 * @param options Additional options, e.g. '{widths: [768, 992, 1200]}'. Optional.
 */
export async function percySnapshot(browser: BrowserObject, name: string, options: any = {}) {
  if (!browser) {
    throw new Error("WebdriverIO 'browser' object must be provided.")
  }
  if (!name) {
    throw new Error("'name' must be provided. In Mocha, this.test.fullTitle() is a good default.")
  }

  if (! await isAgentRunning()) {
     return
  }

  await browser.executeScript(fs.readFileSync(agentJsFilename()).toString(), [])

  const domSnapshot = await browser.execute((options: any) => {
    const percyAgentClient = new PercyAgent({ handleAgentCommunication: false })
    return percyAgentClient.snapshot('unused', options)
  }, options)

  await postDomSnapshot(name, domSnapshot, await browser.getUrl(), options)
}

async function postDomSnapshot(name: string, domSnapshot: any, url: string, options: any) {
  const postSuccess = await postSnapshot({
    name,
    url,
    domSnapshot,
    clientInfo: clientInfo(),
    ...options,
  })
  if (!postSuccess) {
    console.log('[percy] Error posting snapshot to agent')
  }
}
