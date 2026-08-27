const fs = require('fs')
const path = require('path')
const { spawnSync } = require('child_process')

const root = path.resolve(__dirname, '..')
const ignored = new Set(['node_modules', 'dist', '.git'])

function walk(directory, accumulator = []){
    for(const entry of fs.readdirSync(directory, { withFileTypes: true })){
        if(ignored.has(entry.name)) continue
        const target = path.join(directory, entry.name)
        if(entry.isDirectory()) walk(target, accumulator)
        else accumulator.push(target)
    }
    return accumulator
}

function fail(message){
    console.error(message)
    process.exitCode = 1
}

const files = walk(root)
const textFiles = files.filter(file => /\.(?:js|json|ejs|toml|yml|md)$/.test(file))
const forbidden = [
    ['auth.zelthoriaismp.cloud', 'obsolete Zelthoria authentication endpoint'],
    ['@electron/remote', 'deprecated Electron remote module'],
    ['discord.gg/m4g4v9abMY', 'obsolete Discord invitation'],
    ['discord.gg/DFxgS7a9J6', 'obsolete Discord invitation'],
    ['discord.gg/hg58gR59', 'obsolete Discord invitation'],
    ['nodeIntegration: true', 'unsafe Node integration'],
    ['contextIsolation: false', 'disabled context isolation']
]

for(const file of textFiles){
    if(file === __filename) continue
    const source = fs.readFileSync(file, 'utf8')
    for(const [needle, label] of forbidden){
        if(source.includes(needle)) fail(`${path.relative(root, file)} contains ${label}.`)
    }
}

for(const file of files.filter(file => file.endsWith('.js'))){
    const result = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' })
    if(result.status !== 0) fail(result.stderr || `Syntax check failed for ${file}.`)
}

const appTemplate = fs.readFileSync(path.join(root, 'app', 'app.ejs'), 'utf8')
if(/<script\b/i.test(appTemplate)) fail('The unprivileged page must not load scripts.')

const backgrounds = fs.readdirSync(path.join(root, 'app', 'assets', 'images', 'backgrounds'))
if(backgrounds.some(file => !file.endsWith('.webp'))) fail('Launcher backgrounds must be optimized WebP files.')
if(backgrounds.length !== 1 || backgrounds[0] !== '0.webp') fail('The official launcher background must be the only selectable background.')

const requiredBrandAssets = [
    ['app/assets/images/SealCircle.png', 1000],
    ['app/assets/images/SealCircle.ico', 1000],
    ['app/assets/images/minecraft.icns', 1000],
    ['build/icon.png', 1000],
    ['app/assets/audio/button-click.wav', 1000],
    ['app/assets/audio/button-hover.wav', 1000],
    ['app/assets/game-config/pokeaurora-config.zip', 100000]
]
for(const [relativePath, minimumSize] of requiredBrandAssets){
    const target = path.join(root, relativePath)
    if(!fs.existsSync(target) || fs.statSync(target).size < minimumSize){
        fail(`Required branded asset is missing or invalid: ${relativePath}.`)
    }
}

if(!process.exitCode) console.log('Project checks passed.')
