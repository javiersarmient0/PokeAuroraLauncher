const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('fs-extra')
const os = require('os')
const path = require('path')
const AdmZip = require('adm-zip')

const { pickFabricIcon, readModIconFromJar, iconCacheName } = require('../app/assets/js/modicons')

const PNG = Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex')

async function makeJar(entries){
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'pa-icon-'))
    const zip = new AdmZip()
    for(const [name, data] of Object.entries(entries)){
        zip.addFile(name, Buffer.isBuffer(data) ? data : Buffer.from(data))
    }
    const file = path.join(dir, 'mod-1.0.jar')
    zip.writeZip(file)
    return { dir, file }
}

test('pickFabricIcon accepts a plain path', () => {
    assert.equal(pickFabricIcon('assets/x/icon.png'), 'assets/x/icon.png')
})

test('pickFabricIcon picks the smallest size of at least 64, else the largest', () => {
    assert.equal(pickFabricIcon({ 16: 'a16.png', 64: 'a64.png', 128: 'a128.png' }), 'a64.png')
    assert.equal(pickFabricIcon({ 16: 'a16.png', 32: 'a32.png' }), 'a32.png')
})

test('pickFabricIcon rejects missing or odd values', () => {
    assert.equal(pickFabricIcon(undefined), null)
    assert.equal(pickFabricIcon(42), null)
    assert.equal(pickFabricIcon({}), null)
})

test('readModIconFromJar reads the icon named in fabric.mod.json', async () => {
    const { dir, file } = await makeJar({ 'fabric.mod.json': JSON.stringify({ icon: 'assets/m/icon.png' }), 'assets/m/icon.png': PNG })
    const icon = await readModIconFromJar(file)
    assert.equal(icon.mime, 'image/png')
    assert.deepEqual(icon.data, PNG)
    await fs.remove(dir)
})

test('readModIconFromJar tolerates control characters in fabric.mod.json', async () => {
    const { dir, file } = await makeJar({ 'fabric.mod.json': '{"description":"a\tb\nc", "icon":"i.png"}', 'i.png': PNG })
    assert.ok(await readModIconFromJar(file))
    await fs.remove(dir)
})

test('readModIconFromJar returns null without icon, with a missing entry, or a missing jar', async () => {
    const a = await makeJar({ 'fabric.mod.json': JSON.stringify({ id: 'x' }) })
    const b = await makeJar({ 'fabric.mod.json': JSON.stringify({ icon: 'nope.png' }) })
    assert.equal(await readModIconFromJar(a.file), null)
    assert.equal(await readModIconFromJar(b.file), null)
    assert.equal(await readModIconFromJar(path.join(a.dir, 'no-existe.jar')), null)
    await fs.remove(a.dir)
    await fs.remove(b.dir)
})

test('readModIconFromJar skips icons that are not images or are too big', async () => {
    const a = await makeJar({ 'fabric.mod.json': JSON.stringify({ icon: 'i.txt' }), 'i.txt': 'hola' })
    const b = await makeJar({ 'fabric.mod.json': JSON.stringify({ icon: 'i.png' }), 'i.png': Buffer.alloc(3 * 1024 * 1024) })
    assert.equal(await readModIconFromJar(a.file), null)
    assert.equal(await readModIconFromJar(b.file), null)
    await fs.remove(a.dir)
    await fs.remove(b.dir)
})

test('iconCacheName is stable and filesystem safe', () => {
    assert.equal(iconCacheName('C:/x/mods/a b/mod+x-1.2.jar'), iconCacheName('C:/x/mods/a b/mod+x-1.2.jar'))
    assert.match(iconCacheName('C:/x/mods/mod+x-1.2.jar'), /^[\w.-]+\.png$/)
    assert.notEqual(iconCacheName('/a/mod-1.jar'), iconCacheName('/a/mod-2.jar'))
})

test('readModIconFromJar tolerates a BOM in fabric.mod.json', async () => {
    const { dir, file } = await makeJar({ 'fabric.mod.json': '﻿{"icon":"i.png"}', 'i.png': PNG })
    assert.ok(await readModIconFromJar(file))
    await fs.remove(dir)
})
