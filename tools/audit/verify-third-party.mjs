import assert from 'node:assert/strict'
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { resolve, relative } from 'node:path'

const root = resolve('.')
const vendor = 'public/vendor/gifenc-1.0.3/'
const manifest = JSON.parse(readFileSync(vendor + 'source-manifest.json', 'utf8'))
assert.deepEqual(JSON.parse(readFileSync('dist/vendor/gifenc-1.0.3/source-manifest.json', 'utf8')), manifest)
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex')
assert.equal(manifest.version, '1.0.3')
const sourceNames = new Set()
for (const input of ['gifenc.js', 'gifenc.esm.js']) {
  const map = JSON.parse(readFileSync('node_modules/gifenc/dist/' + input + '.map', 'utf8'))
  for (const [index, source] of map.sources.entries()) {
    const name = source.replace('../', '')
    const copied = readFileSync(vendor + name)
    assert.equal(hash(copied), hash(readFileSync('node_modules/gifenc/' + name)), name)
    assert.equal(hash(copied), hash(Buffer.from(map.sourcesContent[index])), name)
    sourceNames.add(name)
  }
}
assert.equal(sourceNames.size, 8)
for (const [name, expected] of Object.entries(manifest.files)) {
  assert.equal(hash(readFileSync(vendor + name)), expected, name)
  assert.equal(hash(readFileSync('dist/vendor/gifenc-1.0.3/' + name)), expected, 'dist/' + name)
}
assert.match(readFileSync(vendor + 'LICENSE.MPL-2.0.txt', 'utf8'), /^Mozilla Public License Version 2\.0/)
const workerName = readdirSync('dist/assets').find((name) => /^gif\.worker-.*\.js$/.test(name))
assert(workerName)
const worker = readFileSync('dist/assets/' + workerName, 'utf8')
assert.match(worker, /PNN quantizer \(MPL-2\.0\)/)
for (const target of ['../vendor/gifenc-1.0.3/src/pnnquant2.js', '../third-party-licenses.txt']) {
  const path = resolve('dist/assets', target)
  assert(relative(root, path).startsWith('dist'))
  assert(existsSync(path), target)
  assert(worker.includes(target), target)
}
const pkg = JSON.parse(readFileSync('package.json', 'utf8'))
const lock = JSON.parse(readFileSync('package-lock.json', 'utf8'))
assert.equal(pkg.version, '1.0.0')
assert.equal(lock.version, pkg.version)
assert.equal(lock.packages[''].version, pkg.version)
assert.equal(lock.packages['node_modules/gifenc'].integrity, manifest.npmIntegrity)
console.log(JSON.stringify({ version: pkg.version, gifenc: manifest.version, sourceFiles: sourceNames.size, mapsVerified: 2, sourceAndMapHashes: 'identical', distSourceAndLicenses: 'identical', worker: workerName, noticePaths: 'valid' }, null, 2))
