const https = require('https')

// Same endpoint EasyAuth queries on the server to decide whether a username is premium.
const PROFILE_LOOKUP_URL = 'https://api.minecraftservices.com/minecraft/profile/lookup/name/'
const LOOKUP_TIMEOUT_MS = 5000

/**
 * Check whether a username belongs to a premium Minecraft account.
 *
 * @param {string} username The username to look up.
 * @param {Function} get Request function with the https.get signature (replaceable in tests).
 * @returns {Promise<boolean|null>} True if premium, false if not, null if the lookup failed.
 */
function isPremiumUsername(username, get = https.get){
    return new Promise(resolve => {
        let request
        try {
            request = get(`${PROFILE_LOOKUP_URL}${encodeURIComponent(username)}`, {
                headers: { Accept: 'application/json' },
                timeout: LOOKUP_TIMEOUT_MS
            }, response => {
                response.resume()
                if(response.statusCode === 200){
                    resolve(true)
                } else if(response.statusCode === 404 || response.statusCode === 204){
                    resolve(false)
                } else {
                    resolve(null)
                }
            })
        } catch(_error) {
            resolve(null)
            return
        }
        request.on('timeout', () => request.destroy(new Error('Profile lookup timed out.')))
        request.on('error', () => resolve(null))
    })
}

module.exports = { isPremiumUsername, PROFILE_LOOKUP_URL }
