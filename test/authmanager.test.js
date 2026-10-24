const test = require('node:test')
const assert = require('node:assert/strict')
const path = require('node:path')

// Load the real Spanish strings from the repository instead of the packaged resources folder.
process.env.ELECTRON_IS_DEV = '1'

// configmanager.js talks to Electron through ipcRenderer, so a stand-in takes its place.
const accounts = {}
let selected = null
const fakeConfig = {
    getSelectedAccount: () => accounts[selected],
    updateMicrosoftAuthAccount(uuid, accessToken, msAccessToken, msRefreshToken, msExpires, mcExpires){
        Object.assign(accounts[uuid], { accessToken, expiresAt: mcExpires })
        Object.assign(accounts[uuid].microsoft, { access_token: msAccessToken, refresh_token: msRefreshToken, expires_at: msExpires })
        return accounts[uuid]
    },
    addAuthAccount(uuid, accessToken, username, displayName){
        accounts[uuid] = { type: 'offline', uuid, accessToken, username, displayName }
        return accounts[uuid]
    },
    getClientToken: () => 'sry',
    setClientToken(){},
    save(){}
}
const jsDir = path.join(__dirname, '..', 'app', 'assets', 'js')
require.cache[require.resolve(path.join(jsDir, 'configmanager'))] = { exports: fakeConfig }

let premiumAnswer = false
require.cache[require.resolve(path.join(jsDir, 'premiumname'))] = { exports: { isPremiumUsername: async () => premiumAnswer } }

const { MicrosoftAuth } = require('helios-core/microsoft')
const { RestResponseStatus } = require('helios-core/common')
const AuthManager = require(path.join(jsDir, 'authmanager'))
require(path.join(jsDir, 'langloader')).loadLanguage('es_ES')

const ok = data => ({ responseStatus: RestResponseStatus.SUCCESS, data })
const fail = () => ({ responseStatus: RestResponseStatus.ERROR, microsoftErrorCode: 0 })

function mockMicrosoft({ xblAccepts }){
    const used = []
    MicrosoftAuth.getAccessToken = async (code, refresh) => {
        used.push(refresh ? 'ms-refresh' : 'ms-code')
        return ok({ access_token: 'ms-new', refresh_token: 'refresh-new', expires_in: 3600 })
    }
    MicrosoftAuth.getXBLToken = async token => {
        used.push(`xbl:${token}`)
        return xblAccepts.includes(token) ? ok({ Token: 'xbl' }) : fail()
    }
    MicrosoftAuth.getXSTSToken = async () => ok({ Token: 'xsts', DisplayClaims: { xui: [{ uhs: 'uhs' }] } })
    MicrosoftAuth.getMCAccessToken = async () => ok({ access_token: 'mc-new', expires_in: 86400 })
    MicrosoftAuth.getMCProfile = async () => ok({ id: 'uuid-ms', name: 'Ash' })
    return used
}

function selectMicrosoftAccount(msExpiresAt){
    accounts['uuid-ms'] = {
        type: 'microsoft', uuid: 'uuid-ms', accessToken: 'mc-old', expiresAt: Date.now() + 3600000,
        microsoft: { access_token: 'ms-old', refresh_token: 'refresh-old', expires_at: msExpiresAt }
    }
    selected = 'uuid-ms'
}

test('renews the Minecraft token with a still-valid Microsoft token', async () => {
    selectMicrosoftAccount(Date.now() + 600000)
    const used = mockMicrosoft({ xblAccepts: ['ms-old'] })
    assert.equal(await AuthManager.refreshSelectedMicrosoftSession(), true)
    assert.deepEqual(used, ['xbl:ms-old'])
    assert.equal(accounts['uuid-ms'].accessToken, 'mc-new')
    assert.equal(accounts['uuid-ms'].microsoft.refresh_token, 'refresh-old')
})

test('falls back to the refresh token when the stored Microsoft token is rejected', async () => {
    selectMicrosoftAccount(Date.now() + 600000)
    const used = mockMicrosoft({ xblAccepts: ['ms-new'] })
    assert.equal(await AuthManager.refreshSelectedMicrosoftSession(), true)
    assert.deepEqual(used, ['xbl:ms-old', 'ms-refresh', 'xbl:ms-new'])
    assert.equal(accounts['uuid-ms'].accessToken, 'mc-new')
    assert.equal(accounts['uuid-ms'].microsoft.refresh_token, 'refresh-new')
})

test('uses the refresh token directly when the Microsoft token already expired', async () => {
    selectMicrosoftAccount(Date.now() - 1000)
    const used = mockMicrosoft({ xblAccepts: ['ms-new'] })
    assert.equal(await AuthManager.refreshSelectedMicrosoftSession(), true)
    assert.deepEqual(used, ['ms-refresh', 'xbl:ms-new'])
})

test('reports failure when the session cannot be renewed', async () => {
    selectMicrosoftAccount(Date.now() + 600000)
    mockMicrosoft({ xblAccepts: [] })
    assert.equal(await AuthManager.refreshSelectedMicrosoftSession(), false)
    assert.equal(accounts['uuid-ms'].accessToken, 'mc-old')
})

test('refuses a No-Premium account whose name is premium', async () => {
    premiumAnswer = true
    await assert.rejects(AuthManager.addAccount('Notch'), err => {
        assert.equal(err.title, 'Ese nombre pertenece a una cuenta premium')
        assert.match(err.desc, /«Notch»/)
        return true
    })
    assert.equal(Object.values(accounts).some(acc => acc.username === 'Notch'), false)
})

test('creates the No-Premium account when the name is free or cannot be checked', async () => {
    premiumAnswer = false
    assert.equal((await AuthManager.addAccount('NadieLoUsa_91')).username, 'NadieLoUsa_91')
    premiumAnswer = null
    assert.equal((await AuthManager.addAccount('SinRed_42')).username, 'SinRed_42')
})
