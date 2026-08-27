const dns = require('dns')
const fs = require('fs-extra')
const { createRequire } = require('module')
const os = require('os')
const path = require('path')
const { ipcRenderer } = require('electron')

if(dns.setDefaultResultOrder){
    dns.setDefaultResultOrder('ipv4first')
}

const runtimeInfo = ipcRenderer.sendSync('launcher:get-runtime-info')
const appRoot = path.resolve(__dirname, '..', '..')
const rendererRequire = createRequire(path.join(appRoot, 'renderer-entry.js'))
const launcherConfigPath = path.join(runtimeInfo.userDataPath, 'config.json')

const windowProxy = {
    close: () => ipcRenderer.send('launcher:window-action', 'close'),
    minimize: () => ipcRenderer.send('launcher:window-action', 'minimize'),
    maximize: () => ipcRenderer.send('launcher:window-action', 'maximize'),
    unmaximize: () => ipcRenderer.send('launcher:window-action', 'unmaximize'),
    isMaximized: () => ipcRenderer.sendSync('launcher:window-is-maximized'),
    toggleDevTools: () => ipcRenderer.send('launcher:window-action', 'toggle-devtools'),
    setProgressBar: value => ipcRenderer.send('launcher:window-action', 'set-progress', value)
}

const remote = {
    app: {
        getVersion: () => runtimeInfo.appVersion,
        getPath: name => name === 'userData' ? runtimeInfo.userDataPath : null
    },
    dialog: {
        showOpenDialog: (_window, options) => ipcRenderer.invoke('launcher:show-open-dialog', options)
    },
    getCurrentWindow: () => windowProxy,
    getCurrentWebContents: () => ({ on: () => {} })
}

const shell = {
    openExternal: uri => ipcRenderer.invoke('launcher:open-external', uri),
    openPath: target => ipcRenderer.invoke('launcher:open-path', target),
    beep: () => ipcRenderer.send('launcher:beep')
}

function loadPrivilegedUI(){
    const execute = require('./privileged-ui.bundle')
    const rendererModule = { exports: {} }
    execute(
        rendererRequire,
        rendererModule,
        rendererModule.exports,
        appRoot,
        path.join(appRoot, 'renderer-entry.js'),
        remote,
        shell,
        runtimeInfo
    )
}

function initializeLauncherConfig(){
    const ConfigManager = require('./configmanager')
    const { DistroAPI } = require('./distromanager')
    const LangLoader = require('./langloader')

    ConfigManager.load()
    DistroAPI.commonDir = ConfigManager.getCommonDirectory()
    DistroAPI.instanceDir = ConfigManager.getInstanceDirectory()
    LangLoader.setupLanguage(launcherConfigPath)
    return ConfigManager
}

async function initializeLauncherData(ConfigManager){
    const { DistroAPI } = require('./distromanager')
    const { LoggerUtil } = require('helios-core')
    const logger = LoggerUtil.getLogger('Preloader')

    const onDistroLoad = data => {
        if(data != null && (ConfigManager.getSelectedServer() == null || data.getServerById(ConfigManager.getSelectedServer()) == null)){
            logger.info('Selecting the default server.')
            ConfigManager.setSelectedServer(data.getMainServer().rawServer.id)
            ConfigManager.save()
        }
        ipcRenderer.send('distributionIndexDone', data != null)
    }

    try {
        const distribution = await DistroAPI.getDistribution()
        logger.info('Loaded and validated distribution index.')
        onDistroLoad(distribution)
    } catch(error) {
        logger.error('The launcher could not load a valid distribution index.', error)
        onDistroLoad(null)
    }

    fs.remove(path.join(os.tmpdir(), ConfigManager.getTempNativeFolder())).catch(error => {
        logger.warn('Unable to clean the temporary natives directory.', error)
    })
}

window.addEventListener('DOMContentLoaded', async () => {
    try {
        const ConfigManager = initializeLauncherConfig()
        loadPrivilegedUI()
        await initializeLauncherData(ConfigManager)
    } catch(error) {
        console.error('Unable to initialize the launcher UI.', error?.stack || error)
        const loading = document.getElementById('loadingContainer')
        if(loading){
            loading.textContent = 'No se pudo iniciar el launcher. Revisa el registro de diagnóstico.'
        }
    }
}, { once: true })
