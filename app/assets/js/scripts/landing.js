/**
 * Script for landing.ejs
 */
// Requirements
const { URL }                 = require('url')
const fs                      = require('fs-extra')
const https                   = require('https')
const path                    = require('path')
const {
    MojangRestAPI,
    getServerStatus
}                             = require('helios-core/mojang')
const {
    RestResponseStatus,
    isDisplayableError,
    validateLocalFile
}                             = require('helios-core/common')
const {
    FullRepair,
    DistributionIndexProcessor,
    MojangIndexProcessor,
    downloadFile
}                             = require('helios-core/dl')
const {
    validateSelectedJvm,
    ensureJavaDirIsRoot,
    javaExecFromRoot,
    discoverBestJvmInstallation,
    latestOpenJDK,
    extractJdk
}                             = require('helios-core/java')

// Internal Requirements
const DiscordWrapper          = require('./assets/js/discordwrapper')
const ProcessBuilder          = require('./assets/js/processbuilder')
const { estimateSelectedSize } = require('./assets/js/smartrepair')
const { syncBundledGameConfig } = require('./assets/js/gameconfigsync')
const SkinUtil                = require('./assets/js/skinutil')

// Launch Elements
const launch_content          = document.getElementById('launch_content')
const launch_details          = document.getElementById('launch_details')
const launch_progress         = document.getElementById('launch_progress')
const launch_progress_label   = document.getElementById('launch_progress_label')
const launch_details_text     = document.getElementById('launch_details_text')
const server_selection_button = document.getElementById('server_selection_button')
const user_text               = document.getElementById('user_text')

const loggerLanding = LoggerUtil.getLogger('Landing')

/* Launch Progress Wrapper Functions */

/**
 * Show/hide the loading area.
 * 
 * @param {boolean} loading True if the loading area should be shown, otherwise false.
 */
function toggleLaunchArea(loading){
    if(loading){
        launch_details.style.display = 'flex'
        launch_content.style.display = 'none'
    } else {
        launch_details.style.display = 'none'
        launch_content.style.display = 'inline-flex'
    }
}

/**
 * Set the details text of the loading area.
 * 
 * @param {string} details The new text for the loading details.
 */
function setLaunchDetails(details){
    launch_details_text.innerHTML = details
}

/**
 * Set the value of the loading progress bar and display that value.
 * 
 * @param {number} percent Percentage (0-100)
 */
function setLaunchPercentage(percent){
    launch_progress.setAttribute('max', 100)
    launch_progress.setAttribute('value', percent)
    launch_progress_label.innerHTML = percent + '%'
}

/**
 * Set the value of the OS progress bar and display that on the UI.
 * 
 * @param {number} percent Percentage (0-100)
 */
function setDownloadPercentage(percent){
    remote.getCurrentWindow().setProgressBar(percent/100)
    setLaunchPercentage(percent)
}

function formatBytes(bytes){
    if(!Number.isFinite(bytes) || bytes <= 0) return '0 MB'
    const units = ['B', 'KB', 'MB', 'GB']
    const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1)
    return `${(bytes / Math.pow(1024, index)).toFixed(index >= 2 ? 1 : 0)} ${units[index]}`
}

function formatEta(seconds){
    if(!Number.isFinite(seconds)) return '--:--'
    const minutes = Math.floor(seconds / 60)
    const remaining = Math.max(0, Math.floor(seconds % 60))
    return `${minutes}:${String(remaining).padStart(2, '0')}`
}

async function confirmInitialInstall(distro, server){
    const marker = path.join(ConfigManager.getInstanceDirectory(), server.rawServer.id, '.install-complete')
    if(await fs.pathExists(marker)){
        return true
    }

    await fs.ensureDir(ConfigManager.getDataDirectory())
    const selectedSize = estimateSelectedSize(
        distro,
        server.rawServer.id,
        ConfigManager.getModConfiguration(server.rawServer.id)
    )
    const disk = typeof fs.statfs === 'function'
        ? await fs.statfs(ConfigManager.getDataDirectory())
        : null
    const freeBytes = disk == null ? null : disk.bavail * disk.bsize
    if(freeBytes != null && freeBytes < selectedSize * 1.25){
        showLaunchFailure(
            'Espacio insuficiente',
            `La instalación necesita aproximadamente ${formatBytes(selectedSize)}, pero hay ${formatBytes(freeBytes)} disponibles.`
        )
        return false
    }

    return new Promise(resolve => {
        setOverlayContent(
            'Preparar PokeAurora',
            `Se descargarán aproximadamente ${formatBytes(selectedSize)} más los archivos base de Minecraft.${freeBytes == null ? '' : ` Hay ${formatBytes(freeBytes)} libres.`}`,
            'Continuar',
            'Cancelar'
        )
        setOverlayHandler(() => {
            toggleOverlay(false)
            resolve(true)
        })
        setDismissHandler(() => {
            toggleOverlay(false)
            toggleLaunchArea(false)
            resolve(false)
        })
        toggleOverlay(true, true)
    })
}

/**
 * Enable or disable the launch button.
 * 
 * @param {boolean} val True to enable, false to disable.
 */
function setLaunchEnabled(val){
    document.getElementById('launch_button').disabled = !val
}

// Bind launch button
document.getElementById('launch_button').addEventListener('click', async e => {
    loggerLanding.info('Launching game..')
    try {
        const server = (await DistroAPI.getDistribution()).getServerById(ConfigManager.getSelectedServer())
        const jExe = ConfigManager.getJavaExecutable(ConfigManager.getSelectedServer())
        if(jExe == null){
            await asyncSystemScan(server.effectiveJavaOptions)
        } else {

            setLaunchDetails(Lang.queryJS('landing.launch.pleaseWait'))
            toggleLaunchArea(true)
            setLaunchPercentage(0, 100)

            const details = await validateSelectedJvm(ensureJavaDirIsRoot(jExe), server.effectiveJavaOptions.supported)
            if(details != null){
                loggerLanding.info('Jvm Details', details)
                await dlAsync()

            } else {
                await asyncSystemScan(server.effectiveJavaOptions)
            }
        }
    } catch(err) {
        loggerLanding.error('Unhandled error in during launch process.', err)
        showLaunchFailure(Lang.queryJS('landing.launch.failureTitle'), Lang.queryJS('landing.launch.failureText'))
    }
})

// Bind settings button
document.getElementById('settingsMediaButton').onclick = async e => {
    await prepareSettings()
    switchView(getCurrentView(), VIEWS.settings)
}

// Bind avatar overlay button.
document.getElementById('avatarOverlay').onclick = async e => {
    await prepareSettings()
    switchView(getCurrentView(), VIEWS.settings, 500, 500, () => {
        settingsNavItemListener(document.getElementById('settingsNavAccount'), false)
    })
}

// Bind selected account
async function updateSelectedAccount(authUser) {
    let username = Lang.queryJS('landing.selectedAccount.noAccountSelected')
    const avatar = document.getElementById('avatarContainer')

    if(authUser != null){
        username = authUser.displayName || authUser.username || username
        try {
            const head = await SkinUtil.getHead(authUser)
            avatar.style.backgroundImage = `url('${head}')`
        } catch(error) {
            loggerLanding.warn('Unable to render selected account skin.', error)
            avatar.style.backgroundImage = 'none'
        }
    } else {
        avatar.style.backgroundImage = 'none'
    }

    user_text.textContent = username
}

// Call the function with the selected account
updateSelectedAccount(ConfigManager.getSelectedAccount());

// Bind selected server
function updateSelectedServer(serv){
    if(getCurrentView() === VIEWS.settings){
        fullSettingsSave()
    }
    ConfigManager.setSelectedServer(serv != null ? serv.rawServer.id : null)
    ConfigManager.save()
 server_selection_button.innerHTML = '&#8226; ' +
    (serv != null ? serv.rawServer.name : Lang.queryJS('landing.noSelection'))
    if(getCurrentView() === VIEWS.settings){
        animateSettingsTabRefresh()
    }
    setLaunchEnabled(serv != null)
}
// Real text is set in uibinder.js on distributionIndexDone.
server_selection_button.innerHTML = '&#8226; ' +
    Lang.queryJS('landing.selectedServer.loading')
server_selection_button.onclick = async e => {
    e.target.blur()
    const distribution = await DistroAPI.getDistribution()
    if(distribution.servers.length > 1){
        await toggleServerSelection(true)
    }
}


const refreshServerStatus = async (fade = false) => {
    loggerLanding.info('Refreshing Server Status')
    const serv = (await DistroAPI.getDistribution()).getServerById(ConfigManager.getSelectedServer())

    let pLabel = Lang.queryJS('landing.serverStatus.server')
    let playerOnline = '--'
    let playerMax = '--'
    let serverOnline = false

    try {
        const servStat = await getServerStatus(767, serv.hostname, serv.port)

        const icon = document.getElementById('mojang_status_icon')
        if(icon){
            icon.style.color = '#43b581'
        }

        pLabel = Lang.queryJS('landing.serverStatus.players')
        playerOnline = String(servStat.players.online)
        playerMax = String(servStat.players.max)
        serverOnline = true

    } catch(err) {

        const icon = document.getElementById('mojang_status_icon')
        if(icon){
            icon.style.color = '#ff5555'
        }

    }

    const updatePlayerDisplay = () => {
        const wrapper = document.getElementById('server_status_wrapper')
        const label = document.getElementById('landingPlayerLabel')
        const online = document.getElementById('player_count_online')
        const max = document.getElementById('player_count_max')

        if(wrapper){
            wrapper.dataset.state = serverOnline ? 'online' : 'offline'
        }
        if(label){
            label.textContent = pLabel
        }
        if(online){
            online.textContent = playerOnline
        }
        if(max){
            max.textContent = playerMax
        }
    }

    if(fade){
        $('#server_status_wrapper').fadeOut(180, () => {
            updatePlayerDisplay()
            $('#server_status_wrapper').fadeIn(320)
        })
    } else {
        updatePlayerDisplay()
    }
    
}

/* System (Java) Scan */

/**
 * Asynchronously scan the system for valid Java installations.
 * 
 * @param {boolean} launchAfter Whether we should begin to launch after scanning. 
 */
async function asyncSystemScan(effectiveJavaOptions, launchAfter = true){

    setLaunchDetails(Lang.queryJS('landing.systemScan.checking'))
    toggleLaunchArea(true)
    setLaunchPercentage(0, 100)

    const jvmDetails = await discoverBestJvmInstallation(
        ConfigManager.getDataDirectory(),
        effectiveJavaOptions.supported
    )

    if(jvmDetails == null) {
        // If the result is null, no valid Java installation was found.
        // Show this information to the user.
        setOverlayContent(
            Lang.queryJS('landing.systemScan.noCompatibleJava'),
            Lang.queryJS('landing.systemScan.installJavaMessage', { 'major': effectiveJavaOptions.suggestedMajor }),
            Lang.queryJS('landing.systemScan.installJava'),
            Lang.queryJS('landing.systemScan.installJavaManually')
        )
        setOverlayHandler(() => {
            setLaunchDetails(Lang.queryJS('landing.systemScan.javaDownloadPrepare'))
            toggleOverlay(false)
            
            try {
                downloadJava(effectiveJavaOptions, launchAfter)
            } catch(err) {
                loggerLanding.error('Unhandled error in Java Download', err)
                showLaunchFailure(Lang.queryJS('landing.systemScan.javaDownloadFailureTitle'), Lang.queryJS('landing.systemScan.javaDownloadFailureText'))
            }
        })
        setDismissHandler(() => {
            $('#overlayContent').fadeOut(250, () => {
                //$('#overlayDismiss').toggle(false)
                setOverlayContent(
                    Lang.queryJS('landing.systemScan.javaRequired', { 'major': effectiveJavaOptions.suggestedMajor }),
                    Lang.queryJS('landing.systemScan.javaRequiredMessage', { 'major': effectiveJavaOptions.suggestedMajor }),
                    Lang.queryJS('landing.systemScan.javaRequiredDismiss'),
                    Lang.queryJS('landing.systemScan.javaRequiredCancel')
                )
                setOverlayHandler(() => {
                    toggleLaunchArea(false)
                    toggleOverlay(false)
                })
                setDismissHandler(() => {
                    toggleOverlay(false, true)

                    asyncSystemScan(effectiveJavaOptions, launchAfter)
                })
                $('#overlayContent').fadeIn(250)
            })
        })
        toggleOverlay(true, true)
    } else {
        // Java installation found, use this to launch the game.
        const javaExec = javaExecFromRoot(jvmDetails.path)
        ConfigManager.setJavaExecutable(ConfigManager.getSelectedServer(), javaExec)
        ConfigManager.save()

        // We need to make sure that the updated value is on the settings UI.
        // Just incase the settings UI is already open.
        settingsJavaExecVal.value = javaExec
        await populateJavaExecDetails(settingsJavaExecVal.value)

        // TODO Callback hell, refactor
        // TODO Move this out, separate concerns.
        if(launchAfter){
            await dlAsync()
        }
    }

}

async function downloadJava(effectiveJavaOptions, launchAfter = true) {

    // TODO Error handling.
    // asset can be null.
    const asset = await latestOpenJDK(
        effectiveJavaOptions.suggestedMajor,
        ConfigManager.getDataDirectory(),
        effectiveJavaOptions.distribution)

    if(asset == null) {
        throw new Error(Lang.queryJS('landing.downloadJava.findJdkFailure'))
    }

    let received = 0
    await downloadFile(asset.url, asset.path, ({ transferred }) => {
        received = transferred
        setDownloadPercentage(Math.trunc((transferred/asset.size)*100))
    })
    setDownloadPercentage(100)

    if(received != asset.size) {
        loggerLanding.warn(`Java Download: Expected ${asset.size} bytes but received ${received}`)
        if(!await validateLocalFile(asset.path, asset.algo, asset.hash)) {
            log.error(`Hashes do not match, ${asset.id} may be corrupted.`)
            // Don't know how this could happen, but report it.
            throw new Error(Lang.queryJS('landing.downloadJava.javaDownloadCorruptedError'))
        }
    }

    // Extract
    // Show installing progress bar.
    remote.getCurrentWindow().setProgressBar(2)

    // Wait for extration to complete.
    const eLStr = Lang.queryJS('landing.downloadJava.extractingJava')
    let dotStr = ''
    setLaunchDetails(eLStr)
    const extractListener = setInterval(() => {
        if(dotStr.length >= 3){
            dotStr = ''
        } else {
            dotStr += '.'
        }
        setLaunchDetails(eLStr + dotStr)
    }, 750)

    const newJavaExec = await extractJdk(asset.path)

    // Extraction complete, remove the loading from the OS progress bar.
    remote.getCurrentWindow().setProgressBar(-1)

    // Extraction completed successfully.
    ConfigManager.setJavaExecutable(ConfigManager.getSelectedServer(), newJavaExec)
    ConfigManager.save()

    clearInterval(extractListener)
    setLaunchDetails(Lang.queryJS('landing.downloadJava.javaInstalled'))

    // TODO Callback hell
    // Refactor the launch functions
    asyncSystemScan(effectiveJavaOptions, launchAfter)

}

// Keep reference to Minecraft Process
let proc
// Is DiscordRPC enabled
let hasRPC = false
// Joined server regex
// Change this if your server uses something different.
const GAME_JOINED_REGEX = /\[.+\]: Sound engine started/
const GAME_LAUNCH_REGEX = /^\[.+\]: (?:MinecraftForge .+ Initialized|ModLauncher .+ starting: .+|Loading Minecraft .+ with Fabric Loader .+)$/
const MIN_LINGER = 5000

async function dlAsync(login = true) {


    // Login parameter is temporary for debug purposes. Allows testing the validation/downloads without
    // launching the game.

    const loggerLaunchSuite = LoggerUtil.getLogger('LaunchSuite')

    setLaunchDetails(Lang.queryJS('landing.dlAsync.loadingServerInfo'))

    let distro

    try {
        distro = await DistroAPI.refreshDistributionOrFallback()
        onDistroRefresh(distro)
    } catch(err) {
        loggerLaunchSuite.error('Unable to refresh distribution index.', err)
        showLaunchFailure(Lang.queryJS('landing.dlAsync.fatalError'), Lang.queryJS('landing.dlAsync.unableToLoadDistributionIndex'))
        return
    }

    const serv = distro.getServerById(ConfigManager.getSelectedServer())

    if(!await confirmInitialInstall(distro, serv)){
        return
    }

    if(login) {
        if(ConfigManager.getSelectedAccount() == null){
            loggerLanding.error('You must be logged into an account.')
            return
        }
    }

    setLaunchDetails(Lang.queryJS('landing.dlAsync.pleaseWait'))
    toggleLaunchArea(true)
    setLaunchPercentage(0, 100)

    // FullRepair performs a complete integrity validation in the same
    // isolated child process used by the original launcher. Consume the
    // repair request so the UI flag does not remain stuck between launches.
    ConfigManager.consumeFullRepairRequest()
    ConfigManager.save()
    const fullRepairModule = new FullRepair(
        ConfigManager.getCommonDirectory(),
        ConfigManager.getInstanceDirectory(),
        ConfigManager.getLauncherDirectory(),
        ConfigManager.getSelectedServer(),
        DistroAPI.isDevMode()
    )

    fullRepairModule.spawnReceiver()

    let repairFinished = false
    fullRepairModule.childProcess.on('error', err => {
        loggerLaunchSuite.error('FullRepair receiver error.', err)
        if(!repairFinished){
            remote.getCurrentWindow().setProgressBar(-1)
            showLaunchFailure(
                Lang.queryJS('landing.dlAsync.errorDuringFileVerificationTitle'),
                err.message || Lang.queryJS('landing.dlAsync.seeConsoleForDetails')
            )
        }
    })

    fullRepairModule.childProcess.on('close', code => {
        if(!repairFinished && code !== 0){
            loggerLaunchSuite.error(`FullRepair receiver exited unexpectedly with code ${code}.`)
        }
    })

    loggerLaunchSuite.info('Validating files.')
    setLaunchDetails(Lang.queryJS('landing.dlAsync.validatingFileIntegrity'))
    setLaunchPercentage(0)
    let invalidFileCount = 0
    try {
        invalidFileCount = await fullRepairModule.verifyFiles(percent => {
            setLaunchPercentage(percent)
        })
        setLaunchPercentage(100)
    } catch (err) {
        loggerLaunchSuite.error('Error during file validation.')
        showLaunchFailure(Lang.queryJS('landing.dlAsync.errorDuringFileVerificationTitle'), err.displayable || Lang.queryJS('landing.dlAsync.seeConsoleForDetails'))
        return
    }
    

    if(invalidFileCount > 0) {
        loggerLaunchSuite.info('Downloading files.')
        setLaunchDetails(Lang.queryJS('landing.dlAsync.downloadingFiles'))
        setLaunchPercentage(0)
        try {
            await fullRepairModule.download(percent => {
                setDownloadPercentage(percent)
            })
            setDownloadPercentage(100)
        } catch (err) {
            loggerLaunchSuite.error('Unable to download or validate launcher files.', err)
            fullRepairModule.destroyReceiver()
            remote.getCurrentWindow().setProgressBar(-1)
            showLaunchFailure(
                Lang.queryJS('landing.dlAsync.errorDuringFileVerificationTitle'),
                err.message || Lang.queryJS('landing.dlAsync.seeConsoleForDetails')
            )
            return
        }
    } else {
        loggerLaunchSuite.info('No invalid files, skipping download.')
    }

    await fs.outputFile(
        path.join(ConfigManager.getInstanceDirectory(), serv.rawServer.id, '.install-complete'),
        '1.0.0\n'
    )

    // Remove download bar.
    remote.getCurrentWindow().setProgressBar(-1)

    repairFinished = true
    fullRepairModule.destroyReceiver()

    setLaunchDetails(Lang.queryJS('landing.dlAsync.preparingToLaunch'))

    try {
        await syncBundledGameConfig(
            path.join(ConfigManager.getInstanceDirectory(), serv.rawServer.id)
        )
    } catch(error) {
        loggerLaunchSuite.error('Unable to synchronize the bundled game configuration.', error)
        showLaunchFailure(
            Lang.queryJS('landing.dlAsync.errorDuringFileVerificationTitle'),
            Lang.queryJS('landing.dlAsync.gameConfigFailure')
        )
        return
    }

    const mojangIndexProcessor = new MojangIndexProcessor(
        ConfigManager.getCommonDirectory(),
        serv.rawServer.minecraftVersion)
    const distributionIndexProcessor = new DistributionIndexProcessor(
        ConfigManager.getCommonDirectory(),
        distro,
        serv.rawServer.id
    )

    const modLoaderData = await distributionIndexProcessor.loadModLoaderVersionJson(serv)
    const versionData = await mojangIndexProcessor.getVersionJson()

    if(login) {
        const authUser = ConfigManager.getSelectedAccount()
        loggerLaunchSuite.info(`Sending selected account (${authUser.displayName}) to ProcessBuilder.`)
        let pb = new ProcessBuilder(serv, versionData, modLoaderData, authUser, remote.app.getVersion())
        setLaunchDetails(Lang.queryJS('landing.dlAsync.launchingGame'))

        // const SERVER_JOINED_REGEX = /\[.+\]: \[CHAT\] [a-zA-Z0-9_]{1,16} joined the game/
        const escapedDisplayName = authUser.displayName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
        const SERVER_JOINED_REGEX = new RegExp(`\\[.+\\]: \\[CHAT\\] ${escapedDisplayName} joined the game`)

        const onLoadComplete = () => {
            clearTimeout(launchFallbackTimer)
            toggleLaunchArea(false)
            if(hasRPC && proc?.stdout){
                DiscordWrapper.updateDetails(Lang.queryJS('landing.discord.loading'))
                proc.stdout.on('data', gameStateChange)
            }
            proc?.stdout?.removeListener('data', tempListener)
            proc?.stderr?.removeListener('data', gameErrorListener)
        }
        const start = Date.now()
        const launchFallbackTimer = setTimeout(() => {
            if(proc != null && proc.exitCode == null){
                onLoadComplete()
            }
        }, 30000)

        // Attach a temporary listener to the client output.
        // Will wait for a certain bit of text meaning that
        // the client application has started, and we can hide
        // the progress bar stuff.
        const tempListener = function(data){
            if(GAME_LAUNCH_REGEX.test(data.trim())){
                const diff = Date.now()-start
                if(diff < MIN_LINGER) {
                    setTimeout(onLoadComplete, MIN_LINGER-diff)
                } else {
                    onLoadComplete()
                }
            }
        }

        // Listener for Discord RPC.
        const gameStateChange = function(data){
            data = data.trim()
            if(SERVER_JOINED_REGEX.test(data)){
                DiscordWrapper.updateDetails(Lang.queryJS('landing.discord.joined'))
            } else if(GAME_JOINED_REGEX.test(data)){
                DiscordWrapper.updateDetails(Lang.queryJS('landing.discord.joining'))
            }
        }

        const gameErrorListener = function(data){
            data = data.trim()
            if(data.indexOf('Could not find or load main class net.minecraft.launchwrapper.Launch') > -1){
                loggerLaunchSuite.error('Game launch failed, LaunchWrapper was not downloaded properly.')
                showLaunchFailure(Lang.queryJS('landing.dlAsync.errorDuringLaunchTitle'), Lang.queryJS('landing.dlAsync.launchWrapperNotDownloaded'))
            }
        }

        try {
            // Build Minecraft process.
            proc = pb.build()

            proc.on('error', error => {
                clearTimeout(launchFallbackTimer)
                loggerLaunchSuite.error('Minecraft could not be started.', error)
                showLaunchFailure(
                    Lang.queryJS('landing.dlAsync.errorDuringLaunchTitle'),
                    error.message || Lang.queryJS('landing.dlAsync.checkConsoleForDetails')
                )
            })

            // Bind listeners to stdout.
            proc.stdout?.on('data', tempListener)
            proc.stderr?.on('data', gameErrorListener)

            setLaunchDetails(Lang.queryJS('landing.dlAsync.doneEnjoyServer'))


DiscordWrapper.initRPC({ clientId: '1511180208693055488' }, {})
hasRPC = true
DiscordWrapper.updateDetails('Explorando el Launcher') 
DiscordWrapper.updateState('Esperando para jugar')

proc.on('close', (code, signal) => {
    loggerLaunchSuite.info('Shutting down Discord Rich Presence..')
    DiscordWrapper.shutdownRPC()
    hasRPC = false
    proc = null
})

        } catch(err) {

            clearTimeout(launchFallbackTimer)

            loggerLaunchSuite.error('Error during launch', err)
            showLaunchFailure(Lang.queryJS('landing.dlAsync.errorDuringLaunchTitle'), Lang.queryJS('landing.dlAsync.checkConsoleForDetails'))

        }
    }

}

/**
 * News Loading Functions
 */

// DOM Cache
const newsContent                   = document.getElementById('newsContent')
const newsArticleTitle              = document.getElementById('newsArticleTitle')
const newsArticleDate               = document.getElementById('newsArticleDate')
const newsArticleAuthor             = document.getElementById('newsArticleAuthor')
const newsArticleComments           = document.getElementById('newsArticleComments')
const newsNavigationStatus          = document.getElementById('newsNavigationStatus')
const newsArticleContentScrollable  = document.getElementById('newsArticleContentScrollable')
const nELoadSpan                    = document.getElementById('nELoadSpan')

// News slide caches.
let newsActive = false
let newsGlideCount = 0

/**
 * Show the news UI via a slide animation.
 * 
 * @param {boolean} up True to slide up, otherwise false. 
 */
function slide_(up){
    const lCUpper = document.querySelector('#landingContainer > #upper')
    const lCLLeft = document.querySelector('#landingContainer > #lower > #left')
    const lCLCenter = document.querySelector('#landingContainer > #lower > #center')
    const lCLRight = document.querySelector('#landingContainer > #lower > #right')
    const newsBtn = document.querySelector('#landingContainer > #lower > #center #content')
    const landingContainer = document.getElementById('landingContainer')
    const newsContainer = document.querySelector('#landingContainer > #newsContainer')

    newsGlideCount++

    if(up){
        lCUpper.style.top = '-200vh'
        lCLLeft.style.top = '-200vh'
        lCLCenter.style.top = '-200vh'
        lCLRight.style.top = '-200vh'
        newsBtn.style.top = '130vh'
        newsContainer.style.top = '0px'
        //date.toLocaleDateString('en-US', {month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: 'numeric'})
        //landingContainer.style.background = 'rgba(29, 29, 29, 0.55)'
        landingContainer.style.background = 'rgba(0, 0, 0, 0.50)'
        setTimeout(() => {
            if(newsGlideCount === 1){
                lCLCenter.style.transition = 'none'
                newsBtn.style.transition = 'none'
            }
            newsGlideCount--
        }, 2000)
    } else {
        setTimeout(() => {
            newsGlideCount--
        }, 2000)
        landingContainer.style.background = null
        lCLCenter.style.transition = null
        newsBtn.style.transition = null
        newsContainer.style.top = '100%'
        lCUpper.style.top = '0px'
        lCLLeft.style.top = '0px'
        lCLCenter.style.top = '0px'
        lCLRight.style.top = '0px'
        newsBtn.style.top = '10px'
    }
}

// Bind news button.
document.getElementById('newsButton').onclick = () => {
    // Toggle tabbing.
    if(newsActive){
        $('#landingContainer *').removeAttr('tabindex')
        $('#newsContainer *').attr('tabindex', '-1')
    } else {
        $('#landingContainer *').attr('tabindex', '-1')
        $('#newsContainer, #newsContainer *, #lower, #lower #center *').removeAttr('tabindex')
        if(newsAlertShown){
            $('#newsButtonAlert').fadeOut(2000)
            newsAlertShown = false
            ConfigManager.setNewsCacheDismissed(true)
            ConfigManager.save()
        }
    }
    slide_(!newsActive)
    newsActive = !newsActive
}

// Array to store article meta.
let newsArr = null

// News load animation listener.
let newsLoadingListener = null

/**
 * Set the news loading animation.
 * 
 * @param {boolean} val True to set loading animation, otherwise false.
 */
function setNewsLoading(val){
    if(val){
        const nLStr = Lang.queryJS('landing.news.checking')
        let dotStr = '..'
        nELoadSpan.innerHTML = nLStr + dotStr
        newsLoadingListener = setInterval(() => {
            if(dotStr.length >= 3){
                dotStr = ''
            } else {
                dotStr += '.'
            }
            nELoadSpan.innerHTML = nLStr + dotStr
        }, 750)
    } else {
        if(newsLoadingListener != null){
            clearInterval(newsLoadingListener)
            newsLoadingListener = null
        }
    }
}

// Bind retry button.
newsErrorRetry.onclick = () => {
    $('#newsErrorFailed').fadeOut(250, () => {
        initNews()
        $('#newsErrorLoading').fadeIn(250)
    })
}

newsArticleContentScrollable.onscroll = (e) => {
    if(e.target.scrollTop > Number.parseFloat($('.newsArticleSpacerTop').css('height'))){
        newsContent.setAttribute('scrolled', '')
    } else {
        newsContent.removeAttribute('scrolled')
    }
}

/**
 * Reload the news without restarting.
 * 
 * @returns {Promise.<void>} A promise which resolves when the news
 * content has finished loading and transitioning.
 */
function reloadNews(){
    return new Promise((resolve, reject) => {
        $('#newsContent').fadeOut(250, () => {
            $('#newsErrorLoading').fadeIn(250)
            initNews().then(() => {
                resolve()
            })
        })
    })
}

let newsAlertShown = false

/**
 * Show the news alert indicating there is new news.
 */
function showNewsAlert(){
    newsAlertShown = true
    $(newsButtonAlert).fadeIn(250)
}

async function digestMessage(str) {
    const msgUint8 = new TextEncoder().encode(str)
    const hashBuffer = await crypto.subtle.digest('SHA-1', msgUint8)
    const hashArray = Array.from(new Uint8Array(hashBuffer))
    const hashHex = hashArray
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('')
    return hashHex
}

/**
 * Initialize News UI. This will load the news and prepare
 * the UI accordingly.
 * 
 * @returns {Promise.<void>} A promise which resolves when the news
 * content has finished loading and transitioning.
 */
async function initNews(){

    setNewsLoading(true)

    const news = await loadNews()

    newsArr = news?.articles || null

    if(newsArr == null){
        // News Loading Failed
        setNewsLoading(false)

        await $('#newsErrorLoading').fadeOut(250).promise()
        await $('#newsErrorFailed').fadeIn(250).promise()

    } else if(newsArr.length === 0) {
        // No News Articles
        setNewsLoading(false)

        ConfigManager.setNewsCache({
            date: null,
            content: null,
            dismissed: false
        })
        ConfigManager.save()

        await $('#newsErrorLoading').fadeOut(250).promise()
        await $('#newsErrorNone').fadeIn(250).promise()
    } else {
        // Success
        setNewsLoading(false)

        const lN = newsArr[0]
        const cached = ConfigManager.getNewsCache()
        let newHash = await digestMessage(lN.content)
        let newDate = new Date(lN.date)
        let isNew = false

        if(cached.date != null && cached.content != null){

            if(new Date(cached.date) >= newDate){

                // Compare Content
                if(cached.content !== newHash){
                    isNew = true
                    showNewsAlert()
                } else {
                    if(!cached.dismissed){
                        isNew = true
                        showNewsAlert()
                    }
                }

            } else {
                isNew = true
                showNewsAlert()
            }

        } else {
            isNew = true
            showNewsAlert()
        }

        if(isNew){
            ConfigManager.setNewsCache({
                date: newDate.getTime(),
                content: newHash,
                dismissed: false
            })
            ConfigManager.save()
        }

        const switchHandler = (forward) => {
            let cArt = parseInt(newsContent.getAttribute('article'))
            let nxtArt = forward ? (cArt >= newsArr.length-1 ? 0 : cArt + 1) : (cArt <= 0 ? newsArr.length-1 : cArt - 1)
    
            displayArticle(newsArr[nxtArt], nxtArt+1)
        }

        document.getElementById('newsNavigateRight').onclick = () => { switchHandler(true) }
        document.getElementById('newsNavigateLeft').onclick = () => { switchHandler(false) }
        await $('#newsErrorContainer').fadeOut(250).promise()
        displayArticle(newsArr[0], 1)
        await $('#newsContent').fadeIn(250).promise()
    }


}

/**
 * Add keyboard controls to the news UI. Left and right arrows toggle
 * between articles. If you are on the landing page, the up arrow will
 * open the news UI.
 */
document.addEventListener('keydown', (e) => {
    if(newsActive){
        if(e.key === 'ArrowRight' || e.key === 'ArrowLeft'){
            document.getElementById(e.key === 'ArrowRight' ? 'newsNavigateRight' : 'newsNavigateLeft').click()
        }
        // Interferes with scrolling an article using the down arrow.
        // Not sure of a straight forward solution at this point.
        // if(e.key === 'ArrowDown'){
        //     document.getElementById('newsButton').click()
        // }
    } else {
        if(getCurrentView() === VIEWS.landing){
            if(e.key === 'ArrowUp'){
                document.getElementById('newsButton').click()
            }
        }
    }
})

/**
 * Display a news article on the UI.
 * 
 * @param {Object} articleObject The article meta object.
 * @param {number} index The article index.
 */
function displayArticle(articleObject, index){
    newsArticleTitle.textContent = articleObject.title
    newsArticleTitle.href = articleObject.link || '#'
    newsArticleAuthor.textContent = 'Por ' + (articleObject.author || 'PokeAurora')
    const articleDate = new Date(articleObject.date)
    newsArticleDate.textContent = Number.isNaN(articleDate.getTime())
        ? articleObject.date
        : articleDate.toLocaleString('es-AR', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
    newsArticleComments.textContent = articleObject.comments || 'Más información'
    newsArticleComments.href = articleObject.commentsLink || articleObject.link || '#'
    newsArticleContentScrollable.innerHTML = '<div id="newsArticleContentWrapper"><div class="newsArticleSpacerTop"></div>' + sanitizeRemoteHTML(articleObject.content) + '<div class="newsArticleSpacerBot"></div></div>'
    Array.from(newsArticleContentScrollable.getElementsByClassName('bbCodeSpoilerButton')).forEach(v => {
        v.onclick = () => {
            const text = v.parentElement.getElementsByClassName('bbCodeSpoilerText')[0]
            text.style.display = text.style.display === 'block' ? 'none' : 'block'
        }
    })
    newsNavigationStatus.innerHTML = Lang.query('ejs.landing.newsNavigationStatus', {currentPage: index, totalPages: newsArr.length})
    newsContent.setAttribute('article', index-1)
}

/**
 * Request an HTTPS resource from the privileged preload context. This avoids
 * coupling the news feed to the renderer CSP while keeping the accepted
 * protocol restricted to HTTPS.
 */
function requestNewsFeed(url, redirects = 0){
    return new Promise((resolve, reject) => {
        let parsed
        try {
            parsed = new URL(url)
        } catch(error) {
            reject(error)
            return
        }

        if(parsed.protocol !== 'https:'){
            reject(new Error('News feed must use HTTPS.'))
            return
        }
        if(redirects > 3){
            reject(new Error('Too many RSS redirects.'))
            return
        }

        const request = https.get(parsed, {
            headers: {
                'User-Agent': 'PokeAuroraLauncher/1.0',
                'Accept': 'application/rss+xml, application/xml, text/xml;q=0.9, */*;q=0.5'
            }
        }, response => {
            const status = response.statusCode || 0
            if(status >= 300 && status < 400 && response.headers.location){
                response.resume()
                try {
                    const redirect = new URL(response.headers.location, parsed).toString()
                    requestNewsFeed(redirect, redirects + 1).then(resolve, reject)
                } catch(error) {
                    reject(error)
                }
                return
            }
            if(status < 200 || status >= 300){
                response.resume()
                reject(new Error(`RSS request failed with status ${status}.`))
                return
            }

            const chunks = []
            let length = 0
            response.on('data', chunk => {
                length += chunk.length
                if(length > 2 * 1024 * 1024){
                    request.destroy(new Error('RSS feed exceeds the 2 MB limit.'))
                    return
                }
                chunks.push(chunk)
            })
            response.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
            response.on('error', reject)
        })

        request.setTimeout(6000, () => request.destroy(new Error('RSS request timed out.')))
        request.on('error', reject)
    })
}

function parseRSSNews(xmlText, newsFeed){
    const xml = $.parseXML(xmlText)
    const items = $(xml).find('item')
    const articles = []
    const newsOrigin = new URL(newsFeed).origin

    for(let i = 0; i < items.length; i++){
        const el = $(items[i])
        const link = el.find('link').first().text().trim()
        const title = el.find('title').first().text().trim() || 'PokeAurora'
        const author = el.find('dc\\:creator').first().text().trim()
            || el.find('author').first().text().trim()
            || 'PokeAurora'
        const date = el.find('pubDate').first().text().trim() || new Date().toISOString()

        let content = el.find('content\\:encoded').first().text()
        if(!content){
            content = el.find('description').first().text()
        }
        content = content.replace(/src=["'](?!https?:\/\/|data:|\/\/)([^"']+)["']/gi, (_match, src) => {
            try {
                return `src="${new URL(src, newsOrigin).toString()}"`
            } catch(_error) {
                return `src="${src}"`
            }
        })

        let commentsCount = el.find('slash\\:comments').first().text().trim()
        if(/^\d+$/.test(commentsCount)){
            commentsCount = `${commentsCount} comentario${commentsCount === '1' ? '' : 's'}`
        } else {
            commentsCount = 'Más información'
        }

        articles.push({
            link,
            title,
            date,
            author,
            content,
            comments: commentsCount,
            commentsLink: link ? `${link}#comments` : '#'
        })
    }

    return articles
}

async function loadBundledNews(){
    try {
        const bundledPath = path.join(__dirname, 'assets', 'news', 'news.json')
        const data = await fs.readJson(bundledPath)
        const articles = Array.isArray(data?.articles) ? data.articles : []
        return { articles }
    } catch(error) {
        loggerLanding.error('Unable to load bundled news.', error)
        return { articles: null }
    }
}

/**
 * Load news from the configured RSS feed. If no feed exists or the remote feed
 * is temporarily unavailable, use the bundled PokeAurora news so the panel
 * remains functional instead of displaying a permanent error.
 */
async function loadNews(){
    try {
        const distroData = await DistroAPI.getDistribution()
        const newsFeed = distroData?.rawDistribution?.rss

        if(newsFeed){
            try {
                const xmlText = await requestNewsFeed(newsFeed)
                const articles = parseRSSNews(xmlText, newsFeed)
                if(articles.length > 0){
                    return { articles }
                }
                loggerLanding.warn('RSS feed returned no articles. Using bundled news.')
            } catch(error) {
                loggerLanding.warn('Unable to load RSS news. Using bundled news.', error)
            }
        } else {
            loggerLanding.debug('No RSS feed provided. Using bundled news.')
        }
    } catch(error) {
        loggerLanding.warn('Unable to read the distribution news configuration. Using bundled news.', error)
    }

    return loadBundledNews()
}
