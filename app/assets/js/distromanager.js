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

// Old WesterosCraft url.
// exports.REMOTE_DISTRO_URL = 'https://zelthoriaismp.cloud/nebula/distribution.json'
exports.REMOTE_DISTRO_URL = 'https://pub-16d8232ded904a1bbed89826fb24c57e.r2.dev/distribution.json'

const logger = LoggerUtil.getLogger('PokeAuroraDistributionAPI')
const MANAGED_FILE_CLEANUP_HOOK = Symbol('pokeAuroraManagedFileCleanupHook')

/**
 * Helios runs FullRepairReceiver in a separate child process, so patching the
 * receiver's DistributionIndexProcessor prototype here would not affect the
 * actual repair process. FullRepair.download()/verifyFiles() execute in the
 * renderer process after the child process has completed its work, which is
 * the safe place to remove files that disappeared from the distribution.
 */
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
            // Cleanup must never prevent the launcher from finishing a valid
            // repair. The helper only updates its manifest after its checks.
            logger.warn('Unable to clean stale PokeAurora-managed files.', error)
        }
    }

    prototype.verifyFiles = async function(onProgress){
        const invalidFileCount = await originalVerifyFiles.call(this, onProgress)

        // If there is nothing to download, verifyFiles is the end of the
        // repair flow. We can safely clean stale files now.
        if(invalidFileCount === 0){
            await cleanup()
        }

        return invalidFileCount
    }

    prototype.download = async function(onProgress){
        // If Helios cannot complete the download, this rejects and cleanup is
        // intentionally skipped. Existing files are therefore preserved.
        await originalDownload.call(this, onProgress)

        // At this point FullRepair has received downloadComplete, which means
        // the child receiver completed its entire download/postDownload flow.
        await cleanup()
    }

    prototype[MANAGED_FILE_CLEANUP_HOOK] = true
}

installManagedFileCleanupHook()

class PokeAuroraDistributionAPI extends DistributionAPI {
    async pullRemote(){
        const response = await super.pullRemote()
        if(response.data != null){
            try {
                response.data = sanitizeDistribution(response.data)
                logger.info(`Loaded remote distribution successfully (${response.data.servers.length} server(s)).`)
            } catch(error) {
                DistributionAPI.log.error('Rejected an unsafe or malformed remote distribution.', error)
                response.data = null
            }
        } else {
            logger.warn('Remote distribution could not be loaded; Helios will use the cached distribution if available.')
        }
        return response
    }

    async pullLocal(){
        const local = await super.pullLocal()
        if(local == null){
            return null
        }
        try {
            return sanitizeDistribution(local)
        } catch(error) {
            DistributionAPI.log.error('Rejected an unsafe or malformed cached distribution.', error)
            return null
        }
    }

    async writeDistributionToDisk(distribution){
        const launcherDirectory = ConfigManager.getLauncherDirectory()
        const distributionPath = path.join(launcherDirectory, 'distribution.json')

        // Before replacing the cached distribution, turn the previous one into
        // the ownership manifest. This makes the first update after installing
        // this cleanup feature capable of removing files from the old pack,
        // without ever claiming arbitrary user-created files as managed.
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
            // Keep any existing manifest if the previous distribution cannot be
            // read. A failed snapshot must never result in broader deletion.
            logger.warn('Unable to snapshot the previous distribution for managed-file cleanup.', error)
        }

        await super.writeDistributionToDisk(distribution)
    }
}

const api = new PokeAuroraDistributionAPI(
    ConfigManager.getLauncherDirectory(),
    null, // Injected forcefully by the preloader.
    null, // Injected forcefully by the preloader.
    exports.REMOTE_DISTRO_URL,
    false
)

exports.DistroAPI = api
