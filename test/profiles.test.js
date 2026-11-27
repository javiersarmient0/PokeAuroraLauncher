const test = require('node:test')
const assert = require('node:assert/strict')

const {
    DEFAULT_PROFILES,
    PROFILE_IDS,
    resolveProfiles,
    applyProfileToMods,
    detectProfile,
    recommendProfile,
    recommendedRamGB,
    countEnabledOptional
} = require('../app/assets/js/profiles')

const GiB = 1024 ** 3
const P = DEFAULT_PROFILES.profiles

function allOn(){
    const mods = {}
    for(const id of P.lite.off){
        mods[id] = true
    }
    mods['net.caffeinemc.mods:sodium'] = true
    mods['me.flashyreese.mods.sodiumextra:sodium-extra'] = { value: true, mods: { 'x:y': true } }
    return mods
}

test('lite off list has 34 ids, normal 5, pro 0', () => {
    assert.deepEqual(PROFILE_IDS, ['lite', 'normal', 'pro'])
    assert.equal(P.lite.off.length, 34)
    assert.equal(new Set(P.lite.off).size, 34)
    assert.equal(P.normal.off.length, 5)
    assert.equal(P.pro.off.length, 0)
    assert.equal(DEFAULT_PROFILES.default, 'normal')
    assert.deepEqual([P.lite.ramGB, P.normal.ramGB, P.pro.ramGB], [4, 6, 8])
})

test('normal off is a subset of lite off', () => {
    for(const id of P.normal.off){
        assert.ok(P.lite.off.includes(id), id)
    }
})

test('no profile disables a dependency of a required mod', () => {
    const protectedIds = ['de.maxhenkel:voicechat', 'com.terraformersmc:modmenu', 'dev.kosmx.playerAnim:playeranimator', 'net.caffeinemc.mods:sodium']
    for(const id of PROFILE_IDS){
        for(const p of protectedIds){
            assert.ok(!P[id].off.includes(p), `${id} disables ${p}`)
        }
    }
})

test('graphics per profile match the spec', () => {
    assert.deepEqual(P.lite.graphics, { renderDistance: 8, simulationDistance: 6, graphicsMode: 0, particles: 1, disableResourcePacks: ['file/FreshAnimations', 'file/FA+', 'file/animated-items'] })
    assert.deepEqual(P.normal.graphics, { renderDistance: 10, simulationDistance: 8, graphicsMode: 1, particles: 0, disableResourcePacks: [] })
    assert.deepEqual(P.pro.graphics, { renderDistance: 12, simulationDistance: 10, graphicsMode: 1, particles: 0, disableResourcePacks: [] })
})

test('applyProfileToMods keeps object shape', () => {
    const input = { 'a:b': { value: true, mods: { 'c:d': true } }, 'generated.fabricmod:iris': true }
    const out = applyProfileToMods(input, P.lite)
    assert.deepEqual(out, { 'a:b': { value: true, mods: { 'c:d': true } }, 'generated.fabricmod:iris': false })
    assert.equal(input['generated.fabricmod:iris'], true, 'input must not be mutated')
})

test('applyProfileToMods turns object entries off through value', () => {
    const out = applyProfileToMods({ 'generated.fabricmod:iris': { value: true, mods: {} } }, P.normal)
    assert.deepEqual(out, { 'generated.fabricmod:iris': { value: false, mods: {} } })
})

test('detectProfile round-trips each profile', () => {
    for(const id of PROFILE_IDS){
        assert.equal(detectProfile(applyProfileToMods(allOn(), P[id]), DEFAULT_PROFILES), id)
    }
})

test('detectProfile returns custom after manual toggle', () => {
    const mods = applyProfileToMods(allOn(), P.lite)
    mods['generated.fabricmod:iris'] = true
    assert.equal(detectProfile(mods, DEFAULT_PROFILES), 'custom')
})

test('detectProfile treats a disabled non-profile mod as custom', () => {
    const mods = applyProfileToMods(allOn(), P.pro)
    mods['net.caffeinemc.mods:sodium'] = false
    assert.equal(detectProfile(mods, DEFAULT_PROFILES), 'custom')
})

test('ids missing from modsCfg are ignored', () => {
    const mods = allOn()
    delete mods['visuality:visuality']
    const lite = applyProfileToMods(mods, P.lite)
    assert.equal(lite['visuality:visuality'], undefined)
    assert.equal(detectProfile(lite, DEFAULT_PROFILES), 'lite')
    const total = Object.keys(mods).length
    assert.deepEqual(countEnabledOptional(mods, P.lite), { enabled: total - 33, total })
    assert.deepEqual(countEnabledOptional(mods, P.pro), { enabled: total, total })
})

test('recommendProfile thresholds', () => {
    assert.equal(recommendProfile(6 * GiB), 'lite')
    assert.equal(recommendProfile(8 * GiB), 'normal')
    assert.equal(recommendProfile(15.9 * GiB), 'normal')
    assert.equal(recommendProfile(16 * GiB), 'pro')
})

test('recommendedRamGB caps by machine', () => {
    assert.equal(recommendedRamGB(P.pro, 8 * GiB), 5)
    assert.equal(recommendedRamGB(P.lite, 4 * GiB), 3)
    assert.equal(recommendedRamGB(P.normal, 32 * GiB), 6)
})

test('resolveProfiles falls back', () => {
    assert.equal(resolveProfiles({}), DEFAULT_PROFILES)
    assert.equal(resolveProfiles(null), DEFAULT_PROFILES)
    const custom = { default: 'lite', profiles: { lite: P.lite, normal: P.normal, pro: P.pro } }
    assert.equal(resolveProfiles({ pokeauroraProfiles: custom }), custom)
})

test('lite turns off the resource pack helpers', () => {
    assert.ok(P.lite.off.includes('generated.fabricmod:packed_packs'))
    assert.ok(P.lite.off.includes('me.drex.quickpack:quick-pack'))
    assert.ok(!P.normal.off.includes('generated.fabricmod:packed_packs'))
})

test('profileTagFor: lowest profile that includes the mod', () => {
    const { profileTagFor, DEFAULT_PROFILES } = require('../app/assets/js/profiles')
    assert.equal(profileTagFor('com.example:not-listed', DEFAULT_PROFILES), 'lite')
    assert.equal(profileTagFor('de.keksuccino:fancymenu', DEFAULT_PROFILES), 'normal')
    assert.equal(profileTagFor('generated.fabricmod:iris', DEFAULT_PROFILES), 'pro')
    assert.equal(profileTagFor('com.goby56:wakes', DEFAULT_PROFILES), 'pro')
})
