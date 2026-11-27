const fs = require('fs-extra')
const path = require('path')
const { DistributionAPI } = require('helios-core/common')
const { FullRepair } = require('helios-core/dl')
const { LoggerUtil } = require('helios-core')
const { sanitizeDistribution } = require('./distributionsanitizer')
const { REMOTE_DISTRO_URLS, pullFirstValid, readBundledDistribution } = require('./distrofetch')
const { PRUEBAS_ID, applyStaffAccess } = require('./staffaccess')
const {
    getModulePaths,
    writeManifest,
    cleanupRemovedManagedFiles
} = require('./managedfiles')

const ConfigManager = require('./configmanager')

exports.REMOTE_DISTRO_URLS = REMOTE_DISTRO_URLS
exports.REMOTE_DISTRO_URL = REMOTE_DISTRO_URLS[0]
const APP_DIR = path.join(__dirname, '..', '..')

const logger = LoggerUtil.getLogger('PokeAuroraDistributionAPI')
const MANAGED_FILE_CLEANUP_HOOK = Symbol('pokeAuroraManagedFileCleanupHook')

function installManagedFileCleanupHook(){
    const prototype = FullRepair?.prototype
    if(prototype == null || prototype[MANAGED_FILE_CLEANUP_HOOK]){
        return
    }

    const originalVerifyFiles = prototype.verifyFiles
    const originalDownload = prototype.download

    if(typeof originalVerifyFiles !== 'function' || typeof originalDownload !== 'function'){
        logger.warn('Helios FullRepair methods are unavailable; managed file cleanup is disabled.')
        return
    }

    const cleanup = async () => {
        try {
            const result = await cleanupRemovedManagedFiles({
                launcherDirectory: ConfigManager.getLauncherDirectory(),
                distribution: await exports.DistroAPI.getDistribution(),
                commonDirectory: ConfigManager.getCommonDirectory(),
                instanceDirectory: ConfigManager.getInstanceDirectory(),
                logger
            })

            if(result.removed.length > 0){
                logger.info(`Removed ${result.removed.length} stale PokeAurora-managed file(s).`)
            }
            if(result.skipped.length > 0){
                logger.warn(`Skipped ${result.skipped.length} stale managed file(s) during cleanup.`)
            }
        } catch(error) {
            logger.warn('Unable to clean stale PokeAurora-managed files.', error)
        }
    }

    prototype.verifyFiles = async function(onProgress){
        const invalidFileCount = await originalVerifyFiles.call(this, onProgress)
        if(invalidFileCount === 0){
            await cleanup()
        }
        return invalidFileCount
    }

    prototype.download = async function(onProgress){
        await originalDownload.call(this, onProgress)
        await cleanup()
    }

    prototype[MANAGED_FILE_CLEANUP_HOOK] = true
}

installManagedFileCleanupHook()

class PokeAuroraDistributionAPI extends DistributionAPI {
    async pullRemote(){
        const originalRemoteUrl = this.remoteUrl
        try {
            const pullOne = async url => {
                const separator = url.includes('?') ? '&' : '?'
                this.remoteUrl = `${url}${separator}_=${Date.now()}`
                return await super.pullRemote()
            }
            const pulled = await pullFirstValid(exports.REMOTE_DISTRO_URLS, pullOne, sanitizeDistribution)
            const url = pulled.url
            let data = pulled.data
            if(data != null){
                data = await applyStaffAccess(data, {
                    nick: ConfigManager.getSelectedAccount()?.displayName,
                    cachedPruebas: await this.readCachedPruebas(),
                    sanitize: sanitizeDistribution,
                    logger
                })
                const moduleCount = countDistributionModules(data)
                logger.info(`Loaded remote distribution from ${url} (${data.servers.length} server(s), ${moduleCount} module file(s)).`)
                this.usingBundledFallback = false
            } else {
                logger.warn('No remote distribution could be loaded; using the cached or bundled copy.')
            }
            return { data, responseStatus: data != null ? 0 : 1 }
        } finally {
            this.remoteUrl = originalRemoteUrl
        }
    }

    // Servidor de pruebas de la última distribución conocida (memoria o disco), para staff sin conexión al Worker.
    async readCachedPruebas(){
        const fromMemory = this.rawDistribution?.servers?.find(server => server?.id === PRUEBAS_ID)
        if(fromMemory != null){
            return fromMemory
        }
        try {
            const cached = await super.pullLocal()
            return cached?.servers?.find(server => server?.id === PRUEBAS_ID) || null
        } catch {
            return null
        }
    }

    async pullLocal(){
        const local = await super.pullLocal()
        if(local != null){
            try {
                return sanitizeDistribution(local)
            } catch(error) {
                DistributionAPI.log.error('Rejected unsafe or malformed cached distribution.', error)
            }
        }
        const bundled = readBundledDistribution(APP_DIR, sanitizeDistribution)
        if(bundled != null){
            logger.warn('Using the distribution bundled with the launcher (offline mode).')
            this.usingBundledFallback = true
        }
        return bundled
    }

    async writeDistributionToDisk(distribution){
        const launcherDirectory = ConfigManager.getLauncherDirectory()
        const distributionPath = path.join(launcherDirectory, 'distribution.json')

        try {
            if(await fs.pathExists(distributionPath)){
                const previousApi = new DistributionAPI(
                    launcherDirectory,
                    ConfigManager.getCommonDirectory(),
                    ConfigManager.getInstanceDirectory(),
                    null,
                    false
                )
                const previousDistribution = await previousApi.getDistributionLocalLoadOnly()
                await writeManifest(launcherDirectory, getModulePaths(previousDistribution))
                logger.info('Prepared the managed-file manifest from the previous distribution.')
            }
        } catch(error) {
            logger.warn('Unable to snapshot the previous distribution for managed-file cleanup.', error)
        }

        await super.writeDistributionToDisk(distribution)
    }
}

function countDistributionModules(distribution){
    let count = 0
    for(const server of distribution?.servers || []){
        count += countModules(server.modules || [])
    }
    return count
}

function countModules(modules){
    let count = 0
    for(const module of modules){
        if(module == null){
            continue
        }
        count += 1
        if(Array.isArray(module.subModules)){
            count += countModules(module.subModules)
        }
    }
    return count
}

const api = new PokeAuroraDistributionAPI(
    ConfigManager.getLauncherDirectory(),
    null,
    null,
    exports.REMOTE_DISTRO_URL,
    false
)

exports.DistroAPI = api
