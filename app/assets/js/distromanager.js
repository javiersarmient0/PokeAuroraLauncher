const { DistributionAPI } = require('helios-core/common')
const { sanitizeDistribution } = require('./distributionsanitizer')

const ConfigManager = require('./configmanager')

// Old WesterosCraft url.
// exports.REMOTE_DISTRO_URL = 'https://zelthoriaismp.cloud/nebula/distribution.json'
exports.REMOTE_DISTRO_URL = 'https://pub-16d8232ded904a1bbed89826fb24c57e.r2.dev/distribution.json'

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
