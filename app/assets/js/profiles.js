// Perfiles de PokeAurora: un perfil es un preset de los mods opcionales de la distribución.
// Lite = lo mínimo para entrar + Voice Chat; Normal = equilibrio; Pro = todo lo que ya existe.
// Los ids son Maven sin versión (grupo:artefacto), igual que modConfigurations.

const GiB = 1024 ** 3

const COMFORT = [
    'de.keksuccino:fancymenu',
    'com.levelsfr:catchindicator',
    'name.modid:cobblemon-battle-extras',
    'me.justahuman:more_cobblemon_tweaks',
    'net.darkhax.enchdesc.fabric.impl:enchdesc',
    'yalter.mousetweaks:mousetweaks',
    'generated.fabricmod:languagereload',
    'com.github.exopandora:shouldersurfing',
    'io.github.kosmx.emotes:emotecraft',
    'generated.fabricmod:packed_packs',
    'me.drex.quickpack:quick-pack'
]
const DECOR = [
    'dzwdz.chat_heads:chat_heads',
    'com.anthonyhilyard:advancementplaques',
    'com.yungnickyoung.minecraft:travelerstitles',
    'com.anthonyhilyard:legendarytooltips',
    'com.anthonyhilyard:itemborders',
    'it.hurts.octostudios:immersiveui',
    'com.imeetake:itemzoomer',
    'mix.cinematiczoom:cinematiczoom',
    'me.jfenn.scoreboardoverhaul:scoreboard-overhaul',
    'de.keksuccino:drippyloadingscreen',
    'generated.fabricmod:ji_afk_cinematic_group',
    'com.ezzenix:chatanimation',
    'ru.tpsd.eatinganimationmod:eatinganimationid',
    'me.zipestudio.ebte.entrypoint:emotecraft_borrow_their_emote'
]
const MODELS = [
    'traben.entity_model_features:entity_model_features',
    'traben.entity_texture_features:entity_texture_features',
    'punchy:punchy',
    'com.qendolin:betterclouds'
]
const HEAVY = [
    'einstein.subtle_effects:subtle_effects',
    'pigcart.particlerain.loaders:particlerain',
    'com.goby56:wakes',
    'visuality:visuality'
]
const SHADERS = ['generated.fabricmod:iris']

const PROFILE_IDS = ['lite', 'normal', 'pro']

const DEFAULT_PROFILES = Object.freeze({
    default: 'normal',
    profiles: {
        lite: {
            name: 'Lite',
            ramGB: 4,
            off: [...COMFORT, ...DECOR, ...MODELS, ...HEAVY, ...SHADERS],
            graphics: { renderDistance: 8, simulationDistance: 6, graphicsMode: 0, particles: 1, disableResourcePacks: ['file/FreshAnimations', 'file/FA+', 'file/animated-items'] }
        },
        normal: {
            name: 'Normal',
            ramGB: 6,
            off: [...HEAVY, ...SHADERS],
            graphics: { renderDistance: 10, simulationDistance: 8, graphicsMode: 1, particles: 0, disableResourcePacks: [] }
        },
        pro: {
            name: 'Pro',
            ramGB: 8,
            off: [],
            graphics: { renderDistance: 12, simulationDistance: 10, graphicsMode: 1, particles: 0, disableResourcePacks: [] }
        }
    }
})

function resolveProfiles(rawServer){
    return rawServer?.pokeauroraProfiles ?? DEFAULT_PROFILES
}

function isEnabled(value){
    return typeof value === 'object' && value !== null ? value.value !== false : value !== false
}

function applyProfileToMods(modsCfg, profile){
    const out = {}
    for(const [id, value] of Object.entries(modsCfg || {})){
        const enabled = !profile.off.includes(id)
        out[id] = typeof value === 'object' && value !== null
            ? { ...value, value: enabled }
            : enabled
    }
    return out
}

function detectProfile(modsCfg, profiles){
    const entries = Object.entries(modsCfg || {})
    for(const id of PROFILE_IDS){
        const profile = profiles.profiles[id]
        if(entries.every(([modId, value]) => isEnabled(value) === !profile.off.includes(modId))){
            return id
        }
    }
    return 'custom'
}

function recommendProfile(totalMemBytes){
    if(totalMemBytes < 8 * GiB) return 'lite'
    if(totalMemBytes < 16 * GiB) return 'normal'
    return 'pro'
}

function recommendedRamGB(profile, totalMemBytes){
    return Math.min(profile.ramGB, Math.max(3, Math.floor(totalMemBytes / GiB) - 3))
}

/**
 * Perfil más bajo que incluye el mod: lite si ningún perfil lo apaga, normal si solo Lite lo apaga, pro si Normal también.
 */
function profileTagFor(modId, profiles){
    if(profiles.profiles.normal.off.includes(modId)) return 'pro'
    if(profiles.profiles.lite.off.includes(modId)) return 'normal'
    return 'lite'
}

function countEnabledOptional(modsCfg, profile){
    const ids = Object.keys(modsCfg || {})
    return {
        enabled: ids.filter(id => !profile.off.includes(id)).length,
        total: ids.length
    }
}

module.exports = {
    DEFAULT_PROFILES,
    PROFILE_IDS,
    resolveProfiles,
    applyProfileToMods,
    detectProfile,
    recommendProfile,
    recommendedRamGB,
    countEnabledOptional,
    profileTagFor
}
