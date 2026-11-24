const { chromium } = require(process.env.ASCII_AUDIT_PLAYWRIGHT || 'playwright')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const baseUrl = process.env.ASCII_CAMERA_TEST_URL || 'http://127.0.0.1:4173/'
const output = process.env.ASCII_CAMERA_TEST_OUTPUT || '.audit-backup/camera-switch-results.json'

;(async () => {
  const browser = await chromium.launch({
    channel: process.env.ASCII_AUDIT_BROWSER || 'msedge', headless: true,
    args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'],
  })
  const results = []
  try {
    for (const scenario of ['ended-success', 'ended-unavailable', 'unavailable-live', 'exclusive-retry', 'restore-failed', 'real-disconnect', 'stop-pending']) {
      const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, permissions: ['camera'] })
      const page = await context.newPage()
      const errors = []
      page.on('pageerror', error => errors.push(error.message))
      try {
        await page.addInitScript(({ scenario }) => {
          const native = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices)
          const test = window.cameraSwitchTest = { streams: [], requests: [], scenario, pending: false }
          navigator.mediaDevices.enumerateDevices = async () => ['front', 'back'].map(id => ({ kind: 'videoinput', deviceId: id, label: `Test ${id}`, groupId: 'test' }))
          navigator.mediaDevices.getUserMedia = async constraints => {
            const id = constraints.video.deviceId?.exact || constraints.video.deviceId?.ideal || 'front'
            test.requests.push({ id, constraints })
            const attempt = test.requests.filter(request => request.id === 'back').length
            if (id === 'back') {
              if (attempt === 1 && ['ended-success', 'ended-unavailable', 'restore-failed', 'stop-pending'].includes(scenario)) {
                const old = test.streams.at(-1).getVideoTracks()[0]
                old.stop()
                old.dispatchEvent(new Event('ended'))
                await new Promise(resolve => setTimeout(resolve, 30))
              }
              if (['ended-unavailable', 'unavailable-live', 'restore-failed'].includes(scenario)) throw new DOMException('Test unavailable lens', 'OverconstrainedError')
              if (scenario === 'exclusive-retry' && attempt === 1) throw new DOMException('Test exclusive capture', 'NotReadableError')
              if (scenario === 'stop-pending') {
                test.pending = true
                await new Promise(resolve => { test.resolve = resolve })
              }
            }
            if (id === 'front' && scenario === 'restore-failed' && test.requests.length > 1) throw new DOMException('Test restore failure', 'NotReadableError')
            const stream = await native({ audio: false, video: true })
            const track = stream.getVideoTracks()[0]
            const settings = track.getSettings.bind(track)
            track.getSettings = () => ({ ...settings(), deviceId: id })
            test.streams.push(stream)
            return stream
          }
        }, { scenario })
        await page.goto(baseUrl)
        await page.waitForFunction(() => document.querySelector('.ascii-canvas')?.width > 100)
        await page.getByRole('button', { name: 'EN', exact: true }).click()
        const camera = page.locator('.ctl-left button').first()
        await camera.click()
        await page.waitForFunction(() => document.querySelector('.source-chip').dataset.source === 'camera')
        if (scenario === 'real-disconnect') {
          await page.evaluate(() => {
            const track = window.cameraSwitchTest.streams[0].getVideoTracks()[0]
            track.stop(); track.dispatchEvent(new Event('ended'))
          })
        } else {
          await page.getByRole('button', { name: 'Adjust', exact: true }).click()
          await page.locator('select').selectOption('back')
          if (scenario === 'stop-pending') {
            await page.waitForFunction(() => window.cameraSwitchTest.pending)
            await camera.click()
            await page.evaluate(() => window.cameraSwitchTest.resolve())
          }
        }
        if (['restore-failed', 'real-disconnect', 'stop-pending'].includes(scenario)) {
          await page.waitForFunction(() => document.querySelector('.source-chip').dataset.source === 'demo')
          if (scenario === 'stop-pending') await page.waitForFunction(() => window.cameraSwitchTest.streams.length === 2)
          await page.waitForFunction(() => window.cameraSwitchTest.streams.every(stream => stream.getTracks().every(track => track.readyState === 'ended')))
        } else {
          const expected = ['ended-success', 'exclusive-retry'].includes(scenario) ? 'back' : 'front'
          await page.waitForFunction(id => {
            const select = document.querySelector('select')
            return document.querySelector('.source-chip').dataset.source === 'camera' && select.value === id && !select.disabled
          }, expected, { timeout: 5000 })
          assert.equal(await page.evaluate(() => window.cameraSwitchTest.streams.at(-1).getVideoTracks()[0].readyState), 'live')
          if (scenario === 'ended-unavailable') assert.match(await page.locator('.notice-error').innerText(), /Switched back to the previous camera\./)
          if (scenario === 'unavailable-live') assert.equal(await page.evaluate(() => window.cameraSwitchTest.streams.length), 1)
          await camera.click()
          await page.waitForFunction(() => window.cameraSwitchTest.streams.every(stream => stream.getTracks().every(track => track.readyState === 'ended')))
        }
        assert.deepEqual(errors, [])
        results.push({ scenario, status: 'PASS', requests: await page.evaluate(() => window.cameraSwitchTest.requests) })
      } catch (error) {
        results.push({ scenario, status: 'FAIL', error: error.message, observed: await page.evaluate(() => ({ source: document.querySelector('.source-chip')?.dataset.source, requests: window.cameraSwitchTest?.requests, tracks: window.cameraSwitchTest?.streams.map(stream => stream.getTracks().map(track => track.readyState)) })) })
        throw error
      } finally {
        await context.close()
      }
    }
  } finally {
    fs.mkdirSync(path.dirname(output), { recursive: true })
    fs.writeFileSync(output, JSON.stringify({ url: baseUrl, browser: browser.version(), simulatedCameraLifecycle: true, results }, null, 2))
    await browser.close()
  }
  console.log(JSON.stringify(results, null, 2))
})().catch(error => { console.error(error); process.exitCode = 1 })
