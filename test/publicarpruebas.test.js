const test = require('node:test')
const assert = require('node:assert/strict')
const crypto = require('crypto')
const fs = require('fs')
const os = require('os')
const path = require('path')

const { buildPruebasLayer } = require('../scripts/publicar-pruebas')
const { sanitizeDistribution } = require('../app/assets/js/distributionsanitizer')
const { mergeStaffServer, PRUEBAS_ID } = require('../app/assets/js/staffaccess')

const URL_JAR = 'https://pub-16d8232ded904a1bbed89826fb24c57e.r2.dev/servers/PokeAurora-pruebas/PokeAurora-1.0.0-pruebas.1.jar'

function fakeJar(){
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pruebas-'))
    const file = path.join(dir, 'PokeAurora-pruebas.jar')
    fs.writeFileSync(file, Buffer.from('PK\u0003\u0004 jar de prueba'))
    return file
}

test('layer has the jar size and md5', () => {
    const jarPath = fakeJar()
    const bytes = fs.readFileSync(jarPath)
    const layer = buildPruebasLayer({ jarPath, url: URL_JAR, version: '1.0.0-pruebas.1' })
    const module = layer.replace['generated.fabricmod:pokeaurora:1.0.0@jar']
    assert.equal(module.artifact.size, bytes.length)
    assert.equal(module.artifact.MD5, crypto.createHash('md5').update(bytes).digest('hex'))
    assert.equal(module.artifact.url, URL_JAR)
})

test('module id carries the version and replaces the current client jar', () => {
    const layer = buildPruebasLayer({ jarPath: fakeJar(), url: URL_JAR, version: '1.0.0-pruebas.1' })
    assert.deepEqual(Object.keys(layer.replace), ['generated.fabricmod:pokeaurora:1.0.0@jar'])
    const module = layer.replace['generated.fabricmod:pokeaurora:1.0.0@jar']
    assert.equal(module.id, 'generated.fabricmod:pokeaurora:1.0.0-pruebas.1@jar')
    assert.equal(module.type, 'FabricMod')
    assert.equal(layer.id, PRUEBAS_ID)
    assert.equal(layer.base, 'PokeAurora-1.21.1')
    assert.equal(layer.address, 'pruebas.pokeaurora.com')
    assert.deepEqual(layer.add, [])
    assert.deepEqual(layer.remove, [])
})

test('version defaults to a dated pruebas version', () => {
    const layer = buildPruebasLayer({ jarPath: fakeJar(), url: URL_JAR, now: new Date('2026-11-21T12:00:00Z') })
    assert.equal(layer.replace['generated.fabricmod:pokeaurora:1.0.0@jar'].id, 'generated.fabricmod:pokeaurora:1.0.0-pruebas.20261121@jar')
})

test('rejects a non https url and a bad version', () => {
    assert.throws(() => buildPruebasLayer({ jarPath: fakeJar(), url: 'http://x.com/a.jar', version: '1' }), /https/)
    assert.throws(() => buildPruebasLayer({ jarPath: fakeJar(), url: URL_JAR, version: 'con espacio' }), /versión/)
})

test('the layer passes the worker validation and the launcher sanitizer', async () => {
    const { pathToFileURL } = require('url')
    const { validateLayer } = await import(pathToFileURL(path.join(__dirname, '..', 'staff-worker', 'src', 'logic.mjs')).href)
    const layer = buildPruebasLayer({ jarPath: fakeJar(), url: URL_JAR, version: '1.0.0-pruebas.1' })
    assert.deepEqual(validateLayer(layer), { ok: true, error: null })
    const fallback = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'app', 'assets', 'distribution.fallback.json'), 'utf8'))
    const merged = sanitizeDistribution(mergeStaffServer(sanitizeDistribution(fallback), { status: 'staff', layer }, null))
    const pruebas = merged.servers.find(s => s.id === PRUEBAS_ID)
    assert.ok(pruebas.modules.some(m => m.id === 'generated.fabricmod:pokeaurora:1.0.0-pruebas.1@jar'))
    assert.ok(!pruebas.modules.some(m => m.id === 'generated.fabricmod:pokeaurora:1.0.0@jar'))
})

test('extra mods go in add with id, size and md5, and survive the worker and the sanitizer', async () => {
    const { pathToFileURL } = require('url')
    const { validateLayer } = await import(pathToFileURL(path.join(__dirname, '..', 'staff-worker', 'src', 'logic.mjs')).href)
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'extra-'))
    const extraJar = path.join(dir, 'utilskc-2.0.1.jar')
    fs.writeFileSync(extraJar, Buffer.from('PK mod extra'))
    const extraUrl = 'https://video.pokeaurora.com/launcher/pruebas/utilskc-2.0.1.jar'
    const layer = buildPruebasLayer({ jarPath: fakeJar(), url: URL_JAR, version: '1.0.0-pruebas.1', extras: [{ jarPath: extraJar, url: extraUrl }] })
    assert.equal(layer.add.length, 1)
    assert.equal(layer.add[0].id, 'generated.fabricmod:utilskc:2.0.1@jar')
    assert.equal(layer.add[0].artifact.url, extraUrl)
    assert.equal(layer.add[0].artifact.MD5, crypto.createHash('md5').update(fs.readFileSync(extraJar)).digest('hex'))
    assert.deepEqual(validateLayer(layer), { ok: true, error: null })
    const fallback = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'app', 'assets', 'distribution.fallback.json'), 'utf8'))
    const merged = sanitizeDistribution(mergeStaffServer(sanitizeDistribution(fallback), { status: 'staff', layer }, null))
    const pruebas = merged.servers.find(s => s.id === PRUEBAS_ID)
    assert.ok(pruebas.modules.some(m => m.id === 'generated.fabricmod:utilskc:2.0.1@jar'))
})

test('an extra mod needs a https url and a name-version file name', () => {
    assert.throws(() => buildPruebasLayer({ jarPath: fakeJar(), url: URL_JAR, extras: [{ jarPath: fakeJar(), url: 'https://x.com/a.jar' }] }), /nombre/)
    assert.throws(() => buildPruebasLayer({ jarPath: fakeJar(), url: URL_JAR, extras: [{ jarPath: 'x-1.0.jar', url: 'http://x.com/x.jar' }] }), /https/)
})
