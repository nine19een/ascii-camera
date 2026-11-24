import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { finalizeMp4 } from '../../src/export/mp4Finalize.ts'
import { finalizeWebm } from '../../src/export/webmFinalize.ts'

mkdirSync('.audit-backup', { recursive: true })
for (const [name, finalize] of [
  ['avc1.mp4', (blob) => finalizeMp4(blob)],
  ['vp9.webm', (blob) => finalizeWebm(blob, 2200)],
]) {
  const blob = new Blob([readFileSync('tests/fixtures/chrome-raw-' + name)], {
    type: name.endsWith('mp4') ? 'video/mp4' : 'video/webm',
  })
  const result = await finalize(blob)
  if (result.fallback) throw new Error('Unexpected fixture fallback: ' + name)
  writeFileSync('.audit-backup/finalized-' + name, new Uint8Array(await result.blob.arrayBuffer()))
  console.log(JSON.stringify({ name, bytes: result.blob.size, fallback: result.fallback }))
}
