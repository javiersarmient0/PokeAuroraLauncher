const { LoggerUtil } = require('helios-core')
const logger = LoggerUtil.getLogger('DiscordWrapper')

const { Client } = require('discord-rpc-patch')
const Branding = require('./branding')

const RPC_RECONNECT_DELAY = 5000
const RPC_HEARTBEAT_INTERVAL = 10000

let client = null
let activity = null
let rpcReady = false
let reconnectTimer = null
let heartbeatTimer = null
let destroyed = false

function createLauncherActivity(){
    return {
        details: 'Explorando el launcher',
        state: 'Listo para jugar',
        largeImageKey: 'logo_aurora',
        largeImageText: 'PokeAurora',
        startTimestamp: Date.now(),
        instance: false,
        buttons: [
            {
                label: 'Únete para jugar',
                url: 'https://pokeaurora.com'
            }
        ]
    }
}

function ensureActivity(){
    if(activity == null){
        activity = createLauncherActivity()
    }
    return activity
}

function scheduleReconnect(){
    if(destroyed || reconnectTimer != null) return

    reconnectTimer = setTimeout(() => {
        reconnectTimer = null
        connect()
    }, RPC_RECONNECT_DELAY)
}

function handleDisconnect(error){
    if(error){
        logger.warn('Discord Rich Presence disconnected.', error)
    } else {
        logger.warn('Discord Rich Presence disconnected.')
    }

    rpcReady = false
    scheduleReconnect()
}

async function publishActivity(){
    if(destroyed || client == null || !rpcReady || activity == null) return false

    try {
        await client.setActivity({ ...activity })
        return true
    } catch(error) {
        handleDisconnect(error)
        return false
    }
}

function startHeartbeat(){
    if(heartbeatTimer != null) return

    heartbeatTimer = setInterval(() => {
        publishActivity()
    }, RPC_HEARTBEAT_INTERVAL)
}

function stopHeartbeat(){
    if(heartbeatTimer == null) return

    clearInterval(heartbeatTimer)
    heartbeatTimer = null
}

function connect(){
    if(destroyed || client != null) return

    client = new Client({ transport: 'ipc' })
    rpcReady = false

    client.once('ready', () => {
        rpcReady = true
        ensureActivity()
        logger.info('Discord RPC Connected ✔️')
        startHeartbeat()
        publishActivity()
    })

    client.on('disconnected', () => {
        handleDisconnect()
        stopHeartbeat()
        client = null
    })

    client.login({ clientId: Branding.discordClientId }).catch(error => {
        handleDisconnect(error)
        stopHeartbeat()
        client = null
    })
}

function setActivityDetails(details){
    ensureActivity().details = details

    if(details === 'Explorando el Launcher' || details === 'Explorando el launcher'){
        activity.state = 'Listo para jugar'
    } else if(details === 'Preparando Minecraft...' || details === 'Iniciando Minecraft...' || details === 'Jugando al servidor PokeAurora'){
        activity.state = 'Minecraft 1.21.1'
    }

    publishActivity()
}

function setActivityState(state){
    ensureActivity().state = state === 'Esperando para jugar'
        ? 'Listo para jugar'
        : state

    publishActivity()
}

function resetToLauncher(){
    const current = ensureActivity()
    current.details = 'Explorando el launcher'
    current.state = 'Listo para jugar'
    current.startTimestamp = Date.now()
    current.buttons = [
        {
            label: 'Únete para jugar',
            url: 'https://pokeaurora.com'
        }
    ]
    publishActivity()
}

exports.initRPC = function(){
    if(destroyed) return

    ensureActivity()
    connect()
}

exports.updateDetails = function(details){
    setActivityDetails(details)
}

exports.updateState = function(state){
    setActivityState(state)
}

exports.resetToLauncher = function(){
    resetToLauncher()
}

exports.shutdownRPC = function(){
    // This is intentionally NOT a Discord RPC shutdown.
    // Minecraft closing must return the launcher to its normal presence.
    resetToLauncher()
}

exports.destroyRPC = function(){
    destroyed = true
    stopHeartbeat()

    if(reconnectTimer != null){
        clearTimeout(reconnectTimer)
        reconnectTimer = null
    }

    if(client != null){
        try {
            client.destroy()
        } catch(error) {
            logger.warn('Unable to destroy Discord Rich Presence client.', error)
        }
    }

    client = null
    rpcReady = false
}
