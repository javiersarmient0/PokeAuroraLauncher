const fs = require('fs-extra')
const path = require('path')
const {
    DistributionIndexProcessor,
    HashAlgo,
    MojangIndexProcessor,
    downloadFile
} = require('helios-core/dl')
const { HeliosDistribution, validateLocalFile } = require('helios-core/common')
const { Type } = require('helios-distribution-types')

const MOD_TYPES = new Set([Type.ForgeMod, Type.LiteMod, Type.LiteLoader, Type.FabricMod])

function clone(value){
    return JSON.parse(JSON.stringify(value))
}

function configEnabled(value, required){
    if(value != null){
        return typeof value === 'boolean' ? value : value.value !== false
    }
    return required?.def !== false
}

function isLocallyDisabled(target){
    if(typeof target !== 'string' || target.length === 0){
        return false
    }

    // A disabled mod is intentionally kept on disk with a .disabled suffix.
    // Never treat it as missing just because the remote distribution still
    // contains the module. This preserves the user's local enable/disable state.
    if(fs.existsSync(`${target}.disabled`)){
        return true
    }

    // Be tolerant of older launcher versions which may have created numbered
    // disabled markers while repeatedly testing the same mod.
    for(let index = 2; index <= 10; index++){
        if(fs.existsSync(`${target}.disabled${index}`)){
            return true
        }
    }

    return false
}

function filterModules(modules, configuration){
    const selected = []
    for(const module of modules){
        const required = module.getRequired()
        const isMod = MOD_TYPES.has(module.rawModule.type)
        const key = isMod ? module.getVersionlessMavenIdentifier() : null
        const configured = key == null ? null : configuration?.[key]
        if(isMod && required.value === false && !configEnabled(configured, required)){
            continue
        }

        const raw = clone(module.rawModule)
        if(module.subModules.length > 0){
            const childConfiguration = configured && typeof configured === 'object'
                ? configured.mods
                : configuration?.[key]?.mods
            raw.subModules = filterModules(module.subModules, childConfiguration || {})
        }
        selected.push(raw)
    }
    return selected
}

function buildSelectedDistribution(distribution, serverId, modConfiguration, commonDirectory, instanceDirectory){
    const raw = clone(distribution.rawDistribution)
    const selectedServer = distribution.getServerById(serverId)
    raw.servers = raw.servers
        .filter(server => server.id === serverId)
        .map(server => ({
            ...server,
            mainServer: true,
            modules: filterModules(selectedServer.modules, modConfiguration?.mods || {})
        }))
    return new HeliosDistribution(raw, commonDirectory, instanceDirectory)
}

function collectModules(modules, accumulator = []){
    for(const module of modules){
        accumulator.push(module)
        if(module.subModules.length > 0){
            collectModules(module.subModules, accumulator)
        }
    }
    return accumulator
}

function estimateSelectedSize(distribution, serverId, modConfiguration){
    const server = distribution.getServerById(serverId)
    const selected = filterModules(server.modules, modConfiguration?.mods || {})
    const sum = modules => modules.reduce((total, module) => {
        return total + module.artifact.size + sum(module.subModules || [])
    }, 0)
    return sum(selected)
}

class SmartRepair {
    constructor(commonDirectory, instanceDirectory, launcherDirectory, serverId, distribution, modConfiguration, forceDeep = false){
        this.commonDirectory = commonDirectory
        this.instanceDirectory = instanceDirectory
        this.launcherDirectory = launcherDirectory
        this.serverId = serverId
        this.distribution = buildSelectedDistribution(
            distribution,
            serverId,
            modConfiguration,
            commonDirectory,
            instanceDirectory
        )
        this.forceDeep = forceDeep
        this.assets = []
        this.cachePath = path.join(launcherDirectory, 'integrity-cache.json')
        this.cache = this.loadCache()
        this.processors = []
    }

    loadCache(){
        try {
            return fs.readJsonSync(this.cachePath)
        } catch(_error) {
            return { version: 1, files: {} }
        }
    }

    saveCache(){
        fs.writeJsonSync(this.cachePath, this.cache, { spaces: 2 })
    }

    spawnReceiver(){
        // Kept for API compatibility with the original FullRepair transmitter.
    }

    destroyReceiver(){
        // No child process is used by SmartRepair.
    }

    async verifyDistributionFiles(processor, onProgress){
        const server = this.distribution.getServerById(this.serverId)
        const modules = collectModules(server.modules)
        const invalid = []

        for(let index = 0; index < modules.length; index++){
            const module = modules[index]
            const artifact = module.rawModule.artifact
            const target = module.getPath()

            if(MOD_TYPES.has(module.rawModule.type) && isLocallyDisabled(target)){
                onProgress(Math.trunc(((index + 1) / Math.max(modules.length, 1)) * 100))
                continue
            }

            let valid = false
            try {
                const stat = await fs.stat(target)
                const cached = this.cache.files[target]
                valid = !this.forceDeep
                    && cached?.hash === artifact.MD5
                    && cached?.size === stat.size
                    && cached?.mtimeMs === stat.mtimeMs
                if(!valid){
                    valid = await validateLocalFile(target, HashAlgo.MD5, artifact.MD5)
                }
                if(valid){
                    this.cache.files[target] = {
                        hash: artifact.MD5,
                        size: stat.size,
                        mtimeMs: stat.mtimeMs
                    }
                }
            } catch(_error) {
                valid = false
            }

            if(!valid){
                invalid.push({
                    id: module.rawModule.id,
                    hash: artifact.MD5,
                    algo: HashAlgo.MD5,
                    size: artifact.size,
                    url: artifact.url,
                    path: target
                })
            }
            onProgress(Math.trunc(((index + 1) / Math.max(modules.length, 1)) * 100))
        }
        return invalid
    }

    async verifyFiles(onProgress){
        const server = this.distribution.getServerById(this.serverId)
        const mojang = new MojangIndexProcessor(this.commonDirectory, server.rawServer.minecraftVersion)
        const distribution = new DistributionIndexProcessor(this.commonDirectory, this.distribution, this.serverId)
        this.processors = [mojang, distribution]
        await Promise.all(this.processors.map(processor => processor.init()))

        const mojangResult = await mojang.validate(() => onProgress(40))
        const distributionAssets = await this.verifyDistributionFiles(
            distribution,
            percent => onProgress(40 + Math.trunc(percent * 0.6))
        )
        this.assets = [...Object.values(mojangResult).flat(), ...distributionAssets]
        this.saveCache()
        onProgress(100)
        return this.assets.length
    }

    async download(onProgress){
        const total = this.assets.reduce((sum, asset) => sum + asset.size, 0)
        if(total === 0){
            onProgress({ percent: 100, received: 0, total: 0, bytesPerSecond: 0, etaSeconds: 0 })
            return
        }

        let cursor = 0
        let received = 0
        const receivedByAsset = new Map()
        const startedAt = Date.now()
        const worker = async () => {
            while(cursor < this.assets.length){
                const asset = this.assets[cursor++]
                await downloadFile(asset.url, asset.path, ({ transferred }) => {
                    const previous = receivedByAsset.get(asset.id) || 0
                    received += transferred - previous
                    receivedByAsset.set(asset.id, transferred)
                    const elapsed = Math.max((Date.now() - startedAt) / 1000, 0.1)
                    const bytesPerSecond = received / elapsed
                    onProgress({
                        percent: Math.min(100, Math.trunc((received / total) * 100)),
                        received,
                        total,
                        bytesPerSecond,
                        etaSeconds: bytesPerSecond > 0 ? Math.max(0, (total - received) / bytesPerSecond) : null,
                        currentFile: asset.id
                    })
                })
                const valid = await validateLocalFile(asset.path, asset.algo, asset.hash)
                if(!valid){
                    throw new Error(`Downloaded file failed its integrity check: ${asset.id}`)
                }
                const stat = await fs.stat(asset.path)
                this.cache.files[asset.path] = { hash: asset.hash, size: stat.size, mtimeMs: stat.mtimeMs }
            }
        }

        await Promise.all(Array.from({ length: Math.min(6, this.assets.length) }, () => worker()))
        for(const processor of this.processors){
            await processor.postDownload()
        }
        this.saveCache()
        await fs.outputFile(path.join(this.instanceDirectory, this.serverId, '.install-complete'), '1.0.0\n')
        onProgress({ percent: 100, received: total, total, bytesPerSecond: 0, etaSeconds: 0 })
    }
}

module.exports = {
    SmartRepair,
    buildSelectedDistribution,
    estimateSelectedSize,
    isLocallyDisabled
}