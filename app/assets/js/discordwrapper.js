const { LoggerUtil } = require('helios-core')
const logger = LoggerUtil.getLogger('DiscordWrapper')

const { Client } = require('discord-rpc-patch')
const Branding = require('./branding')

let client
let activity

exports.initRPC = function() {
    if (client) return

    client = new Client({ transport: 'ipc' })

    activity = {
        details: "Iniciando launcher...",
        state: "PokeAurora",
        largeImageKey: "logo_aurora",
        startTimestamp: Date.now(),
        instance: false,
        buttons: [
            {
                label: "Unirse al servidor",
                url: Branding.discordInvite
            }
        ]
    }

    client.once('ready', () => {
        logger.info('Discord RPC Connected ✔️')
        client.setActivity(activity)
    })

    client.login({ clientId: Branding.discordClientId })
}

exports.updateDetails = function(details){
    if (!client) return

    activity.details = details

    activity.buttons = [
        {
            label: "Unirse al servidor",
            url: Branding.discordInvite
        }
    ]

    client.setActivity(activity)
}

exports.updateState = function(state){
    if (!client) return

    activity.state = state

    client.setActivity(activity)
}

exports.shutdownRPC = function(){
    if(!client) return
    client.clearActivity()
    client.destroy()
    client = null
    activity = null
}
