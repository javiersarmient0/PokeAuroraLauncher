const fs = require('fs-extra')
const path = require('path')
const { DistributionAPI } = require('helios-core/common')
const { FullRepair } = require('helios-core/dl')
const { LoggerUtil } = require('helios-core')
const { sanitizeDistribution } = require('./distributionsanitizer')
const {
    getModulePaths,
    writeManifest,
    cleanupRemovedManagedFiles
} = require('./managedfiles')

const ConfigManager = require('./configmanager')

exports.REMOTE_DISTRO_URL = 'https://pub-16d8232ded904a1bbed89826fb24c57e.r2.dev/distribution.json'

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
        const separator = exports.REMOTE_DISTRO_URL.includes('?') ? '&' : '?'
        const remoteUrl = `${exports.REMOTE_DISTRO_URL}${separator}_=${Date.now()}`
        const originalRemoteUrl = this.remoteUrl
        this.remoteUrl = remoteUrl

        try {
            const response = await super.pullRemote()
            if(response.data != null){
                try {
                    response.data = sanitizeDistribution(response.data)
                    const moduleCount = countDistributionModules(response.data)
                    logger.info(`Loaded remote distribution successfully (${response.data.servers.length} server(s), ${moduleCount} module file(s)).`)
                } catch(error) {
                    DistributionAPI.log.error('Rejected an unsafe or malformed remote distribution.', error)
                    response.data = null
                }
            } else {
                logger.warn('Remote distribution could not be loaded; Helios will use the cached distribution if available.')
            }
            return response
        } finally {
            this.remoteUrl = originalRemoteUrl
        }
    }

    async pullLocal(){
        const local = await super.pullLocal()
        if(local == null){
            return null
        }
        try {
            return sanitizeDistribution(local)
        } catch(error) {
            DistributionAPI.log.error('Rejected unsafe or malformed cached distribution.', error)
            return null
        }
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
