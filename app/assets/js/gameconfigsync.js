const AdmZip = require('adm-zip')
const crypto = require('crypto')
const fs = require('fs-extra')
const path = require('path')

const CONFIG_ARCHIVE_SHA256 = '8c37c2f0542950b880515fb9180caa72fb93f2c215d23e39ac30230abb42c1f0'

function getArchivePath(){
    return path.join(__dirname, '..', 'game-config', 'pokeaurora-config.zip')
}

function validateEntryName(name){
    const normalized = name.replaceAll('\\', '/')
    const isAllowed = normalized === 'servers.dat'
        || normalized === 'config/'
        || normalized === 'config/fancymenu/'
        || normalized.startsWith('config/fancymenu/')
    if(!isAllowed || normalized.startsWith('/') || normalized.includes('../')){
        throw new Error(`Unexpected bundled configuration entry: ${name}`)
    }
    return normalized
}

async function syncBundledGameConfig(instanceDirectory){
    const archivePath = getArchivePath()
    const archiveData = await fs.readFile(archivePath)
    const digest = crypto.createHash('sha256').update(archiveData).digest('hex')
    if(digest !== CONFIG_ARCHIVE_SHA256){
        throw new Error('The bundled game configuration failed its integrity check.')
    }

    const zip = new AdmZip(archiveData)
    const staging = path.join(instanceDirectory, '.pokeaurora-config-staging')
    await fs.remove(staging)
    await fs.ensureDir(staging)

    try {
        for(const entry of zip.getEntries()){
            const name = validateEntryName(entry.entryName)
            const target = path.resolve(staging, name)
            if(!target.startsWith(path.resolve(staging) + path.sep)){
                throw new Error(`Unsafe bundled configuration path: ${entry.entryName}`)
            }
            if(entry.isDirectory){
                await fs.ensureDir(target)
            } else {
                await fs.outputFile(target, entry.getData())
            }
        }

        const stagedFancyMenu = path.join(staging, 'config', 'fancymenu')
        const targetFancyMenu = path.join(instanceDirectory, 'config', 'fancymenu')
        if(!await fs.pathExists(stagedFancyMenu) || !await fs.pathExists(path.join(staging, 'servers.dat'))){
            throw new Error('The bundled configuration is incomplete.')
        }

        await fs.remove(targetFancyMenu)
        await fs.ensureDir(path.dirname(targetFancyMenu))
        await fs.move(stagedFancyMenu, targetFancyMenu, { overwrite: true })
        await fs.move(path.join(staging, 'servers.dat'), path.join(instanceDirectory, 'servers.dat'), { overwrite: true })
    } finally {
        await fs.remove(staging)
    }
}

module.exports = { CONFIG_ARCHIVE_SHA256, syncBundledGameConfig, validateEntryName }
