const { LoggerUtil } = require('helios-core')
const logger = LoggerUtil.getLogger('DiscordWrapper')

const { Client } = require('discord-rpc-patch')
const Branding = require('./branding')

let client
let activity
let rpcReady = false

function createActivity(){
    return {
        details: 'Explorando el launcher',
        state: 'Listo para jugar',
        largeImageKey: 'logo_aurora',
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

function applyActivity(){
    if(!client || !rpcReady || !activity) return

    try {
        client.setActivity(activity)
    } catch(error) {
        logger.warn('Unable to update Discord Rich Presence.', error)
    }
}

exports.initRPC = function() {
    if (client) return

    client = new Client({ transport: 'ipc' })
    activity = createActivity()
    rpcReady = false

    client.once('ready', () => {
        rpcReady = true
        logger.info('Discord RPC Connected ✔️')
        applyActivity()
    })

    client.login({ clientId: Branding.discordClientId }).catch(error => {
        logger.warn('Unable to connect Discord Rich Presence.', error)
        rpcReady = false
    })
}

exports.updateDetails = function(details){
    if (!activity) return

    activity.details = details

    if(details === 'Explorando el Launcher' || details === 'Explorando el launcher'){
        activity.state = 'Listo para jugar'
    } else if(details === 'Iniciando Minecraft...' || details === 'Jugando al servidor PokeAurora'){
        activity.state = 'Minecraft 1.21.1'
    }

    applyActivity()
}

exports.updateState = function(state){
    if (!activity) return

    // Older launcher code still sends this value while preparing the game.
    // Keep the new launcher state instead of allowing the old text to stick.
    if(state === 'Esperando para jugar'){
        activity.state = 'Listo para jugar'
    } else {
        activity.state = state
    }

    applyActivity()
}

exports.resetToLauncher = function(){
    if (!activity) return

    activity.details = 'Explorando el launcher'
    activity.state = 'Listo para jugar'
    activity.startTimestamp = Date.now()
    applyActivity()
}

exports.shutdownRPC = function(){
    if(!activity) return

    // The launcher owns the RPC connection, not the Minecraft process.
    // Returning to the launcher should restore its presence instead of closing Discord RPC.
    exports.resetToLauncher()
}
