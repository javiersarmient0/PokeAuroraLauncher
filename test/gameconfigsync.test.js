const assert = require('node:assert/strict')
const fs = require('fs-extra')
const os = require('node:os')
const path = require('node:path')
const test = require('node:test')

const { syncBundledGameConfig, validateEntryName } = require('../app/assets/js/gameconfigsync')

test('installs the bundled FancyMenu configuration and server list', async t => {
    const instance = await fs.mkdtemp(path.join(os.tmpdir(), 'pokeaurora-config-test-'))
    t.after(() => fs.remove(instance))

    await syncBundledGameConfig(instance)

    const mainMenu = await fs.readFile(
        path.join(instance, 'config', 'fancymenu', 'customization', 'pokeaurora_main.txt'),
        'utf8'
    )
    const servers = await fs.readFile(path.join(instance, 'servers.dat'))
    assert.match(mainMenu, /discord\.gg\/GxV5XsdvPv/)
    assert.equal(servers.includes(Buffer.from('142.44.135.74:25566')), true)
})

test('rejects paths outside the official game configuration', () => {
    assert.throws(() => validateEntryName('../servers.dat'), /Unexpected bundled configuration entry/)
    assert.throws(() => validateEntryName('config/options.txt'), /Unexpected bundled configuration entry/)
})
