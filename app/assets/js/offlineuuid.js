const crypto = require('crypto')

function createOfflineUUID(username){
    const normalized = String(username).trim()
    if(!/^[a-zA-Z0-9_]{3,16}$/.test(normalized)){
        throw new Error('Invalid offline username.')
    }
    const hash = crypto.createHash('md5').update(`OfflinePlayer:${normalized}`).digest()
    hash[6] = (hash[6] & 0x0f) | 0x30
    hash[8] = (hash[8] & 0x3f) | 0x80
    return hash.toString('hex')
}

module.exports = { createOfflineUUID }
