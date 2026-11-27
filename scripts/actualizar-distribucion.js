// Corrige distribution.json para el launcher 1.1.0 y genera la copia empaquetada.
// Uso: node scripts/actualizar-distribucion.js <entrada.json | URL>
// Salidas: dist-distribucion/distribution.json (para subir al bucket) y app/assets/distribution.fallback.json
const fs = require('fs')
const path = require('path')

const { DEFAULT_PROFILES } = require('../app/assets/js/profiles')
const { sanitizeDistribution } = require('../app/assets/js/distributionsanitizer')

const ADDRESS = 'mc.pokeaurora.com:25568'
const DESCRIPTION = 'Minecraft 1.21.1 · Fabric'
const NOW_REQUIRED = ['de.maxhenkel:voicechat', 'com.terraformersmc:modmenu', 'dev.kosmx.playerAnim:playeranimator']

function versionless(id){
    const [group, artifact] = String(id).split(':')
    return `${group}:${artifact}`
}

function updateDistribution(raw){
    const out = JSON.parse(JSON.stringify(raw))
    const server = out.servers.find(s => s.mainServer === true) || out.servers[0]
    server.address = ADDRESS
    server.description = DESCRIPTION
    for(const mod of server.modules){
        if(NOW_REQUIRED.includes(versionless(mod.id))){
            mod.required = { value: true }
        }
    }
    server.pokeauroraProfiles = JSON.parse(JSON.stringify(DEFAULT_PROFILES))
    return out
}

async function load(source){
    if(/^https?:\/\//.test(source)){
        const res = await fetch(`${source}${source.includes('?') ? '&' : '?'}_=${Date.now()}`)
        if(!res.ok) throw new Error(`HTTP ${res.status} al bajar ${source}`)
        return await res.json()
    }
    return JSON.parse(fs.readFileSync(source, 'utf8'))
}

async function main(){
    const source = process.argv[2]
    if(!source){
        console.error('Uso: node scripts/actualizar-distribucion.js <entrada.json | URL>')
        process.exit(1)
    }
    const root = path.resolve(__dirname, '..')
    const updated = updateDistribution(await load(source))
    const sanitized = sanitizeDistribution(updated)
    const server = sanitized.servers.find(s => s.mainServer) || sanitized.servers[0]

    const text = JSON.stringify(updated, null, 2) + '\n'
    fs.mkdirSync(path.join(root, 'dist-distribucion'), { recursive: true })
    fs.writeFileSync(path.join(root, 'dist-distribucion', 'distribution.json'), text)
    fs.writeFileSync(path.join(root, 'app', 'assets', 'distribution.fallback.json'), text)

    const fabric = server.modules.filter(m => m.type === 'FabricMod')
    const required = fabric.filter(m => NOW_REQUIRED.includes(versionless(m.id)) && m.required?.value === true)
    const p = server.pokeauroraProfiles.profiles
    console.log(`Servidor ${server.id} → ${server.address}`)
    console.log(`Mods Fabric: ${fabric.length} · nuevos obligatorios: ${required.length}/${NOW_REQUIRED.length}`)
    console.log(`Perfiles off: lite ${p.lite.off.length}, normal ${p.normal.off.length}, pro ${p.pro.off.length}`)
    const ids = new Set(fabric.map(m => versionless(m.id)))
    const missing = p.lite.off.filter(id => !ids.has(id))
    if(missing.length > 0) console.warn(`Aviso: ids de perfiles que no están en la distribución: ${missing.join(', ')}`)
    console.log('Escrito dist-distribucion/distribution.json y app/assets/distribution.fallback.json')
}

if(require.main === module){
    main().catch(error => {
        console.error(error)
        process.exit(1)
    })
}

module.exports = { updateDistribution }
