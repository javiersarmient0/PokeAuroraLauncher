const ALLOWED_ARTIFACT_HOSTS = new Set([
    'pub-16d8232ded904a1bbed89826fb24c57e.r2.dev'
])

const REMOVED_MODULE_IDS = new Set([
    'generated.fabricmod:packed_packs:2.1.2+1.21.1@jar',
    'me.drex.quickpack:quick-pack:1.3.3@jar'
])

function clone(value){
    return JSON.parse(JSON.stringify(value))
}

function isPlaceholder(value){
    return typeof value === 'string' && /<[^>]*(?:FILL|LINK)[^>]*>/i.test(value)
}

function validateArtifact(artifact){
    if(artifact == null || !Number.isSafeInteger(artifact.size) || artifact.size < 0){
        throw new Error('Distribution module contains an invalid artifact size.')
    }
    if(typeof artifact.MD5 !== 'string' || !/^[a-f0-9]{32}$/i.test(artifact.MD5)){
        throw new Error('Distribution module contains an invalid MD5 checksum.')
    }
    const parsed = new URL(artifact.url)
    if(parsed.protocol !== 'https:' || !ALLOWED_ARTIFACT_HOSTS.has(parsed.hostname)){
        throw new Error(`Distribution artifact host is not allowed: ${parsed.hostname}`)
    }
    artifact.url = parsed.toString()
}

function sanitizeModules(modules){
    if(!Array.isArray(modules)){
        throw new Error('Distribution modules must be an array.')
    }
    return modules
        .filter(module => module != null && !REMOVED_MODULE_IDS.has(module.id))
        .map(module => {
            const validId = typeof module.id === 'string'
                && module.id.length <= 240
                && (module.type === 'File'
                    ? !/[<>"'`\u0000-\u001f]/.test(module.id)
                    : /^[a-zA-Z0-9_.:+@-]+$/.test(module.id))
            if(!validId || typeof module.type !== 'string'){
                throw new Error('Distribution module is missing its id or type.')
            }
            validateArtifact(module.artifact)
            module.name = String(module.name || module.id).slice(0, 160)
            if(module.subModules != null){
                module.subModules = sanitizeModules(module.subModules)
            }
            return module
        })
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
        // Do not force autoconnect. The remote distribution is the source of
        // truth for this setting, so adding or reordering servers cannot make
        // the launcher unexpectedly connect to one of them.
        server.autoconnect = server.autoconnect === true
        server.icon = 'assets/images/SealCircle.png'
        server.name = String(server.name || server.id).slice(0, 160)
        server.description = String(server.description || '').slice(0, 500)
        if(server.discord && Object.values(server.discord).some(isPlaceholder)){
            delete server.discord
        }
        server.modules = sanitizeModules(server.modules)
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

module.exports = {
    assertTrustedDistribution,
    sanitizeDistribution
}
const crypto = require('crypto')

const TRUSTED_DISTRIBUTION_SHA256 = '34ccd5f27824ffdea53f2f2ad37682139fcb929bd419125f9845166c88509021'
