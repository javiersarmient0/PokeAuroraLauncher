// Requirements
const { app, BrowserWindow, clipboard, dialog, ipcMain, Menu, safeStorage, shell } = require('electron')
const autoUpdater                       = require('electron-updater').autoUpdater
const ejse                              = require('ejs-electron')
const fs                                = require('fs')
const isDev                             = require('./app/assets/js/isdev')
const path                              = require('path')
const semver                            = require('semver')
const { pathToFileURL }                 = require('url')
const { AZURE_CLIENT_ID, MSFT_OPCODE, MSFT_REPLY_TYPE, MSFT_ERROR, SHELL_OPCODE } = require('./app/assets/js/ipcconstants')
const LangLoader                        = require('./app/assets/js/langloader')

const ALLOWED_EXTERNAL_PROTOCOLS = new Set(['https:', 'mailto:'])
const WINDOW_ACTION_CHANNEL = 'launcher:window-action'
const VERSION_LOCKED = false
let autoUpdaterInitialized = false

// Setup Lang
const dir = path.join(app.getPath('userData'), 'config.json')
LangLoader.setupLanguage(dir)


// Setup auto updater.
function initAutoUpdater(event, data) {

    if(VERSION_LOCKED){
        event.sender.send('autoUpdateNotification', 'update-not-available', { version: '1.0.0' })
        return
    }

    if(autoUpdaterInitialized){
        return
    }
    autoUpdaterInitialized = true

    if(data){
        autoUpdater.allowPrerelease = true
    } else {
        // Defaults to true if application version contains prerelease components (e.g. 0.12.1-alpha.1)
        // autoUpdater.allowPrerelease = true
    }
    
    if(isDev){
        autoUpdater.autoInstallOnAppQuit = false
        autoUpdater.updateConfigPath = path.join(__dirname, 'dev-app-update.yml')
    }
    if(process.platform === 'darwin'){
        autoUpdater.autoDownload = false
    }
    const notify = (action, info) => {
        if(win != null && !win.isDestroyed()){
            win.webContents.send('autoUpdateNotification', action, info)
        }
    }
    autoUpdater.on('update-available', (info) => {
        notify('update-available', info)
    })
    autoUpdater.on('update-downloaded', (info) => {
        notify('update-downloaded', info)
    })
    autoUpdater.on('update-not-available', (info) => {
        notify('update-not-available', info)
    })
    autoUpdater.on('checking-for-update', () => {
        notify('checking-for-update')
    })
    autoUpdater.on('error', (err) => {
        notify('realerror', { code: err.code, message: err.message })
    }) 
}

// Open channel to listen for update actions.
ipcMain.on('autoUpdateAction', (event, arg, data) => {
    switch(arg){
        case 'initAutoUpdater':
            console.log('Initializing auto updater.')
            initAutoUpdater(event, data)
            event.sender.send('autoUpdateNotification', 'ready')
            break
        case 'checkForUpdate':
            if(VERSION_LOCKED){
                event.sender.send('autoUpdateNotification', 'update-not-available', { version: '1.0.0' })
                break
            }
            autoUpdater.checkForUpdates()
                .catch(err => {
                    event.sender.send('autoUpdateNotification', 'realerror', { code: err.code, message: err.message })
                })
            break
        case 'allowPrereleaseChange':
            if(!data){
                const preRelComp = semver.prerelease(app.getVersion())
                if(preRelComp != null && preRelComp.length > 0){
                    autoUpdater.allowPrerelease = true
                } else {
                    autoUpdater.allowPrerelease = data
                }
            } else {
                autoUpdater.allowPrerelease = data
            }
            break
        case 'installUpdateNow':
            if(!VERSION_LOCKED){
                autoUpdater.quitAndInstall()
            }
            break
        default:
            console.log('Unknown argument', arg)
            break
    }
})
// Redirect distribution index event from preloader to renderer.
ipcMain.on('distributionIndexDone', (event, res) => {
    event.sender.send('distributionIndexDone', res)
})

ipcMain.on('launcher:get-runtime-info', (event) => {
    event.returnValue = {
        appVersion: app.getVersion(),
        userDataPath: app.getPath('userData'),
        resourcesPath: process.resourcesPath,
        isPackaged: app.isPackaged,
        platform: process.platform,
        arch: process.arch
    }
})

ipcMain.on('launcher:secure-encrypt', (event, value) => {
    try {
        if(typeof value !== 'string' || value.length > 32768){
            throw new Error('Invalid secret value.')
        }
        event.returnValue = {
            ok: true,
            value: safeStorage.encryptString(value).toString('base64'),
            backend: process.platform === 'linux' ? safeStorage.getSelectedStorageBackend() : 'os'
        }
    } catch(error) {
        event.returnValue = { ok: false, error: error.message }
    }
})

ipcMain.on('launcher:secure-decrypt', (event, value) => {
    try {
        if(typeof value !== 'string' || value.length > 131072){
            throw new Error('Invalid encrypted value.')
        }
        event.returnValue = {
            ok: true,
            value: safeStorage.decryptString(Buffer.from(value, 'base64'))
        }
    } catch(error) {
        event.returnValue = { ok: false, error: error.message }
    }
})

ipcMain.on(WINDOW_ACTION_CHANNEL, (event, action, value) => {
    const target = BrowserWindow.fromWebContents(event.sender)
    if(target == null){
        return
    }
    switch(action){
        case 'close':
            target.close()
            break
        case 'minimize':
            target.minimize()
            break
        case 'maximize':
            target.maximize()
            break
        case 'unmaximize':
            target.unmaximize()
            break
        case 'toggle-devtools':
            if(isDev){
                target.webContents.toggleDevTools()
            }
            break
        case 'set-progress':
            if(typeof value === 'number' && value >= -1 && value <= 2){
                target.setProgressBar(value)
            }
            break
        case 'relaunch':
            app.relaunch()
            app.quit()
            break
    }
})

ipcMain.on('launcher:window-is-maximized', (event) => {
    const target = BrowserWindow.fromWebContents(event.sender)
    event.returnValue = target?.isMaximized() === true
})

ipcMain.handle('launcher:show-open-dialog', async (event, options) => {
    const target = BrowserWindow.fromWebContents(event.sender)
    const safeOptions = {
        title: typeof options?.title === 'string' ? options.title.slice(0, 160) : undefined,
        properties: Array.isArray(options?.properties)
            ? options.properties.filter(x => ['openFile', 'openDirectory', 'createDirectory'].includes(x))
            : ['openFile'],
        filters: Array.isArray(options?.filters) ? options.filters : undefined
    }
    return dialog.showOpenDialog(target, safeOptions)
})

ipcMain.handle('launcher:open-external', async (_event, uri) => {
    const parsed = new URL(uri)
    if(!ALLOWED_EXTERNAL_PROTOCOLS.has(parsed.protocol)){
        throw new Error('External URL protocol is not allowed.')
    }
    await shell.openExternal(parsed.toString())
})

ipcMain.handle('launcher:open-path', async (_event, targetPath) => {
    if(typeof targetPath !== 'string' || !path.isAbsolute(targetPath)){
        throw new Error('Invalid path.')
    }
    return shell.openPath(targetPath)
})

ipcMain.on('launcher:beep', () => shell.beep())

ipcMain.handle('launcher:copy-diagnostics', async (_event, diagnostics) => {
    if(typeof diagnostics !== 'string' || diagnostics.length > 100000){
        throw new Error('Invalid diagnostics payload.')
    }
    clipboard.writeText(diagnostics)
    return true
})

// Handle trash item.
ipcMain.handle(SHELL_OPCODE.TRASH_ITEM, async (event, ...args) => {
    try {
        const target = args[0]
        if(typeof target !== 'string' || !path.isAbsolute(target) || path.dirname(target) === target){
            throw new Error('Invalid trash target.')
        }
        await shell.trashItem(target)
        return {
            result: true
        }
    } catch(error) {
        return {
            result: false,
            error: error
        }
    }
})

const REDIRECT_URI_PREFIX = 'https://login.microsoftonline.com/common/oauth2/nativeclient' 

// Microsoft Auth Login
let msftAuthWindow
let msftAuthSuccess
let msftAuthViewSuccess
let msftAuthViewOnClose

ipcMain.on(MSFT_OPCODE.OPEN_LOGIN, (ipcEvent, ...arguments_) => {
    if (msftAuthWindow) {
        ipcEvent.reply(MSFT_OPCODE.REPLY_LOGIN, MSFT_REPLY_TYPE.ERROR, MSFT_ERROR.ALREADY_OPEN, msftAuthViewOnClose)
        return
    }
    msftAuthSuccess = false
    msftAuthViewSuccess = arguments_[0]
    msftAuthViewOnClose = arguments_[1]
    
    msftAuthWindow = new BrowserWindow({
        title: LangLoader.queryJS('index.microsoftLoginTitle'),
        backgroundColor: '#222222',
        width: 520,
        height: 600,
        frame: true,
        icon: getPlatformIcon('SealCircle'),
        webPreferences: {
            partition: 'persist:microsoft-auth',
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: true
        }
    })

    msftAuthWindow.on('closed', () => {
        msftAuthWindow = undefined
    })

    msftAuthWindow.on('close', () => {
        if(!msftAuthSuccess) {
            ipcEvent.reply(MSFT_OPCODE.REPLY_LOGIN, MSFT_REPLY_TYPE.ERROR, MSFT_ERROR.NOT_FINISHED, msftAuthViewOnClose)
        }
    })

 
    const handleNavigation = (event, uri) => {
        if (uri.startsWith(REDIRECT_URI_PREFIX)) {
            if (event) event.preventDefault() 

            let queryMap = {}
            const urlObj = new URL(uri)

            urlObj.searchParams.forEach((v, k) => {
                queryMap[k] = v
            })

            if (urlObj.hash) {
                const hashParams = new URLSearchParams(urlObj.hash.substring(1))
                hashParams.forEach((v, k) => {
                    queryMap[k] = v
                })
            }

            if (!msftAuthSuccess) {
                msftAuthSuccess = true
                ipcEvent.reply(MSFT_OPCODE.REPLY_LOGIN, MSFT_REPLY_TYPE.SUCCESS, queryMap, msftAuthViewSuccess)
                
                if (msftAuthWindow && !msftAuthWindow.isDestroyed()) {
                    msftAuthWindow.close()
                }
            }
            return
        }
        try {
            const host = new URL(uri).hostname
            const allowed = host === 'login.microsoftonline.com'
                || host === 'login.live.com'
                || host.endsWith('.microsoft.com')
                || host.endsWith('.msauth.net')
                || host.endsWith('.msftauth.net')
            if(!allowed && event){
                event.preventDefault()
            }
        } catch(_error) {
            if(event) event.preventDefault()
        }
    }

    msftAuthWindow.webContents.on('will-redirect', handleNavigation)
    msftAuthWindow.webContents.on('will-navigate', handleNavigation)
    msftAuthWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))

    msftAuthWindow.removeMenu()
    msftAuthWindow.loadURL(`https://login.microsoftonline.com/consumers/oauth2/v2.0/authorize?prompt=select_account&client_id=${AZURE_CLIENT_ID}&response_type=code&scope=XboxLive.signin%20offline_access&redirect_uri=https://login.microsoftonline.com/common/oauth2/nativeclient`)
})

// Microsoft Auth Logout
let msftLogoutWindow
let msftLogoutSuccess
let msftLogoutSuccessSent
ipcMain.on(MSFT_OPCODE.OPEN_LOGOUT, (ipcEvent, uuid, isLastAccount) => {
    if (msftLogoutWindow) {
        ipcEvent.reply(MSFT_OPCODE.REPLY_LOGOUT, MSFT_REPLY_TYPE.ERROR, MSFT_ERROR.ALREADY_OPEN)
        return
    }

    msftLogoutSuccess = false
    msftLogoutSuccessSent = false
    msftLogoutWindow = new BrowserWindow({
        title: LangLoader.queryJS('index.microsoftLogoutTitle'),
        backgroundColor: '#222222',
        width: 520,
        height: 600,
        frame: true,
        icon: getPlatformIcon('SealCircle'),
        webPreferences: {
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: true
        }
    })

    msftLogoutWindow.on('closed', () => {
        msftLogoutWindow = undefined
    })

    msftLogoutWindow.on('close', () => {
        if(!msftLogoutSuccess) {
            ipcEvent.reply(MSFT_OPCODE.REPLY_LOGOUT, MSFT_REPLY_TYPE.ERROR, MSFT_ERROR.NOT_FINISHED)
        } else if(!msftLogoutSuccessSent) {
            msftLogoutSuccessSent = true
            ipcEvent.reply(MSFT_OPCODE.REPLY_LOGOUT, MSFT_REPLY_TYPE.SUCCESS, uuid, isLastAccount)
        }
    })
    
    msftLogoutWindow.webContents.on('did-navigate', (_, uri) => {
        if(uri.startsWith('https://login.microsoftonline.com/common/oauth2/v2.0/logoutsession')) {
            msftLogoutSuccess = true
            setTimeout(() => {
                if(!msftLogoutSuccessSent) {
                    msftLogoutSuccessSent = true
                    ipcEvent.reply(MSFT_OPCODE.REPLY_LOGOUT, MSFT_REPLY_TYPE.SUCCESS, uuid, isLastAccount)
                }

                if(msftLogoutWindow) {
                    msftLogoutWindow.close()
                    msftLogoutWindow = null
                }
            }, 5000)
        }
    })
    msftLogoutWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
    
    msftLogoutWindow.removeMenu()
    msftLogoutWindow.loadURL('https://login.microsoftonline.com/common/oauth2/v2.0/logout')
})

// Keep a global reference of the window object, if you don't, the window will
// be closed automatically when the JavaScript object is garbage collected.
let win

function createWindow() {

    win = new BrowserWindow({
     width: 1500,
     minWidth: 1255,
     height: 844,
     minHeight: 704,
        icon: getPlatformIcon('SealCircle'),
        frame: false,
        webPreferences: {
            preload: path.join(__dirname, 'app', 'assets', 'js', 'preloader.js'),
            nodeIntegration: false,
            contextIsolation: true,
            sandbox: false
        },
        backgroundColor: '#000000'
    })
    const data = {
        bkid: Math.floor((Math.random() * fs.readdirSync(path.join(__dirname, 'app', 'assets', 'images', 'backgrounds')).length)),
        lang: (str, placeHolders) => LangLoader.queryEJS(str, placeHolders)
    }
    Object.entries(data).forEach(([key, val]) => ejse.data(key, val))

    win.loadURL(pathToFileURL(path.join(__dirname, 'app', 'app.ejs')).toString())

    win.webContents.on('will-navigate', (event, destination) => {
        const current = win.webContents.getURL()
        if(destination !== current){
            event.preventDefault()
            try {
                const parsed = new URL(destination)
                if(ALLOWED_EXTERNAL_PROTOCOLS.has(parsed.protocol)){
                    shell.openExternal(parsed.toString())
                }
            } catch(_error) {
                // Invalid links are ignored.
            }
        }
    })
    win.webContents.setWindowOpenHandler(({ url }) => {
        try {
            const parsed = new URL(url)
            if(ALLOWED_EXTERNAL_PROTOCOLS.has(parsed.protocol)){
                shell.openExternal(parsed.toString())
            }
        } catch(_error) {
            // Invalid links are ignored.
        }
        return { action: 'deny' }
    })

    /*win.once('ready-to-show', () => {
        win.show()
    })*/

    win.removeMenu()

    win.resizable = true

    win.on('closed', () => {
        win = null
    })
}

function createMenu() {
    
    if(process.platform === 'darwin') {

        // Extend default included application menu to continue support for quit keyboard shortcut
        let applicationSubMenu = {
            label: 'Application',
            submenu: [{
                label: 'About Application',
                selector: 'orderFrontStandardAboutPanel:'
            }, {
                type: 'separator'
            }, {
                label: 'Quit',
                accelerator: 'Command+Q',
                click: () => {
                    app.quit()
                }
            }]
        }

        // New edit menu adds support for text-editing keyboard shortcuts
        let editSubMenu = {
            label: 'Edit',
            submenu: [{
                label: 'Undo',
                accelerator: 'CmdOrCtrl+Z',
                selector: 'undo:'
            }, {
                label: 'Redo',
                accelerator: 'Shift+CmdOrCtrl+Z',
                selector: 'redo:'
            }, {
                type: 'separator'
            }, {
                label: 'Cut',
                accelerator: 'CmdOrCtrl+X',
                selector: 'cut:'
            }, {
                label: 'Copy',
                accelerator: 'CmdOrCtrl+C',
                selector: 'copy:'
            }, {
                label: 'Paste',
                accelerator: 'CmdOrCtrl+V',
                selector: 'paste:'
            }, {
                label: 'Select All',
                accelerator: 'CmdOrCtrl+A',
                selector: 'selectAll:'
            }]
        }

        // Bundle submenus into a single template and build a menu object with it
        let menuTemplate = [applicationSubMenu, editSubMenu]
        let menuObject = Menu.buildFromTemplate(menuTemplate)

        // Assign it to the application
        Menu.setApplicationMenu(menuObject)

    }

}

function getPlatformIcon(filename){
    let ext
    switch(process.platform) {
        case 'win32':
            ext = 'ico'
            break
        case 'darwin':
        case 'linux':
        default:
            ext = 'png'
            break
    }

    return path.join(__dirname, 'app', 'assets', 'images', `${filename}.${ext}`)
}

app.on('ready', createWindow)
app.on('ready', createMenu)

app.on('window-all-closed', () => {
    // On macOS it is common for applications and their menu bar
    // to stay active until the user quits explicitly with Cmd + Q
    if (process.platform !== 'darwin') {
        app.quit()
    }
})

app.on('activate', () => {
    // On macOS it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (win === null) {
        createWindow()
    }
})

