const test = require('node:test')
const assert = require('node:assert/strict')

const { statusTargets, resolveSrvSafe } = require('../app/assets/js/serverstatus')

test('statusTargets puts distro address first', () => {
    assert.deepEqual(statusTargets('142.44.135.74', 25566, [{ name: 'mc.pokeaurora.com', port: 25568 }]), [
        { host: '142.44.135.74', port: 25566 },
        { host: 'mc.pokeaurora.com', port: 25568 }
    ])
})

test('dedupes srv equal to distro address', () => {
    assert.deepEqual(statusTargets('mc.pokeaurora.com', 25568, [{ name: 'MC.pokeaurora.com.', port: 25568 }, { name: 'b.example', port: 1 }, { name: 'b.example', port: 1 }]), [
        { host: 'mc.pokeaurora.com', port: 25568 },
        { host: 'b.example', port: 1 }
    ])
})

test('handles empty srv', () => {
    assert.deepEqual(statusTargets('a', 1, []), [{ host: 'a', port: 1 }])
    assert.deepEqual(statusTargets('a', 1, undefined), [{ host: 'a', port: 1 }])
})

test('resolveSrvSafe returns [] on failure', async () => {
    assert.deepEqual(await resolveSrvSafe('no-existe.invalid'), [])
})
