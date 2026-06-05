/**
 * AuthManager
 * * Este módulo maneja los inicios de sesión (Premium y No Premium integrados).
 */

const ConfigManager          = require('./configmanager')
const { LoggerUtil }         = require('helios-core')
const { RestResponseStatus } = require('helios-core/common')
const { MojangRestAPI, MojangErrorCode } = require('helios-core/mojang')
const { MicrosoftAuth, MicrosoftErrorCode } = require('helios-core/microsoft')
const { AZURE_CLIENT_ID }    = require('./ipcconstants')
const Lang = require('./langloader')
let microsoftAuthInProgress = false;

// Agregados para el sistema No Premium
const crypto = require('crypto');

const log = LoggerUtil.getLogger('AuthManager')

// --- Mensajes de Error de Helios ---

function microsoftErrorDisplayable(errorCode) {
    switch (errorCode) {
        case MicrosoftErrorCode.NO_PROFILE:
            return { title: Lang.queryJS('auth.microsoft.error.noProfileTitle'), desc: Lang.queryJS('auth.microsoft.error.noProfileDesc') }
        case MicrosoftErrorCode.NO_XBOX_ACCOUNT:
            return { title: Lang.queryJS('auth.microsoft.error.noXboxAccountTitle'), desc: Lang.queryJS('auth.microsoft.error.noXboxAccountDesc') }
        case MicrosoftErrorCode.XBL_BANNED:
            return { title: Lang.queryJS('auth.microsoft.error.xblBannedTitle'), desc: Lang.queryJS('auth.microsoft.error.xblBannedDesc') }
        case MicrosoftErrorCode.UNDER_18:
            return { title: Lang.queryJS('auth.microsoft.error.under18Title'), desc: Lang.queryJS('auth.microsoft.error.under18Desc') }
        case MicrosoftErrorCode.UNKNOWN:
            return { title: Lang.queryJS('auth.microsoft.error.unknownTitle'), desc: Lang.queryJS('auth.microsoft.error.unknownDesc') }
    }
}

function mojangErrorDisplayable(errorCode) {
    switch(errorCode) {
        case MojangErrorCode.ERROR_METHOD_NOT_ALLOWED: return { title: Lang.queryJS('auth.mojang.error.methodNotAllowedTitle'), desc: Lang.queryJS('auth.mojang.error.methodNotAllowedDesc') }
        case MojangErrorCode.ERROR_NOT_FOUND: return { title: Lang.queryJS('auth.mojang.error.notFoundTitle'), desc: Lang.queryJS('auth.mojang.error.notFoundDesc') }
        case MojangErrorCode.ERROR_USER_MIGRATED: return { title: Lang.queryJS('auth.mojang.error.accountMigratedTitle'), desc: Lang.queryJS('auth.mojang.error.accountMigratedDesc') }
        case MojangErrorCode.ERROR_INVALID_CREDENTIALS: return { title: Lang.queryJS('auth.mojang.error.invalidCredentialsTitle'), desc: Lang.queryJS('auth.mojang.error.invalidCredentialsDesc') }
        case MojangErrorCode.ERROR_RATELIMIT: return { title: Lang.queryJS('auth.mojang.error.tooManyAttemptsTitle'), desc: Lang.queryJS('auth.mojang.error.tooManyAttemptsDesc') }
        case MojangErrorCode.ERROR_INVALID_TOKEN: return { title: Lang.queryJS('auth.mojang.error.invalidTokenTitle'), desc: Lang.queryJS('auth.mojang.error.invalidTokenDesc') }
        case MojangErrorCode.ERROR_ACCESS_TOKEN_HAS_PROFILE: return { title: Lang.queryJS('auth.mojang.error.tokenHasProfileTitle'), desc: Lang.queryJS('auth.mojang.error.tokenHasProfileDesc') }
        case MojangErrorCode.ERROR_CREDENTIALS_MISSING: return { title: Lang.queryJS('auth.mojang.error.credentialsMissingTitle'), desc: Lang.queryJS('auth.mojang.error.credentialsMissingDesc') }
        case MojangErrorCode.ERROR_INVALID_SALT_VERSION: return { title: Lang.queryJS('auth.mojang.error.invalidSaltVersionTitle'), desc: Lang.queryJS('auth.mojang.error.invalidSaltVersionDesc') }
        case MojangErrorCode.ERROR_UNSUPPORTED_MEDIA_TYPE: return { title: Lang.queryJS('auth.mojang.error.unsupportedMediaTypeTitle'), desc: Lang.queryJS('auth.mojang.error.unsupportedMediaTypeDesc') }
        case MojangErrorCode.ERROR_GONE: return { title: Lang.queryJS('auth.mojang.error.accountGoneTitle'), desc: Lang.queryJS('auth.mojang.error.accountGoneDesc') }
        case MojangErrorCode.ERROR_UNREACHABLE: return { title: Lang.queryJS('auth.mojang.error.unreachableTitle'), desc: Lang.queryJS('auth.mojang.error.unreachableDesc') }
        case MojangErrorCode.ERROR_NOT_PAID: return { title: Lang.queryJS('auth.mojang.error.gameNotPurchasedTitle'), desc: Lang.queryJS('auth.mojang.error.gameNotPurchasedDesc') }
        case MojangErrorCode.UNKNOWN: return { title: Lang.queryJS('auth.mojang.error.unknownErrorTitle'), desc: Lang.queryJS('auth.mojang.error.unknownErrorDesc') }
        default: throw new Error(`Unknown error code: ${errorCode}`)
    }
}

// --- Funciones de Login ---

/**
 * LOGIN NO PREMIUM (Tu código original injertado aquí)
 */
exports.addAccount = async function(username) {
    try {
        let userId = null;
        const hash = crypto.createHash('md5');
        hash.update(username);
        userId = hash.digest('hex');
        
        const ret = ConfigManager.addMojangAuthAccount(userId, 'sry', username, username);
        if (ConfigManager.getClientToken() == null) {
            ConfigManager.setClientToken('sry');
        }
        ConfigManager.save();
        return ret;

    } catch (err) {
        return Promise.reject(err);
    }
};

/**
 * LOGIN MOJANG (Premium viejos)
 */
exports.addMojangAccount = async function(username, password) {
    try {
        const response = await MojangRestAPI.authenticate(username, password, ConfigManager.getClientToken())
        if(response.responseStatus === RestResponseStatus.SUCCESS) {
            const session = response.data
            if(session.selectedProfile != null){
                const ret = ConfigManager.addMojangAuthAccount(session.selectedProfile.id, session.accessToken, username, session.selectedProfile.name)
                if(ConfigManager.getClientToken() == null){
                    ConfigManager.setClientToken(session.clientToken)
                }
                ConfigManager.save()
                return ret
            } else {
                return Promise.reject(mojangErrorDisplayable(MojangErrorCode.ERROR_NOT_PAID))
            }
        } else {
            return Promise.reject(mojangErrorDisplayable(response.mojangErrorCode))
        }
    } catch (err){
        log.error(err)
        return Promise.reject(mojangErrorDisplayable(MojangErrorCode.UNKNOWN))
    }
}

const AUTH_MODE = { FULL: 0, MS_REFRESH: 1, MC_REFRESH: 2 }

/**
 * LOGIN MICROSOFT (El oficial que sí funciona hoy en día)
 */
async function fullMicrosoftAuthFlow(entryCode, authMode) {
    try {
        let accessTokenRaw
        let accessToken
        if(authMode !== AUTH_MODE.MC_REFRESH) {
            
            // --- PEGALO ACÁ, REEMPLAZANDO LA LÍNEA ANTIGUA ---
            const accessTokenResponse = await MicrosoftAuth.getAccessToken(
                entryCode, 
                authMode === AUTH_MODE.MS_REFRESH, 
                AZURE_CLIENT_ID, 
                ['XboxLive.signin', 'offline_access']
            );
            // --------------------------------------------------

            if(accessTokenResponse.responseStatus === RestResponseStatus.ERROR) {
                return Promise.reject(microsoftErrorDisplayable(accessTokenResponse.microsoftErrorCode))
            }
            accessToken = accessTokenResponse.data
            accessTokenRaw = accessToken.access_token
        } else {
            accessTokenRaw = entryCode
        }
        
        const xblResponse = await MicrosoftAuth.getXBLToken(accessTokenRaw)
        if(xblResponse.responseStatus === RestResponseStatus.ERROR) {
            return Promise.reject(microsoftErrorDisplayable(xblResponse.microsoftErrorCode))
        }
        const xstsResonse = await MicrosoftAuth.getXSTSToken(xblResponse.data)
        if(xstsResonse.responseStatus === RestResponseStatus.ERROR) {
            return Promise.reject(microsoftErrorDisplayable(xstsResonse.microsoftErrorCode))
        }
        const mcTokenResponse = await MicrosoftAuth.getMCAccessToken(xstsResonse.data)
        if(mcTokenResponse.responseStatus === RestResponseStatus.ERROR) {
            return Promise.reject(microsoftErrorDisplayable(mcTokenResponse.microsoftErrorCode))
        }
        const mcProfileResponse = await MicrosoftAuth.getMCProfile(mcTokenResponse.data.access_token)
        if(mcProfileResponse.responseStatus === RestResponseStatus.ERROR) {
            return Promise.reject(microsoftErrorDisplayable(mcProfileResponse.microsoftErrorCode))
        }
        return {
            accessToken,
            accessTokenRaw,
            xbl: xblResponse.data,
            xsts: xstsResonse.data,
            mcToken: mcTokenResponse.data,
            mcProfile: mcProfileResponse.data
        }
   } catch(err) {
        // 🔥 PARCHE DE DETECCIÓN CRUCIAL
        console.error("====== ERROR CRÍTICO EN FLOW DE MICROSOFT ======");
        console.error(err);
        console.error("================================================");
        
        log.error(err)
        return Promise.reject(microsoftErrorDisplayable(MicrosoftErrorCode.UNKNOWN))
    }
}

function calculateExpiryDate(nowMs, epiresInS) {
    return nowMs + ((epiresInS-10)*1000)
}


exports.addMicrosoftAccount = async function(authCode) {

    if (microsoftAuthInProgress) {
        return Promise.reject("Microsoft auth already in progress");
    }

    microsoftAuthInProgress = true;

    try {
        const fullAuth = await fullMicrosoftAuthFlow(authCode, AUTH_MODE.FULL);

        const now = new Date().getTime();

        const ret = ConfigManager.addMicrosoftAuthAccount(
            fullAuth.mcProfile.id,
            fullAuth.mcToken.access_token,
            fullAuth.mcProfile.name,
            calculateExpiryDate(now, fullAuth.mcToken.expires_in),
            fullAuth.accessToken.access_token,
            fullAuth.accessToken.refresh_token,
            calculateExpiryDate(now, fullAuth.accessToken.expires_in)
        );

        ConfigManager.save();
        return ret;

    } finally {
        microsoftAuthInProgress = false;
    }
};
exports.removeMojangAccount = async function(uuid){
    try {
        const authAcc = ConfigManager.getAuthAccount(uuid)
        
        if (authAcc.accessToken === 'sry') {
            ConfigManager.removeAuthAccount(uuid)
            ConfigManager.save()
            return Promise.resolve()
        }

        const response = await MojangRestAPI.invalidate(authAcc.accessToken, ConfigManager.getClientToken())
        if(response.responseStatus === RestResponseStatus.SUCCESS) {
            ConfigManager.removeAuthAccount(uuid)
            ConfigManager.save()
            return Promise.resolve()
        } else {
            log.error('Error while removing account', response.error)
            return Promise.reject(response.error)
        }
    } catch (err){
        log.error('Error while removing account', err)
        return Promise.reject(err)
    }
}

exports.removeMicrosoftAccount = async function(uuid){
    try {
        ConfigManager.removeAuthAccount(uuid)
        ConfigManager.save()
        return Promise.resolve()
    } catch (err){
        log.error('Error while removing account', err)
        return Promise.reject(err)
    }
}

async function validateSelectedMojangAccount(){
    const current = ConfigManager.getSelectedAccount()
    const response = await MojangRestAPI.validate(current.accessToken, ConfigManager.getClientToken())

    if(response.responseStatus === RestResponseStatus.SUCCESS) {
        const isValid = response.data
        if(!isValid){
            const refreshResponse = await MojangRestAPI.refresh(current.accessToken, ConfigManager.getClientToken())
            if(refreshResponse.responseStatus === RestResponseStatus.SUCCESS) {
                const session = refreshResponse.data
                ConfigManager.updateMojangAuthAccount(current.uuid, session.accessToken)
                ConfigManager.save()
            } else {
                return false
            }
            return true
        } else {
            return true
        }
    }
}

async function validateSelectedMicrosoftAccount() {
    const current = ConfigManager.getSelectedAccount();
    
    if (!current) {
        return false;
    }
    
    if (!current.microsoft) {
        return false;
    }

    const now = new Date().getTime()
    const mcExpiresAt = current.expiresAt
    const mcExpired = now >= mcExpiresAt

    if(!mcExpired) { return true }

    const msExpiresAt = current.microsoft.expires_at
    const msExpired = now >= msExpiresAt

    if(msExpired) {
        try {
            const res = await fullMicrosoftAuthFlow(current.microsoft.refresh_token, AUTH_MODE.MS_REFRESH)
            ConfigManager.updateMicrosoftAuthAccount(
                current.uuid, res.mcToken.access_token, res.accessToken.access_token, res.accessToken.refresh_token,
                calculateExpiryDate(now, res.accessToken.expires_in), calculateExpiryDate(now, res.mcToken.expires_in)
            )
            ConfigManager.save()
            return true
        } catch(_err) { return false }
    } else {
        try {
            const res = await fullMicrosoftAuthFlow(current.microsoft.access_token, AUTH_MODE.MC_REFRESH)
            ConfigManager.updateMicrosoftAuthAccount(
                current.uuid, res.mcToken.access_token, current.microsoft.access_token, current.microsoft.refresh_token,
                current.microsoft.expires_at, calculateExpiryDate(now, res.mcToken.expires_in)
            )
            ConfigManager.save()
            return true
        } catch(_err) { return false }
    }
}

exports.validateSelected = async function(){
    const current = ConfigManager.getSelectedAccount()

    // ESCUDO: Si no hay cuenta, salimos inmediatamente sin lanzar error
    if (!current) {
        console.log("No hay cuenta seleccionada, esperando...");
        return false; 
    }

    // SI HAY CUENTA: Validamos según el tipo
    if(current.type === 'microsoft') {
        // Le damos 1 segundo extra de gracia por si el disco está lento
        await new Promise(resolve => setTimeout(resolve, 1000));
        return await validateSelectedMicrosoftAccount()
    } else {
        return await validateSelectedMojangAccount()
    }
}