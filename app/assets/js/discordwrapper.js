// Work in progress
const { LoggerUtil } = require('helios-core')

const logger = LoggerUtil.getLogger('DiscordWrapper')

const { Client } = require('discord-rpc-patch')

const Lang = require('./langloader')

let client
let activity

exports.initRPC = function(genSettings, servSettings, initialDetails = Lang.queryJS('discord.waiting')){
    client = new Client({ transport: 'ipc' })
    logger.info('Intentando conectar con Discord...');

    // Definimos la estructura base de la actividad
    activity = {
        details: "Jugando a PokeAurora",
        state: "PokeAurora Launcher",
        largeImageKey: "logo_aurora",
        largeImageText: "PokeAurora",
        startTimestamp: new Date().getTime(),
        instance: false,
        buttons: [
            {
                label: "Unirse al servidor",
                url: "https://discord.gg/hg58gR59" 
            }
        ]
    }

    client.on('ready', () => {
        logger.info('Discord RPC Connected')
        client.setActivity(activity)
    })
    
    client.login({clientId: '1511180208693055488'}).catch(error => {
        if(error.message.includes('ENOENT')) {
            logger.info('Unable to initialize Discord Rich Presence, no client detected.')
        } else {
            logger.info('Unable to initialize Discord Rich Presence: ' + error.message, error)
        }
    })
}

exports.updateDetails = function(details){
    if (!client) return
    
    // Al actualizar, aseguramos que la estructura de la actividad se mantenga
    activity.details = details
    // Forzamos los botones en cada actualización para asegurar que aparezcan
    activity.buttons = [
        {
            label: "Unirse al servidor",
            url: "https://discord.gg/hg58gR59" 
        }
    ]
    
    client.setActivity(activity)
}

exports.shutdownRPC = function(){
    if(!client) return
    client.clearActivity()
    client.destroy()
    client = null
    activity = null
}