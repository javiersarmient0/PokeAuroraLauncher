const { DistributionAPI } = require('helios-core/common')
const { LoggerUtil } = require('helios-core')
const { sanitizeDistribution } = require('./distributionsanitizer')
const { cleanupRemovedManagedFiles } = require('./managedfiles')

const ConfigManager = require('./configmanager')

// Old WesterosCraft url.
// exports.REMOTE_DISTRO_URL = 'https://zelthoriaismp.cloud/nebula/distribution.json'
exports.REMOTE_DISTRO_URL = 'https://pub-16d8232ded904a1bbed89826fb24c57e.r2.dev/distribution.json'

const logger = LoggerUtil.getLogger('PokeAuroraDistributionAPI')

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

    async getDistribution(){
        const distribution = await super.getDistribution()
        if(distribution == null){
            return null
        }

        try {
            const result = await cleanupRemovedManagedFiles({
                launcherDirectory: ConfigManager.getLauncherDirectory(),
                distribution,
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
            // Cleanup must never prevent the launcher from starting or repairing
            // the current distribution. The manifest is only updated by the
            // cleanup helper after its safety checks complete.
            logger.warn('Unable to clean stale PokeAurora-managed files.', error)
        }

        return distribution
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
