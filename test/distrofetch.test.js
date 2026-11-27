const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('fs-extra')
const os = require('os')
const path = require('path')

const { REMOTE_DISTRO_URLS, pullFirstValid, readBundledDistribution } = require('../app/assets/js/distrofetch')

const identity = data => data

test('remote urls are own domain first, r2.dev second', () => {
    assert.deepEqual(REMOTE_DISTRO_URLS, [
        'https://launcher.pokeaurora.com/distribution.json',
        'https://pub-16d8232ded904a1bbed89826fb24c57e.r2.dev/distribution.json'
    ])
})

test('uses first url when valid', async () => {
    const seen = []
    const result = await pullFirstValid(['a', 'b'], async url => { seen.push(url); return { data: { from: url } } }, identity)
    assert.deepEqual(result, { data: { from: 'a' }, url: 'a' })
    assert.deepEqual(seen, ['a'])
})

test('skips url returning null data', async () => {
    const result = await pullFirstValid(['a', 'b'], async url => ({ data: url === 'a' ? null : { from: url } }), identity)
    assert.deepEqual(result, { data: { from: 'b' }, url: 'b' })
})

test('skips url that throws', async () => {
    const result = await pullFirstValid(['a', 'b'], async url => { if(url === 'a') throw new Error('net'); return { data: { from: url } } }, identity)
    assert.equal(result.url, 'b')
})

test('skips url whose data fails sanitize', async () => {
    const sanitize = data => { if(data.from === 'a') throw new Error('bad'); return { ...data, ok: true } }
    const result = await pullFirstValid(['a', 'b'], async url => ({ data: { from: url } }), sanitize)
    assert.deepEqual(result, { data: { from: 'b', ok: true }, url: 'b' })
})

test('returns null when all fail', async () => {
    const result = await pullFirstValid(['a', 'b'], async () => ({ data: null }), identity)
    assert.deepEqual(result, { data: null, url: null })
})

test('readBundledDistribution returns sanitized object', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'pa-bundle-'))
    await fs.outputJson(path.join(dir, 'assets', 'distribution.fallback.json'), { servers: [{ id: 's', address: 'x' }] })
    const result = readBundledDistribution(dir, data => ({ ...data, sanitized: true }))
    assert.equal(result.sanitized, true)
    await fs.remove(dir)
})

test('readBundledDistribution returns null for missing dir or bad data', async () => {
    assert.equal(readBundledDistribution(path.join(os.tmpdir(), 'pa-no-such-dir'), identity), null)
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'pa-bundle-'))
    await fs.outputJson(path.join(dir, 'assets', 'distribution.fallback.json'), { servers: [] })
    assert.equal(readBundledDistribution(dir, () => { throw new Error('bad') }), null)
    await fs.remove(dir)
})
