/**
 * Script for overlay.ejs
 */

/* Overlay Wrapper Functions */

/**
 * Check to see if the overlay is visible.
 * 
 * @returns {boolean} Whether or not the overlay is visible.
 */
function isOverlayVisible(){
    return document.getElementById('main').hasAttribute('overlay')
}

let overlayHandlerContent

/**
 * Overlay keydown handler for a non-dismissable overlay.
 * 
 * @param {KeyboardEvent} e The keydown event.
 */
function overlayKeyHandler (e){
    if(e.key === 'Enter' || e.key === 'Escape'){
        document.getElementById(overlayHandlerContent).getElementsByClassName('overlayKeybindEnter')[0].click()
    }
}
/**
 * Overlay keydown handler for a dismissable overlay.
 * 
 * @param {KeyboardEvent} e The keydown event.
 */
function overlayKeyDismissableHandler (e){
    if(e.key === 'Enter'){
        document.getElementById(overlayHandlerContent).getElementsByClassName('overlayKeybindEnter')[0].click()
    } else if(e.key === 'Escape'){
        document.getElementById(overlayHandlerContent).getElementsByClassName('overlayKeybindEsc')[0].click()
    }
}

/**
 * Bind overlay keydown listeners for escape and exit.
 * 
 * @param {boolean} state Whether or not to add new event listeners.
 * @param {string} content The overlay content which will be shown.
 * @param {boolean} dismissable Whether or not the overlay is dismissable 
 */
function bindOverlayKeys(state, content, dismissable){
    overlayHandlerContent = content
    document.removeEventListener('keydown', overlayKeyHandler)
    document.removeEventListener('keydown', overlayKeyDismissableHandler)
    if(state){
        if(dismissable){
            document.addEventListener('keydown', overlayKeyDismissableHandler)
        } else {
            document.addEventListener('keydown', overlayKeyHandler)
        }
    }
}

/**
 * Toggle the visibility of the overlay.
 * 
 * @param {boolean} toggleState True to display, false to hide.
 * @param {boolean} dismissable Optional. True to show the dismiss option, otherwise false.
 * @param {string} content Optional. The content div to be shown.
 */
function toggleOverlay(toggleState, dismissable = false, content = 'overlayContent'){
    if(toggleState == null){
        toggleState = !document.getElementById('main').hasAttribute('overlay')
    }
    if(typeof dismissable === 'string'){
        content = dismissable
        dismissable = false
    }
    bindOverlayKeys(toggleState, content, dismissable)
    if(toggleState){
        document.getElementById('main').setAttribute('overlay', true)
        // Make things untabbable.
        $('#main *').attr('tabindex', '-1')
        $('#' + content).parent().children().hide()
        $('#' + content).show()
        if(dismissable){
            $('#overlayDismiss').show()
        } else {
            $('#overlayDismiss').hide()
        }
        $('#overlayContainer').fadeIn({
            duration: 250,
            start: () => {
                if(getCurrentView() === VIEWS.settings){
                    document.getElementById('settingsContainer').style.backgroundColor = 'transparent'
                }
            }
        })
    } else {
        document.getElementById('main').removeAttribute('overlay')
        // Make things tabbable.
        $('#main *').removeAttr('tabindex')
        $('#overlayContainer').fadeOut({
            duration: 250,
            start: () => {
                if(getCurrentView() === VIEWS.settings){
                    document.getElementById('settingsContainer').style.backgroundColor = 'rgba(0, 0, 0, 0.50)'
                }
            },
            complete: () => {
                $('#' + content).parent().children().hide()
                $('#' + content).show()
                if(dismissable){
                    $('#overlayDismiss').show()
                } else {
                    $('#overlayDismiss').hide()
                }
            }
        })
    }
}

async function toggleServerSelection(toggleState){
    await prepareServerSelectionList()
    toggleOverlay(toggleState, true, 'serverSelectContent')
}

/**
 * Set the content of the overlay.
 * 
 * @param {string} title Overlay title text.
 * @param {string} description Overlay description text.
 * @param {string} acknowledge Acknowledge button text.
 * @param {string} dismiss Dismiss button text.
 */
function setOverlayContent(title, description, acknowledge, dismiss = Lang.queryJS('overlay.dismiss')){
    const plainText = value => {
        const element = document.createElement('div')
        element.innerHTML = sanitizeRemoteHTML(String(value || '').replace(/<br\s*\/?>/gi, '\n'))
        return element.textContent
    }
    document.getElementById('overlayTitle').textContent = plainText(title)
    document.getElementById('overlayDesc').textContent = plainText(description)
    document.getElementById('overlayAcknowledge').textContent = plainText(acknowledge)
    document.getElementById('overlayDismiss').textContent = plainText(dismiss)
}

/**
 * Set the onclick handler of the overlay acknowledge button.
 * If the handler is null, a default handler will be added.
 * 
 * @param {function} handler 
 */
function setOverlayHandler(handler){
    if(handler == null){
        document.getElementById('overlayAcknowledge').onclick = () => {
            toggleOverlay(false)
        }
    } else {
        document.getElementById('overlayAcknowledge').onclick = handler
    }
}

/**
 * Set the onclick handler of the overlay dismiss button.
 * If the handler is null, a default handler will be added.
 * 
 * @param {function} handler 
 */
function setDismissHandler(handler){
    if(handler == null){
        document.getElementById('overlayDismiss').onclick = () => {
            toggleOverlay(false)
        }
    } else {
        document.getElementById('overlayDismiss').onclick = handler
    }
}

/* Server Select View */

document.getElementById('serverSelectConfirm').addEventListener('click', async () => {
    const listings = document.getElementsByClassName('serverListing')
    for(let i=0; i<listings.length; i++){
        if(listings[i].hasAttribute('selected')){
            const serv = (await DistroAPI.getDistribution()).getServerById(listings[i].getAttribute('servid'))
            updateSelectedServer(serv)
            refreshServerStatus(true)
            toggleOverlay(false)
            return
        }
    }
    // None are selected? Not possible right? Meh, handle it.
    if(listings.length > 0){
        const serv = (await DistroAPI.getDistribution()).getServerById(listings[i].getAttribute('servid'))
        updateSelectedServer(serv)
        toggleOverlay(false)
    }
})

document.getElementById('accountSelectConfirm').addEventListener('click', async () => {
    const listings = document.getElementsByClassName('accountListing')
    for(let i=0; i<listings.length; i++){
        if(listings[i].hasAttribute('selected')){
            const authAcc = ConfigManager.setSelectedAccount(listings[i].getAttribute('uuid'))
            ConfigManager.save()
            updateSelectedAccount(authAcc)
            if(getCurrentView() === VIEWS.settings) {
                await prepareSettings()
            }
            toggleOverlay(false)
            validateSelectedAccount()
            return
        }
    }
    // None are selected? Not possible right? Meh, handle it.
    if(listings.length > 0){
        const authAcc = ConfigManager.setSelectedAccount(listings[0].getAttribute('uuid'))
        ConfigManager.save()
        updateSelectedAccount(authAcc)
        if(getCurrentView() === VIEWS.settings) {
            await prepareSettings()
        }
        toggleOverlay(false)
        validateSelectedAccount()
    }
})

// Bind server select cancel button.
document.getElementById('serverSelectCancel').addEventListener('click', () => {
    toggleOverlay(false)
})

document.getElementById('accountSelectCancel').addEventListener('click', () => {
    $('#accountSelectContent').fadeOut(250, () => {
        $('#overlayContent').fadeIn(250)
    })
})

function setServerListingHandlers(){
    const listings = Array.from(document.getElementsByClassName('serverListing'))
    listings.map((val) => {
        val.onclick = e => {
            if(val.hasAttribute('selected')){
                return
            }
            const cListings = document.getElementsByClassName('serverListing')
            for(let i=0; i<cListings.length; i++){
                if(cListings[i].hasAttribute('selected')){
                    cListings[i].removeAttribute('selected')
                }
            }
            val.setAttribute('selected', '')
            document.activeElement.blur()
        }
    })
}

function setAccountListingHandlers(){
    const listings = Array.from(document.getElementsByClassName('accountListing'))
    listings.map((val) => {
        val.onclick = e => {
            if(val.hasAttribute('selected')){
                return
            }
            const cListings = document.getElementsByClassName('accountListing')
            for(let i=0; i<cListings.length; i++){
                if(cListings[i].hasAttribute('selected')){
                    cListings[i].removeAttribute('selected')
                }
            }
            val.setAttribute('selected', '')
            document.activeElement.blur()
        }
    })
}

async function populateServerListings(){
    const distro = await DistroAPI.getDistribution()
    const giaSel = ConfigManager.getSelectedServer()
    const servers = distro.servers
    let htmlString = ''
    for(const serv of servers){
        htmlString += `<button class="serverListing" servid="${serv.rawServer.id}" ${serv.rawServer.id === giaSel ? 'selected' : ''}>
            <img class="serverListingImg" src="${escapeHTML(serv.rawServer.icon)}"/>
            <div class="serverListingDetails">
                <span class="serverListingName">${escapeHTML(serv.rawServer.name)}</span>
                <span class="serverListingDescription">${escapeHTML(serv.rawServer.description)}</span>
                <div class="serverListingInfo">
                    <div class="serverListingVersion">${serv.rawServer.minecraftVersion}</div>
                    <div class="serverListingRevision">${serv.rawServer.version}</div>
                    ${serv.rawServer.mainServer ? `<div class="serverListingStarWrapper">
                        <svg id="Layer_1" viewBox="0 0 107.45 104.74" width="20px" height="20px">
                            <defs>
                                <style>.cls-1{fill:#fff;}.cls-2{fill:none;stroke:#fff;stroke-miterlimit:10;}</style>
                            </defs>
                            <path class="cls-1" d="M100.93,65.54C89,62,68.18,55.65,63.54,52.13c2.7-5.23,18.8-19.2,28-27.55C81.36,31.74,63.74,43.87,58.09,45.3c-2.41-5.37-3.61-26.52-4.37-39-.77,12.46-2,33.64-4.36,39-5.7-1.46-23.3-13.57-33.49-20.72,9.26,8.37,25.39,22.36,28,27.55C39.21,55.68,18.47,62,6.52,65.55c12.32-2,33.63-6.06,39.34-4.9-.16,5.87-8.41,26.16-13.11,37.69,6.1-10.89,16.52-30.16,21-33.9,4.5,3.79,14.93,23.09,21,34C70,86.84,61.73,66.48,61.59,60.65,67.36,59.49,88.64,63.52,100.93,65.54Z"/>
                            <circle class="cls-2" cx="53.73" cy="53.9" r="38"/>
                        </svg>
                        <span class="serverListingStarTooltip">${Lang.queryJS('settings.serverListing.mainServer')}</span>
                    </div>` : ''}
                </div>
            </div>
        </button>`
    }
    document.getElementById('serverSelectListScrollable').innerHTML = htmlString

}

function populateAccountListings(){
    const accountsObj = ConfigManager.getAuthAccounts()
    const accounts = Array.from(Object.keys(accountsObj), v=>accountsObj[v])
    let htmlString = ''
    for(let i=0; i<accounts.length; i++){
        htmlString += `<button class="accountListing" uuid="${accounts[i].uuid}" ${i===0 ? 'selected' : ''}>
            <img src="assets/images/SealCircle.png">
                <div class="accountListingName">${escapeHTML(accounts[i].displayName)}</div>
        </button>`
    }
    document.getElementById('accountSelectListScrollable').innerHTML = htmlString

}

async function prepareServerSelectionList(){
    await populateServerListings()
    setServerListingHandlers()
}

function prepareAccountSelectionList(){
    populateAccountListings()
    setAccountListingHandlers()
}

/* Profile Select View */

const ProfilesLib = require('./assets/js/profiles')
const GameOptionsLib = require('./assets/js/gameoptions')
const profileOsLib = require('os')
const profilePathLib = require('path')

const { PRUEBAS_ID: PROFILE_PRUEBAS_ID } = require('./assets/js/staffaccess')

const PROFILE_MOD_TYPES = new Set([Type.ForgeMod, Type.LiteMod, Type.LiteLoader, Type.FabricMod])
let profileSelected = null
// 'main' o 'pruebas': qué servidor muestra el panel. Solo cambia si la distribución trae Pruebas (staff).
let profileViewServer = 'main'
let profilePreselect = null

// Los perfiles Lite/Normal/Pro son siempre del servidor principal; Pruebas no tiene perfiles.
async function getProfileContext(){
    const distro = await DistroAPI.getDistribution()
    const server = distro.getMainServer()
    const profiles = ProfilesLib.resolveProfiles(server.rawServer)
    const modsCfg = ConfigManager.getModConfiguration(server.rawServer.id)?.mods || {}
    const requiredCount = server.modules.filter(m => PROFILE_MOD_TYPES.has(m.rawModule.type) && m.getRequired().value).length
    return { server, profiles, modsCfg, requiredCount }
}

/**
 * Nombre visible del perfil actual (detectado por el estado de los mods).
 *
 * @returns {Promise<string>}
 */
async function currentProfileLabel(){
    const ctx = await getProfileContext()
    const id = ProfilesLib.detectProfile(ctx.modsCfg, ctx.profiles)
    return id === 'custom' ? Lang.queryJS('profiles.custom') : ctx.profiles.profiles[id].name
}

function renderProfileCards(ctx, current, recommended){
    const totalMem = profileOsLib.totalmem()
    const cards = ProfilesLib.PROFILE_IDS.map(id => {
        const profile = ctx.profiles.profiles[id]
        const mods = ctx.requiredCount + ProfilesLib.countEnabledOptional(ctx.modsCfg, profile).enabled
        const ram = ProfilesLib.recommendedRamGB(profile, totalMem)
        const badges = [
            id === recommended ? `<span class="profileBadge profileBadgeRecommended">${escapeHTML(Lang.queryJS('profiles.recommended'))}</span>` : '',
            id === current ? `<span class="profileBadge">${escapeHTML(Lang.queryJS('profiles.current'))}</span>` : ''
        ].join('')
        return `<button class="profileCard" role="radio" data-profile="${id}" aria-checked="${id === profileSelected}">
            <span class="profileCardTop"><span class="profileCardName">${escapeHTML(profile.name)}</span></span>
            <span class="profileCardBadges">${badges}</span>
            <span class="profileCardDesc">${escapeHTML(Lang.queryJS(`profiles.${id}Desc`))}</span>
            <span class="profileCardMeta">${escapeHTML(Lang.queryJS('profiles.modsMeta', { mods, ram }))}</span>
        </button>`
    }).join('')
    const container = document.getElementById('profileCards')
    container.innerHTML = cards
    for(const card of container.querySelectorAll('.profileCard')){
        card.onclick = () => {
            profileSelected = card.getAttribute('data-profile')
            for(const other of container.querySelectorAll('.profileCard')){
                other.setAttribute('aria-checked', String(other === card))
            }
        }
    }
}

/**
 * Tarjeta única de Pruebas: todos los mods del servidor de pruebas (los opcionales van prendidos).
 */
function renderStaffCard(pruebas){
    const mods = pruebas.modules.filter(m => PROFILE_MOD_TYPES.has(m.rawModule.type)).length
    profileSelected = 'staff'
    document.getElementById('profileCards').innerHTML = `<button class="profileCard profileCardStaff" role="radio" data-profile="staff" aria-checked="true">
            <span class="profileCardTop"><span class="profileCardName">${escapeHTML(Lang.queryJS('profiles.staffName'))}</span></span>
            <span class="profileCardDesc">${escapeHTML(Lang.queryJS('profiles.staffDesc'))}</span>
            <span class="profileCardMeta">${escapeHTML(Lang.queryJS('profiles.staffMods', { mods }))}</span>
        </button>`
}

/**
 * Selector PokeAurora | Pruebas, visible solo si la distribución trae el servidor de pruebas.
 */
function renderProfileServerSwitch(hasPruebas){
    const container = document.getElementById('profileServerSwitch')
    if(!hasPruebas){
        container.style.display = 'none'
        container.innerHTML = ''
        return
    }
    const tabs = [['main', 'profiles.serverMain'], ['pruebas', 'profiles.serverPruebas']]
    container.setAttribute('aria-label', Lang.queryJS('profiles.chooseServer'))
    container.innerHTML = tabs.map(([id, key]) =>
        `<button class="profileServerTab" role="tab" data-server="${id}" aria-selected="${id === profileViewServer}">${escapeHTML(Lang.queryJS(key))}</button>`
    ).join('')
    container.style.display = ''
    for(const tab of container.querySelectorAll('.profileServerTab')){
        tab.onclick = () => {
            profileViewServer = tab.getAttribute('data-server')
            renderProfilePanel().catch(error => loggerLanding.warn('No se pudo cambiar de servidor en el panel.', error))
        }
    }
}

async function renderProfilePanel(){
    const distro = await DistroAPI.getDistribution()
    const pruebas = distro.getServerById(PROFILE_PRUEBAS_ID)
    if(pruebas == null) profileViewServer = 'main'
    renderProfileServerSwitch(pruebas != null)

    const inPruebas = profileViewServer === 'pruebas'
    document.getElementById('profileSelectContent').classList.toggle('isPruebasView', inPruebas)
    document.getElementById('profileSelectHeader').textContent = Lang.queryJS(inPruebas ? 'profiles.chooseServer' : 'profiles.chooseProfile')
    document.getElementById('profileSelectDesc').style.display = inPruebas ? 'none' : ''
    document.getElementById('profileGraphicsOption').style.display = inPruebas ? 'none' : ''

    if(inPruebas){
        renderStaffCard(pruebas)
        document.getElementById('profileCustomWarning').style.display = 'none'
        return
    }

    const ctx = await getProfileContext()
    const current = ProfilesLib.detectProfile(ctx.modsCfg, ctx.profiles)
    const recommended = ProfilesLib.recommendProfile(profileOsLib.totalmem())
    profileSelected = profilePreselect || (current !== 'custom' ? current : recommended)
    renderProfileCards(ctx, current, recommended)
    document.getElementById('profileCustomWarning').style.display = current === 'custom' ? '' : 'none'
}

/**
 * Abre el panel de perfiles.
 *
 * @param {string} [preselect] perfil marcado al abrir; por defecto el actual o el recomendado.
 */
async function openProfileSelection(preselect){
    profilePreselect = preselect || null
    profileViewServer = ConfigManager.getSelectedServer() === PROFILE_PRUEBAS_ID ? 'pruebas' : 'main'
    document.getElementById('profileGraphicsCheck').checked = true
    await renderProfilePanel()
    toggleOverlay(true, 'profileSelectContent')
}

/**
 * Selecciona un servidor por id (o el principal, si es null o ya no existe) y actualiza la portada.
 */
async function selectProfileServer(serverId){
    const distro = await DistroAPI.getDistribution()
    const server = (serverId != null ? distro.getServerById(serverId) : null) ?? distro.getMainServer()
    if(ConfigManager.getSelectedServer() !== server.rawServer.id){
        updateSelectedServer(server)
        refreshServerStatus()
    }
}

/**
 * Aplica un perfil: mods opcionales, RAM y, si se pide y el juego está cerrado, gráficos en options.txt.
 *
 * @param {string} profileId lite|normal|pro
 * @param {{graphics: boolean}} options
 */
async function applyProfile(profileId, { graphics }){
    const ctx = await getProfileContext()
    const profile = ctx.profiles.profiles[profileId]
    const serverId = ctx.server.rawServer.id

    const modConf = ConfigManager.getModConfiguration(serverId)
    modConf.mods = ProfilesLib.applyProfileToMods(modConf.mods, profile)
    ConfigManager.setModConfiguration(serverId, modConf)

    const ram = `${ProfilesLib.recommendedRamGB(profile, profileOsLib.totalmem())}G`
    ConfigManager.setMinRAM(serverId, ram)
    ConfigManager.setMaxRAM(serverId, ram)
    ConfigManager.setSelectedProfile(serverId, profileId)
    ConfigManager.save()

    const gameRunning = typeof proc !== 'undefined' && proc != null
    if(graphics && !gameRunning){
        const result = await GameOptionsLib.applyProfileGraphics(
            profilePathLib.join(ConfigManager.getInstanceDirectory(), serverId, 'options.txt'),
            profile.graphics
        )
        loggerLanding.info(`Perfil ${profileId}: gráficos ${result.applied ? 'aplicados' : `sin aplicar (${result.reason})`}.`)
    }

    await refreshProfileButton()
    if(getCurrentView() === VIEWS.settings){
        await prepareSettings()
    }
    if(graphics && gameRunning){
        setOverlayContent(Lang.queryJS('profiles.gameRunningTitle'), Lang.queryJS('profiles.gameRunning'), Lang.queryJS('profiles.ok'))
        setOverlayHandler(null)
        toggleOverlay(true)
    }
}

/**
 * La primera vez que se ve la portada con la 1.1.0, propone un perfil (no aplica nada si se cancela).
 */
function maybePromptProfile(){
    if(ConfigManager.getProfilePromptDone() || getCurrentView() !== VIEWS.landing || isOverlayVisible()){
        return
    }
    openProfileSelection(ProfilesLib.recommendProfile(profileOsLib.totalmem()))
        .catch(error => loggerLanding.warn('No se pudo abrir el panel de perfiles.', error))
}

document.getElementById('profileSelectConfirm').addEventListener('click', async () => {
    const graphics = document.getElementById('profileGraphicsCheck').checked
    ConfigManager.setProfilePromptDone(true)
    toggleOverlay(false)
    if(profileViewServer === 'pruebas'){
        ConfigManager.save()
        await selectProfileServer(PROFILE_PRUEBAS_ID)
        return
    }
    await selectProfileServer(null)
    await applyProfile(profileSelected, { graphics })
})

document.getElementById('profileSelectCancel').addEventListener('click', () => {
    ConfigManager.setProfilePromptDone(true)
    ConfigManager.save()
    toggleOverlay(false)
})
