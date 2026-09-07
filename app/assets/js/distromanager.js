const { DistributionAPI } = require('helios-core/common')
const { DistributionIndexProcessor } = require('helios-core/dl')
const { LoggerUtil } = require('helios-core')
const { sanitizeDistribution } = require('./distributionsanitizer')
const { cleanupRemovedManagedFiles } = require('./managedfiles')

const ConfigManager = require('./configmanager')

// Old WesterosCraft url.
// exports.REMOTE_DISTRO_URL = 'https://zelthoriaismp.cloud/nebula/distribution.json'
exports.REMOTE_DISTRO_URL = 'https://pub-16d8232ded904a1bbed89826fb24c57e.r2.dev/distribution.json'

const logger = LoggerUtil.getLogger('PokeAuroraDistributionAPI')

/**
 * Helios calls DistributionIndexProcessor.postDownload() only after the
 * complete download queue has finished. This is the safe point to remove
 * files that disappeared from the current distribution.
 *
 * The hook is installed once because the preload/renderer environment can
 * load this module more than once during development.
 */
function installManagedFileCleanupHook(){
    const prototype = DistributionIndexProcessor?.prototype
    if(prototype == null || prototype.__pokeAuroraManagedFileCleanupInstalled){
        return
    }

    const originalPostDownload = prototype.postDownload
    if(typeof originalPostDownload !== 'function'){
        logger.warn('Helios DistributionIndexProcessor.postDownload() is unavailable; managed file cleanup is disabled.')
        return
    }

    prototype.postDownload = async function(){
        // Keep Helios' own post-download work first. If it fails, cleanup is
        // intentionally skipped so a broken repair can never cause deletion.
        await originalPostDownload.call(this)

        try {
            const result = await cleanupRemovedManagedFiles({
                launcherDirectory: ConfigManager.getLauncherDirectory(),
                distribution: this.distribution,
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

    prototype.__pokeAuroraManagedFileCleanupInstalled = true
}

installManagedFileCleanupHook()

class PokeAuroraDistributionAPI extends DistributionAPI {
    async pullRemote(){
        const response = await super.pullRemote()
        if(response.data != null){
            try {
                response.data = sanitizeDistribution(response.data)
            } catch(error) {
                DistributionAPI.log.error('Rejected an unsafe or malformed remote distribution.', error)
                response.data = null
            }
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
}

const api = new PokeAuroraDistributionAPI(
    ConfigManager.getLauncherDirectory(),
    null, // Injected forcefully by the preloader.
    null, // Injected forcefully by the preloader.
    exports.REMOTE_DISTRO_URL,
    false
)

exports.DistroAPI = api
