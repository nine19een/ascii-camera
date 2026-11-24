const { chromium } = require(process.env.ASCII_AUDIT_PLAYWRIGHT || 'playwright')
const fs=require('node:fs'),assert=require('node:assert/strict')
fs.mkdirSync('.audit-backup',{recursive:true})
;(async()=>{
const browser=await chromium.launch({channel:process.env.ASCII_AUDIT_BROWSER || 'msedge',headless:true,args:['--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream']})
const context=await browser.newContext({viewport:{width:1440,height:1000},permissions:['camera']})
const page=await context.newPage(),errors=[]
page.on('pageerror',e=>errors.push(e.message))
await page.addInitScript(()=>{
 const gum=navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices)
 window.auditStreams=[];window.auditDelay=true
 navigator.mediaDevices.getUserMedia=async c=>{
   if(c.video.deviceId?.exact==='audit-missing')throw new DOMException('Test missing camera','OverconstrainedError')
   const s=await gum(c);window.auditStreams.push(s)
   if(window.auditDelay)await new Promise(r=>window.auditResolve=r)
   return s
 }
 const devices=navigator.mediaDevices.enumerateDevices.bind(navigator.mediaDevices)
 navigator.mediaDevices.enumerateDevices=async()=>[...await devices(),{kind:'videoinput',deviceId:'audit-missing',label:'Audit unavailable camera',groupId:'audit'}]
})
await page.goto('http://127.0.0.1:4173/')
await page.waitForFunction(()=>document.querySelector('.ascii-canvas')?.width>100)
await page.getByRole('button',{name:'EN',exact:true}).click()
const camera=page.locator('.ctl-left button').first()
await camera.click();await page.waitForFunction(()=>window.auditResolve!==undefined)
await camera.click();await page.evaluate(()=>{window.auditDelay=false;window.auditResolve()})
await page.waitForFunction(()=>window.auditStreams.every(s=>s.getTracks().every(t=>t.readyState==='ended')))
await camera.click();await page.waitForFunction(()=>document.querySelector('.source-chip').dataset.source==='camera')
await page.getByRole('button',{name:'Adjust',exact:true}).click()
await page.locator('select').selectOption('audit-missing')
await page.waitForFunction(()=>document.querySelector('.notice-error')?.textContent.includes('available'))
assert.equal(await page.evaluate(()=>window.auditStreams.at(-1).getVideoTracks()[0].readyState),'live')
await page.evaluate(()=>window.auditStreams.at(-1).getVideoTracks()[0].dispatchEvent(new Event('ended')))
await page.waitForFunction(()=>document.querySelector('.source-chip').dataset.source==='demo')
assert.equal(await page.evaluate(()=>window.auditStreams.at(-1).getVideoTracks()[0].readyState),'ended')
await page.getByRole('button',{name:'Close adjust',exact:false}).click()
// Deliberately delay a native PNG callback beyond pagehide to check export cancellation.
await page.evaluate(()=>{
 const original=HTMLCanvasElement.prototype.toBlob
 HTMLCanvasElement.prototype.toBlob=function(cb,...args){return original.call(this,b=>{window.auditPngCallback=()=>cb(b)},...args)}
 window.auditUrls=new Set()
 const create=URL.createObjectURL.bind(URL),revoke=URL.revokeObjectURL.bind(URL)
 URL.createObjectURL=b=>{const u=create(b);window.auditUrls.add(u);return u}
 URL.revokeObjectURL=u=>{window.auditUrls.delete(u);revoke(u)}
})
await page.locator('button.shutter').click();await page.waitForFunction(()=>!!window.auditPngCallback)
await page.evaluate(()=>{window.dispatchEvent(new PageTransitionEvent('pagehide'));window.auditPngCallback()})
const latePngUrls=await page.evaluate(()=>window.auditUrls.size)
assert.equal(latePngUrls,0)
console.log(JSON.stringify({cameraLatePermissionReleased:true,failedSwitchPreservesCamera:true,endedTrackReturnsToDemo:true,latePngUrls,errors}))
fs.writeFileSync('.audit-backup/lifecycle-results.json',JSON.stringify({cameraLatePermissionReleased:true,failedSwitchPreservesCamera:true,endedTrackReturnsToDemo:true,latePngUrls,errors},null,2))
const fallback=await context.newPage()
fallback.on('pageerror',e=>errors.push(e.message))
await fallback.addInitScript(()=>{
 Object.defineProperty(document,'fullscreenEnabled',{get:()=>false})
 Object.defineProperty(document,'webkitFullscreenEnabled',{get:()=>false})
 navigator.mediaDevices.getUserMedia=async()=>{throw new DOMException('Audit permission denial','NotAllowedError')}
})
await fallback.route('**/statue-demo-*.mp4',r=>r.abort())
await fallback.setViewportSize({width:390,height:844})
await fallback.goto('http://127.0.0.1:4173/')
await fallback.waitForFunction(()=>document.querySelector('.ascii-canvas')?.width>100)
await fallback.getByRole('button',{name:'EN',exact:true}).click()
await fallback.locator('.ctl-left button').first().click()
await fallback.getByRole('alert').waitFor()
assert.equal(await fallback.locator('.source-chip').getAttribute('data-source'),'demo')
await fallback.locator('.stage-fullscreen').click()
await fallback.waitForFunction(()=>document.documentElement.dataset.immersive==='true')
await fallback.evaluate(()=>history.back())
await fallback.waitForFunction(()=>!document.documentElement.dataset.immersive)
await fallback.locator('[data-format="gif"][role="radio"]').click()
const autoDownload=fallback.waitForEvent('download',{timeout:20000})
await fallback.locator('button.shutter').click()
const autoGif=await autoDownload
await autoGif.saveAs('.audit-backup/auto-limit.gif')
await fallback.waitForFunction(()=>document.querySelector('.capture').dataset.state==='idle')
assert.deepEqual(errors,[])
const final={cameraLatePermissionReleased:true,failedSwitchPreservesCamera:true,endedTrackReturnsToDemo:true,latePngUrls,posterAfterVideoFailure:true,permissionDeniedDemo:true,immersiveBack:true,gifAutoLimit:true,errors}
fs.writeFileSync('.audit-backup/lifecycle-results.json',JSON.stringify(final,null,2))
console.log(JSON.stringify(final))
await browser.close()
})().catch(e=>{console.error(e);process.exit(1)})

