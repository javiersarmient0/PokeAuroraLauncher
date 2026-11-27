const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('fs-extra')
const os = require('os')
const path = require('path')

const { applyGraphicsToOptionsText, applyProfileGraphics } = require('../app/assets/js/gameoptions')
const { DEFAULT_PROFILES } = require('../app/assets/js/profiles')

const LITE = DEFAULT_PROFILES.profiles.lite.graphics
const NORMAL = DEFAULT_PROFILES.profiles.normal.graphics

test('replaces only the four keys', () => {
    const input = 'version:3955\nrenderDistance:12\nsimulationDistance:12\ngraphicsMode:1\nparticles:0\nfov:0.5\nkey_key.jump:key.keyboard.space\n'
    const out = applyGraphicsToOptionsText(input, LITE)
    assert.equal(out, 'version:3955\nrenderDistance:8\nsimulationDistance:6\ngraphicsMode:0\nparticles:1\nfov:0.5\nkey_key.jump:key.keyboard.space\n')
})

test('removes Fresh Animations packs only', () => {
    const input = 'resourcePacks:["vanilla","file/PokeAurora.zip","file/FreshAnimations_v1.10.4.zip","file/FA+Player-v1.1.zip","file/animated-items 1.21.x.zip"]\n'
    const out = applyGraphicsToOptionsText(input, LITE)
    assert.ok(out.startsWith('resourcePacks:["vanilla","file/PokeAurora.zip"]\n'), out)
})

test('normal leaves resource packs untouched', () => {
    const line = 'resourcePacks:["vanilla","file/FreshAnimations_v1.10.4.zip"]'
    assert.ok(applyGraphicsToOptionsText(line + '\n', NORMAL).startsWith(line + '\n'))
})

test('leaves invalid resourcePacks untouched', () => {
    const out = applyGraphicsToOptionsText('resourcePacks:[broken\nrenderDistance:12\n', LITE)
    assert.ok(out.startsWith('resourcePacks:[broken\nrenderDistance:8\n'), out)
})

test('appends missing keys', () => {
    const out = applyGraphicsToOptionsText('renderDistance:12\n', LITE)
    assert.equal(out, 'renderDistance:8\nsimulationDistance:6\ngraphicsMode:0\nparticles:1\n')
})

test('preserves CRLF', () => {
    const out = applyGraphicsToOptionsText('renderDistance:12\r\nfov:0.5\r\n', NORMAL)
    assert.equal(out, 'renderDistance:10\r\nfov:0.5\r\nsimulationDistance:8\r\ngraphicsMode:1\r\nparticles:0\r\n')
})

test('applyProfileGraphics missing file', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'pa-opts-'))
    const result = await applyProfileGraphics(path.join(dir, 'options.txt'), LITE)
    assert.deepEqual(result, { applied: false, reason: 'missing' })
    assert.deepEqual(await fs.readdir(dir), [])
    await fs.remove(dir)
})

test('applyProfileGraphics writes backup', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'pa-opts-'))
    const file = path.join(dir, 'options.txt')
    await fs.writeFile(file, 'renderDistance:12\n')
    const result = await applyProfileGraphics(file, LITE)
    assert.deepEqual(result, { applied: true })
    assert.equal(await fs.readFile(path.join(dir, 'options.txt.antes-perfil'), 'utf8'), 'renderDistance:12\n')
    assert.ok((await fs.readFile(file, 'utf8')).startsWith('renderDistance:8\n'))
    await fs.remove(dir)
})

test('re-adds packs a previous profile removed', () => {
    const input = 'resourcePacks:["vanilla","file/PokeAurora.zip"]\n'
    const out = applyGraphicsToOptionsText(input, NORMAL, ['file/FreshAnimations_v1.10.4.zip'])
    assert.ok(out.startsWith('resourcePacks:["vanilla","file/PokeAurora.zip","file/FreshAnimations_v1.10.4.zip"]\n'), out)
})

test('does not re-add packs the new profile still disables', () => {
    const input = 'resourcePacks:["vanilla"]\n'
    const out = applyGraphicsToOptionsText(input, LITE, ['file/FreshAnimations_v1.10.4.zip'])
    assert.ok(out.startsWith('resourcePacks:["vanilla"]\n'), out)
})

test('lite then normal restores Fresh Animations through the sidecar', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'pa-opts-'))
    const file = path.join(dir, 'options.txt')
    await fs.writeFile(file, 'resourcePacks:["vanilla","file/FreshAnimations_v1.10.4.zip","file/PokeAurora.zip"]\n')
    await applyProfileGraphics(file, LITE)
    assert.ok((await fs.readFile(file, 'utf8')).startsWith('resourcePacks:["vanilla","file/PokeAurora.zip"]'))
    await applyProfileGraphics(file, NORMAL)
    assert.ok((await fs.readFile(file, 'utf8')).startsWith('resourcePacks:["vanilla","file/PokeAurora.zip","file/FreshAnimations_v1.10.4.zip"]'))
    await fs.remove(dir)
})
