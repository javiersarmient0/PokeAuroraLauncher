const test = require('node:test')
const assert = require('node:assert/strict')
const { assertTrustedDistribution, sanitizeDistribution } = require('../app/assets/js/distributionsanitizer')

const artifact = id => ({
    size: 10,
    MD5: '0123456789abcdef0123456789abcdef',
    url: `https://pub-16d8232ded904a1bbed89826fb24c57e.r2.dev/${id}.jar`
})

function sample(){
    return {
        version: '9.9.9',
        rss: '<LINK TO RSS FEED>',
        discord: { clientId: '<FILL IN OR REMOVE DISCORD OBJECT>' },
        servers: [{
            id: 'PokeAurora-1.21.1',
            name: 'PokeAurora',
            description: 'Server',
            icon: 'https://temporary.invalid/icon.png',
            version: '9.9.9',
            address: '142.44.135.74:25566',
            minecraftVersion: '1.21.1',
            mainServer: false,
            autoconnect: false,
            modules: [
                { id: 'de.keksuccino:fancymenu:3.9.1@jar', name: 'FancyMenu', type: 'FabricMod', artifact: artifact('fancy'), required: { value: true } },
                { id: 'circuitlord.reactivemusic:reactivemusic:1.2.2+1.21.1@jar', name: 'Reactive Music', type: 'FabricMod', artifact: artifact('music'), required: { value: false } },
                { id: 'generated.fabricmod:packed_packs:2.1.2+1.21.1@jar', name: 'Old Packed Packs', type: 'FabricMod', artifact: artifact('old'), required: { value: false } },
                { id: 'me.drex.quickpack:quick-pack:1.3.3@jar', name: 'Wrong Minecraft version', type: 'FabricMod', artifact: artifact('wrong'), required: { value: false } }
            ]
        }]
    }
}

test('normalizes the PokeAurora distribution without forcing autoconnect', () => {
    const result = sanitizeDistribution(sample())
    assert.equal(result.version, '1.0.0')
    assert.equal(result.rss, null)
    assert.equal(result.discord, undefined)
    assert.equal(result.servers[0].mainServer, true)
    assert.equal(result.servers[0].autoconnect, false)
    assert.equal(result.servers[0].icon, 'assets/images/SealCircle.png')
    assert.deepEqual(result.servers[0].modules.map(module => module.name), ['FancyMenu', 'Reactive Music'])
    assert.equal(result.servers[0].modules[0].required.value, true)
    assert.equal(result.servers[0].modules[1].required.value, false)
})

test('preserves an explicitly configured main server', () => {
    const input = sample()
    input.servers.push({
        ...sample().servers[0],
        id: 'second',
        address: '127.0.0.1:25565',
        mainServer: true,
        autoconnect: false
    })

    const result = sanitizeDistribution(input)
    assert.equal(result.servers[0].mainServer, false)
    assert.equal(result.servers[1].mainServer, true)
})

test('rejects artifacts outside the trusted HTTPS host', () => {
    const input = sample()
    input.servers[0].modules[0].artifact.url = 'https://example.com/fancy.jar'
    assert.throws(() => sanitizeDistribution(input), /not allowed/)
})

test('rejects a remote manifest that is not the pinned release', () => {
    assert.throws(() => assertTrustedDistribution(sample()), /fingerprint/)
})