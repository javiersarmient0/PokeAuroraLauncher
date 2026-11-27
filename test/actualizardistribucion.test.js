const test = require('node:test')
const assert = require('node:assert/strict')

const { updateDistribution } = require('../scripts/actualizar-distribucion')
const { sanitizeDistribution } = require('../app/assets/js/distributionsanitizer')
const { DEFAULT_PROFILES } = require('../app/assets/js/profiles')

const artifact = id => ({ size: 1, MD5: '0123456789abcdef0123456789abcdef', url: `https://pub-16d8232ded904a1bbed89826fb24c57e.r2.dev/${id}.jar` })
const mod = (id, required) => ({ id, name: id, type: 'FabricMod', artifact: artifact(id.split(':')[1]), required: { value: required } })

function raw(){
    return {
        version: '1.0.0',
        servers: [{
            id: 'PokeAurora-1.21.1',
            name: 'PokeAurora (Minecraft 1.21.1)',
            description: 'PokeAurora Running Minecraft 1.21.1 (Fabric v0.19.5)',
            address: '142.44.135.74:25566',
            minecraftVersion: '1.21.1',
            mainServer: true,
            modules: [
                mod('de.maxhenkel:voicechat:1.21.1-2.6.24@jar', false),
                mod('com.terraformersmc:modmenu:11.0.5@jar', false),
                mod('dev.kosmx.playerAnim:playeranimator:2.0.4+1.21.1@jar', false),
                mod('generated.fabricmod:iris:1.8.14-beta.1+mc1.21.1@jar', false),
                mod('com.cobblemon:cobblemon:1.7.1@jar', true)
            ]
        }]
    }
}

test('sets new address and description', () => {
    const server = updateDistribution(raw()).servers[0]
    assert.equal(server.address, 'mc.pokeaurora.com:25568')
    assert.equal(server.description, 'Minecraft 1.21.1 · Fabric')
})

test('marks the three mods required and leaves others optional', () => {
    const modules = updateDistribution(raw()).servers[0].modules
    const req = Object.fromEntries(modules.map(m => [m.id.split(':')[1], m.required.value]))
    assert.deepEqual(req, { voicechat: true, modmenu: true, playeranimator: true, iris: false, cobblemon: true })
})

test('adds profiles and result passes sanitizeDistribution', () => {
    const out = updateDistribution(raw())
    assert.deepEqual(out.servers[0].pokeauroraProfiles, JSON.parse(JSON.stringify(DEFAULT_PROFILES)))
    assert.deepEqual(sanitizeDistribution(out).servers[0].pokeauroraProfiles, JSON.parse(JSON.stringify(DEFAULT_PROFILES)))
})

test('does not mutate the input', () => {
    const input = raw()
    updateDistribution(input)
    assert.equal(input.servers[0].address, '142.44.135.74:25566')
})

test('is idempotent', () => {
    const once = updateDistribution(raw())
    assert.deepEqual(updateDistribution(once), once)
})
