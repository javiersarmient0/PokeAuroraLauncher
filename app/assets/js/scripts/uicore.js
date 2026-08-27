/**
 * Core UI functions are initialized in this file. This prevents
 * unexpected errors from breaking the core features. Specifically,
 * actions in this file should not require the usage of any internal
 * modules, excluding dependencies.
 */
// Requirements
const $                              = require('jquery')
const {ipcRenderer, webFrame}        = require('electron')
const isDev                          = require('./assets/js/isdev')
const { LoggerUtil }                 = require('helios-core')
const Lang                           = require('./assets/js/langloader')

const loggerUICore             = LoggerUtil.getLogger('UICore')
const loggerAutoUpdater        = LoggerUtil.getLogger('AutoUpdater')

const uiSounds = {
    hover: new window.Audio('assets/audio/button-hover.wav'),
    click: new window.Audio('assets/audio/button-click.wav')
}
uiSounds.hover.volume = 0.12
uiSounds.click.volume = 0.20

function playUISound(type){
    const sound = uiSounds[type]
    if(sound == null) return
    sound.currentTime = 0
    sound.play().catch(() => {})
}

function findInteractiveElement(target){
    return target instanceof HTMLElement
        ? target.closest('button:not(:disabled), a[href], .settingsNavItem, .settingsSelectSelected, .settingsSelectOption, .accountListing, .serverListing')
        : null
}

document.addEventListener('pointerover', event => {
    const interactive = findInteractiveElement(event.target)
    if(interactive != null && !interactive.contains(event.relatedTarget)){
        playUISound('hover')
    }
})

document.addEventListener('pointerdown', event => {
    if(findInteractiveElement(event.target) != null){
        playUISound('click')
    }
})

function escapeHTML(value){
    return String(value ?? '')
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#039;')
}

function sanitizeRemoteHTML(value){
    const template = document.createElement('template')
    template.innerHTML = String(value || '')
    const blocked = template.content.querySelectorAll('script, style, iframe, object, embed, form, input, button, textarea, select, link, meta, base, svg, math')
    blocked.forEach(element => element.remove())
    template.content.querySelectorAll('*').forEach(element => {
        for(const attribute of Array.from(element.attributes)){
            const name = attribute.name.toLowerCase()
            if(name.startsWith('on') || name === 'style' || name === 'srcset'){
                element.removeAttribute(attribute.name)
            }
        }
        if(element.hasAttribute('href')){
            try {
                const url = new URL(element.getAttribute('href'))
                if(url.protocol !== 'https:') element.removeAttribute('href')
            } catch(_error) {
                element.removeAttribute('href')
            }
        }
        if(element.hasAttribute('src')){
            try {
                const url = new URL(element.getAttribute('src'))
                if(url.protocol !== 'https:') element.removeAttribute('src')
            } catch(_error) {
                element.removeAttribute('src')
            }
        }
    })
    return template.innerHTML
}

// Log deprecation and process warnings.
process.traceProcessWarnings = true
process.traceDeprecation = true

// Disable eval function.
// eslint-disable-next-line
window.eval = global.eval = function () {
    throw new Error('Sorry, this app does not support window.eval().')
}

// Display warning when devtools window is opened.
remote.getCurrentWebContents().on('devtools-opened', () => {
    console.log('%cCALM DOWN', 'color: white; -webkit-text-stroke: 4px #a02d2a; font-size: 60px; font-weight: bold')
    console.log('%cplease close the console if you dont know what are you doing, please open a ticket instead', 'font-size: 16px')
})

// Disable zoom, needed for darwin.
webFrame.setZoomLevel(0)
webFrame.setVisualZoomLevelLimits(1, 1)

// Initialize auto updates in production environments.
let updateCheckListener
if(!isDev){
    ipcRenderer.on('autoUpdateNotification', (event, arg, info) => {
        switch(arg){
            case 'checking-for-update':
                loggerAutoUpdater.info('Checking for update..')
                settingsUpdateButtonStatus(Lang.queryJS('uicore.autoUpdate.checkingForUpdateButton'), true)
                break
            case 'update-available':
                loggerAutoUpdater.info('New update available', info.version)
                
                if(process.platform === 'darwin'){
                    const dmg = info.files?.find(file => file.url?.endsWith('.dmg') && file.url.includes(process.arch))
                        || info.files?.find(file => file.url?.endsWith('.dmg'))
                    if(dmg){
                        info.darwindownload = new URL(
                            dmg.url,
                            `https://github.com/javiersarmient0/PokeAuroraLauncher/releases/download/v${info.version}/`
                        ).toString()
                    }
                    showUpdateUI(info)
                }
                
                populateSettingsUpdateInformation(info)
                break
            case 'update-downloaded':
                loggerAutoUpdater.info('Update ' + info.version + ' ready to be installed.')
                settingsUpdateButtonStatus(Lang.queryJS('uicore.autoUpdate.installNowButton'), false, () => {
                    if(!isDev){
                        ipcRenderer.send('autoUpdateAction', 'installUpdateNow')
                    }
                })
                showUpdateUI(info)
                break
            case 'update-not-available':
                loggerAutoUpdater.info('No new update found.')
                settingsUpdateButtonStatus(Lang.queryJS('uicore.autoUpdate.checkForUpdatesButton'))
                break
            case 'ready':
                updateCheckListener = setInterval(() => {
                    ipcRenderer.send('autoUpdateAction', 'checkForUpdate')
                }, 1800000)
                ipcRenderer.send('autoUpdateAction', 'checkForUpdate')
                break
            case 'realerror':
                if(info != null && info.code != null){
                    if(info.code === 'ERR_UPDATER_INVALID_RELEASE_FEED'){
                        loggerAutoUpdater.info('No suitable releases found.')
                    } else if(info.code === 'ERR_XML_MISSED_ELEMENT'){
                        loggerAutoUpdater.info('No releases found.')
                    } else {
                        loggerAutoUpdater.error('Error during update check..', info)
                        loggerAutoUpdater.debug('Error Code:', info.code)
                    }
                }
                break
            default:
                loggerAutoUpdater.info('Unknown argument', arg)
                break
        }
    })
}

/**
 * Send a notification to the main process changing the value of
 * allowPrerelease. If we are running a prerelease version, then
 * this will always be set to true, regardless of the current value
 * of val.
 * 
 * @param {boolean} val The new allow prerelease value.
 */
function changeAllowPrerelease(val){
    ipcRenderer.send('autoUpdateAction', 'allowPrereleaseChange', val)
}

function showUpdateUI(info){
    //TODO Make this message a bit more informative `${info.version}`
    document.getElementById('image_seal_container').setAttribute('update', true)
    document.getElementById('image_seal_container').onclick = () => {
        /*setOverlayContent('Update Available', 'A new update for the launcher is available. Would you like to install now?', 'Install', 'Later')
        setOverlayHandler(() => {
            if(!isDev){
                ipcRenderer.send('autoUpdateAction', 'installUpdateNow')
            } else {
                console.error('Cannot install updates in development environment.')
                toggleOverlay(false)
            }
        })
        setDismissHandler(() => {
            toggleOverlay(false)
        })
        toggleOverlay(true, true)*/
        switchView(getCurrentView(), VIEWS.settings, 500, 500, () => {
            settingsNavItemListener(document.getElementById('settingsNavUpdate'), false)
        })
    }
}

/* jQuery Example
$(function(){
    loggerUICore.info('UICore Initialized');
})*/

let coreWindowControlsBound = false
let coreLayoutFinalized = false

function bindCoreWindowControls(){
    if(coreWindowControlsBound){
        return
    }
    coreWindowControlsBound = true
    loggerUICore.info('UICore Initializing..')

    Array.from(document.getElementsByClassName('fCb')).forEach(val => {
        val.addEventListener('click', () => {
            remote.getCurrentWindow().close()
        })
    })

    Array.from(document.getElementsByClassName('fRb')).forEach(val => {
        val.addEventListener('click', () => {
            const currentWindow = remote.getCurrentWindow()
            if(currentWindow.isMaximized()){
                currentWindow.unmaximize()
            } else {
                currentWindow.maximize()
            }
            document.activeElement?.blur()
        })
    })

    Array.from(document.getElementsByClassName('fMb')).forEach(val => {
        val.addEventListener('click', () => {
            remote.getCurrentWindow().minimize()
            document.activeElement?.blur()
        })
    })

    Array.from(document.getElementsByClassName('mediaURL')).forEach(val => {
        val.addEventListener('click', () => {
            document.activeElement?.blur()
        })
    })
}

function finalizeCoreLayout(){
    if(coreLayoutFinalized){
        return
    }
    coreLayoutFinalized = true

    const launchDetails = document.getElementById('launch_details')
    const launchProgress = document.getElementById('launch_progress')
    const launchDetailsRight = document.getElementById('launch_details_right')
    const launchProgressLabel = document.getElementById('launch_progress_label')

    if(launchDetails) launchDetails.style.maxWidth = '266.01px'
    if(launchProgress) launchProgress.style.width = '170.8px'
    if(launchDetailsRight) launchDetailsRight.style.maxWidth = '170.8px'
    if(launchProgressLabel) launchProgressLabel.style.width = '53.21px'
}

// The preload bundle is injected on DOMContentLoaded, after readyState may already
// have advanced to "interactive". Bind immediately instead of waiting for an event
// that may never fire again.
if(document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', bindCoreWindowControls, { once: true })
} else {
    bindCoreWindowControls()
}

if(document.readyState === 'complete'){
    finalizeCoreLayout()
} else {
    window.addEventListener('load', finalizeCoreLayout, { once: true })
}

/**
 * Open web links in the user's default browser.
 */
$(document).on('click', 'a.mediaURLUnavailable', function(event) {
    event.preventDefault()
    document.activeElement?.blur()
})

$(document).on('click', 'a[href^="http"]', function(event) {
    event.preventDefault()
    shell.openExternal(this.href)
})

/**
 * Opens DevTools window if you hold (ctrl + shift + i).
 * This will crash the program if you are using multiple
 * DevTools, for example the chrome debugger in VS Code. 
 */
document.addEventListener('keydown', function (e) {
    if((e.key === 'I' || e.key === 'i') && e.ctrlKey && e.shiftKey){
        let window = remote.getCurrentWindow()
        window.toggleDevTools()
    }
})
