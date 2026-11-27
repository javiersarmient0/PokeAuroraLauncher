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
const { sanitizeProfiles, sanitizeNotice } = require('../app/assets/js/distributionsanitizer')
const { DEFAULT_PROFILES } = require('../app/assets/js/profiles')

function profilesCopy(){
    return JSON.parse(JSON.stringify(DEFAULT_PROFILES))
}

test('keeps valid pokeauroraProfiles', () => {
    const input = sample()
    input.servers[0].pokeauroraProfiles = profilesCopy()
    const result = sanitizeDistribution(input)
    assert.deepEqual(result.servers[0].pokeauroraProfiles, profilesCopy())
})

test('drops profiles with a missing tier', () => {
    const input = sample()
    const profiles = profilesCopy()
    delete profiles.profiles.pro
    input.servers[0].pokeauroraProfiles = profiles
    assert.equal(sanitizeDistribution(input).servers[0].pokeauroraProfiles, undefined)
})

test('drops profiles with bad ramGB', () => {
    const profiles = profilesCopy()
    profiles.profiles.lite.ramGB = 64
    assert.equal(sanitizeProfiles(profiles), null)
})

test('drops profiles with a malformed mod id', () => {
    const profiles = profilesCopy()
    profiles.profiles.lite.off.push('not an id')
    assert.equal(sanitizeProfiles(profiles), null)
})

test('unknown default profile falls back to normal', () => {
    const profiles = profilesCopy()
    profiles.default = 'ultra'
    assert.equal(sanitizeProfiles(profiles).default, 'normal')
})

test('keeps unknown server fields', () => {
    const input = sample()
    input.servers[0].foo = 1
    assert.equal(sanitizeDistribution(input).servers[0].foo, 1)
})

test('notice rejects http url but keeps the notice', () => {
    assert.deepEqual(
        sanitizeNotice({ title: 'Evento', body: 'Hoy a las 20', url: 'http://pokeaurora.com' }),
        { title: 'Evento', body: 'Hoy a las 20', url: null, until: null }
    )
})

test('notice without body is dropped', () => {
    const input = sample()
    input.servers[0].pokeauroraNotice = { title: 'Evento' }
    assert.equal(sanitizeDistribution(input).servers[0].pokeauroraNotice, undefined)
})

test('notice keeps https url and valid until', () => {
    assert.deepEqual(
        sanitizeNotice({ title: 'T', body: 'B', url: 'https://pokeaurora.com/evento', until: '2026-12-01T00:00:00Z' }),
        { title: 'T', body: 'B', url: 'https://pokeaurora.com/evento', until: '2026-12-01T00:00:00Z' }
    )
    assert.equal(sanitizeNotice({ title: 'T', body: 'B', until: 'mañana' }).until, null)
})

test('accepts artifacts from launcher.pokeaurora.com', () => {
    const input = sample()
    input.servers[0].modules[0].artifact.url = 'https://launcher.pokeaurora.com/fancy.jar'
    assert.equal(sanitizeDistribution(input).servers[0].modules[0].artifact.url, 'https://launcher.pokeaurora.com/fancy.jar')
})

const { composePruebasServer, mergeStaffServer, PRUEBAS_ID } = require('../app/assets/js/staffaccess')

function pruebasLayer(url){
    return {
        id: PRUEBAS_ID,
        name: 'Pruebas',
        address: 'pruebas.pokeaurora.com',
        base: 'PokeAurora-1.21.1',
        replace: {
            'de.keksuccino:fancymenu:3.9.1@jar': { id: 'generated.fabricmod:pokeaurora:1.0.0-pruebas.1@jar', name: 'PokeAurora (pruebas)', type: 'FabricMod', artifact: { size: 5, MD5: '0123456789abcdef0123456789abcdef', url } }
        },
        add: [],
        remove: []
    }
}

test('composed pruebas server passes the sanitizer as a secondary server', () => {
    const base = sanitizeDistribution(sample())
    base.servers[0].pokeauroraProfiles = { default: 'normal', profiles: {} }
    const merged = mergeStaffServer(base, { status: 'staff', layer: pruebasLayer('https://pub-16d8232ded904a1bbed89826fb24c57e.r2.dev/servers/PokeAurora-pruebas/p.jar') }, null)
    const result = sanitizeDistribution(merged)
    assert.deepEqual(result.servers.map(s => [s.id, s.mainServer]), [['PokeAurora-1.21.1', true], [PRUEBAS_ID, false]])
    assert.equal(result.servers[1].pokeauroraProfiles, undefined)
    assert.equal(result.servers[1].address, 'pruebas.pokeaurora.com')
})

test('pruebas layer with a foreign artifact host is rejected', () => {
    const base = sanitizeDistribution(sample())
    const server = composePruebasServer(base, pruebasLayer('https://evil.example.com/p.jar'))
    const merged = { ...base, servers: [...base.servers, server] }
    assert.throws(() => sanitizeDistribution(merged), /host is not allowed/)
})

test('accepts artifacts from video.pokeaurora.com (R2 propio, jar de pruebas)', () => {
    const input = sample()
    input.servers[0].modules[0].artifact.url = 'https://video.pokeaurora.com/launcher/pruebas/p.jar'
    assert.equal(sanitizeDistribution(input).servers[0].modules[0].artifact.url, 'https://video.pokeaurora.com/launcher/pruebas/p.jar')
})
