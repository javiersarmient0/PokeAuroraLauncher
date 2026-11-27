const crypto = require('crypto')
const { PROFILE_IDS } = require('./profiles')

const ALLOWED_ARTIFACT_HOSTS = new Set([
    'pub-16d8232ded904a1bbed89826fb24c57e.r2.dev',
    'launcher.pokeaurora.com',
    // R2 propio (cuenta de PokeAurora): jar del mod cliente de pruebas para el staff.
    'video.pokeaurora.com'
])

const REMOVED_MODULE_IDS = new Set([
    'generated.fabricmod:packed_packs:2.1.2+1.21.1@jar',
    'me.drex.quickpack:quick-pack:1.3.3@jar'
])

const ALLOWED_MODULE_TYPES = new Set([
    'Library',
    'ForgeHosted',
    'Forge',
    'Fabric',
    'LiteLoader',
    'ForgeMod',
    'FabricMod',
    'LiteMod',
    'File',
    'VersionManifest'
])

function clone(value){
    return JSON.parse(JSON.stringify(value))
}

function isPlaceholder(value){
    return typeof value === 'string' && /<[^>]*(?:FILL|LINK)[^>]*>/i.test(value)
}

function pathIsUnsafe(value){
    const normalized = value.replace(/\\/g, '/')
    return normalized.startsWith('/')
        || /^[a-zA-Z]:\//.test(normalized)
        || normalized.split('/').some(part => part === '..')
        || normalized.includes('\u0000')
}

function validateArtifact(artifact, moduleType, hasId){
    if(artifact == null || !Number.isSafeInteger(artifact.size) || artifact.size < 0){
        throw new Error('Distribution module contains an invalid artifact size.')
    }
    if(typeof artifact.MD5 !== 'string' || !/^[a-f0-9]{32}$/i.test(artifact.MD5)){
        throw new Error('Distribution module contains an invalid MD5 checksum.')
    }
    if(typeof artifact.url !== 'string' || artifact.url.length === 0){
        throw new Error('Distribution module contains an invalid artifact URL.')
    }

    const parsed = new URL(artifact.url)
    if(parsed.protocol !== 'https:' || !ALLOWED_ARTIFACT_HOSTS.has(parsed.hostname)){
        throw new Error(`Distribution artifact host is not allowed: ${parsed.hostname}`)
    }
    artifact.url = parsed.toString()

    if(artifact.path != null && (typeof artifact.path !== 'string' || artifact.path.length === 0 || pathIsUnsafe(artifact.path))){
        throw new Error('Distribution module contains an invalid artifact path.')
    }

    if(moduleType === 'File' && artifact.path == null && !hasId){
        throw new Error('Distribution File module must declare an artifact path or id.')
    }
}

function sanitizeModules(modules){
    if(!Array.isArray(modules)){
        throw new Error('Distribution modules must be an array.')
    }

    return modules
        .filter(module => module != null && !REMOVED_MODULE_IDS.has(module.id))
        .map(module => {
            if(module == null || typeof module !== 'object'){
                throw new Error('Distribution module must be an object.')
            }

            const type = typeof module.type === 'string' ? module.type : null
            if(type == null || !ALLOWED_MODULE_TYPES.has(type)){
                throw new Error(`Distribution module has an invalid or missing type: ${String(module.type)}`)
            }

            const hasId = typeof module.id === 'string' && module.id.length > 0
            const hasPathBasedFile = type === 'File'
                && module.artifact != null
                && typeof module.artifact.path === 'string'
                && module.artifact.path.length > 0

            if(!hasId && !hasPathBasedFile){
                throw new Error(`Distribution ${type} module is missing its id.`)
            }

            if(hasId){
                const validId = module.id.length <= 240
                    && (type === 'File'
                        ? !/[\u0000-\u001f\u007f]/.test(module.id)
                        : /^[a-zA-Z0-9_.:+@-]+$/.test(module.id))
                if(!validId){
                    throw new Error(`Distribution ${type} module has an invalid id.`)
                }
            }

            validateArtifact(module.artifact, type, hasId)
            module.name = String(module.name || module.id || module.artifact.path).slice(0, 160)
            if(module.subModules != null){
                module.subModules = sanitizeModules(module.subModules)
            }
            return module
        })
}

const MOD_ID = /^[\w.-]+:[\w.-]+$/

function intInRange(value, min, max){
    return Number.isInteger(value) && value >= min && value <= max
}

function sanitizeProfile(profile){
    if(profile == null || typeof profile !== 'object') return null
    const { name, ramGB, off, graphics } = profile
    if(typeof name !== 'string' || name.length === 0 || name.length > 40) return null
    if(!intInRange(ramGB, 2, 32)) return null
    if(!Array.isArray(off) || !off.every(id => typeof id === 'string' && MOD_ID.test(id))) return null
    if(graphics == null || typeof graphics !== 'object') return null
    if(!intInRange(graphics.renderDistance, 2, 32) || !intInRange(graphics.simulationDistance, 2, 32)) return null
    if(!intInRange(graphics.graphicsMode, 0, 2) || !intInRange(graphics.particles, 0, 2)) return null
    const packs = graphics.disableResourcePacks
    if(!Array.isArray(packs) || !packs.every(pack => typeof pack === 'string' && pack.length <= 80)) return null
    return {
        name,
        ramGB,
        off: [...off],
        graphics: {
            renderDistance: graphics.renderDistance,
            simulationDistance: graphics.simulationDistance,
            graphicsMode: graphics.graphicsMode,
            particles: graphics.particles,
            disableResourcePacks: [...packs]
        }
    }
}

function sanitizeProfiles(raw){
    if(raw == null || typeof raw !== 'object' || raw.profiles == null || typeof raw.profiles !== 'object') return null
    const keys = Object.keys(raw.profiles)
    if(keys.length !== PROFILE_IDS.length || !PROFILE_IDS.every(id => keys.includes(id))) return null
    const profiles = {}
    for(const id of PROFILE_IDS){
        const profile = sanitizeProfile(raw.profiles[id])
        if(profile == null) return null
        profiles[id] = profile
    }
    return {
        default: PROFILE_IDS.includes(raw.default) ? raw.default : 'normal',
        profiles
    }
}

function sanitizeNotice(raw){
    if(raw == null || typeof raw !== 'object') return null
    const { title, body } = raw
    if(typeof title !== 'string' || title.length === 0 || title.length > 80) return null
    if(typeof body !== 'string' || body.length === 0 || body.length > 400) return null
    let url = null
    if(typeof raw.url === 'string'){
        try {
            url = new URL(raw.url).protocol === 'https:' ? raw.url : null
        } catch {
            url = null
        }
    }
    const until = typeof raw.until === 'string' && !Number.isNaN(Date.parse(raw.until)) ? raw.until : null
    return { title, body, url, until }
}

function sanitizeDistribution(input){
    const distribution = clone(input)
    if(distribution == null || !Array.isArray(distribution.servers) || distribution.servers.length === 0){
        throw new Error('Distribution does not contain any server.')
    }

    distribution.version = '1.0.0'
    if(isPlaceholder(distribution.rss)){
        distribution.rss = null
    }
    if(distribution.discord && Object.values(distribution.discord).some(isPlaceholder)){
        delete distribution.discord
    }

    const hasExplicitMainServer = distribution.servers.some(server => server?.mainServer === true)

    distribution.servers = distribution.servers.map((server, index) => {
        if(typeof server.id !== 'string' || !/^[a-zA-Z0-9_.-]+$/.test(server.id) || typeof server.address !== 'string'){
            throw new Error('Distribution server is missing its id or address.')
        }
        server.version = '1.0.0'
        server.mainServer = hasExplicitMainServer ? server.mainServer === true : index === 0
        server.autoconnect = server.autoconnect === true
        server.icon = 'assets/images/SealCircle.png'
        server.name = String(server.name || server.id).slice(0, 160)
        server.description = String(server.description || '').slice(0, 500)
        if(server.discord && Object.values(server.discord).some(isPlaceholder)){
            delete server.discord
        }
        server.modules = sanitizeModules(server.modules)
        const profiles = sanitizeProfiles(server.pokeauroraProfiles)
        if(profiles == null) delete server.pokeauroraProfiles
        else server.pokeauroraProfiles = profiles
        const notice = sanitizeNotice(server.pokeauroraNotice)
        if(notice == null) delete server.pokeauroraNotice
        else server.pokeauroraNotice = notice
        return server
    })

    return distribution
}

function assertTrustedDistribution(input){
    const actual = crypto.createHash('sha256').update(JSON.stringify(input)).digest('hex')
    if(actual !== TRUSTED_DISTRIBUTION_SHA256){
        throw new Error('Remote distribution fingerprint is not trusted.')
    }
}

const TRUSTED_DISTRIBUTION_SHA256 = '34ccd5f27824ffdea53f2f2ad37682139fcb929bd419125f9845166c88509021'

module.exports = {
    assertTrustedDistribution,
    sanitizeDistribution,
    sanitizeProfiles,
    sanitizeNotice
}
