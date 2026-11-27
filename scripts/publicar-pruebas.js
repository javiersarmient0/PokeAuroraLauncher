// Arma la "capa" del servidor de pruebas para un jar del mod cliente de PokeAurora.
// No sube nada: la subida a R2 y la carga en el panel de staff.pokeaurora.com son pasos manuales
// (ver staff-worker/LEEME.md).
//
// Uso: node scripts/publicar-pruebas.js <jar> <url-pública-del-jar> [versión] [--add <jar> <url>]...
// Cada --add suma un mod extra (solo para el servidor de pruebas). Su id sale del nombre del archivo:
// utilskc-2.0.1.jar -> generated.fabricmod:utilskc:2.0.1@jar

const crypto = require('crypto')
const fs = require('fs')
const path = require('path')

const PRUEBAS_ID = 'pokeaurora-pruebas'
const CLIENT_MOD_ID = 'generated.fabricmod:pokeaurora:1.0.0@jar'
const VERSION_RE = /^[A-Za-z0-9.+_-]{1,64}$/

function datedVersion(now){
    const stamp = now.toISOString().slice(0, 10).replace(/-/g, '')
    return `1.0.0-pruebas.${stamp}`
}

const EXTRA_NAME_RE = /^(.+?)-(\d[A-Za-z0-9.+_-]*)\.jar$/

function extraModule({ jarPath, url, id }){
    if(typeof url !== 'string' || !url.startsWith('https://')){
        throw new Error('La URL del mod extra tiene que ser https://')
    }
    new URL(url)
    let moduleId = id
    if(moduleId == null){
        const match = EXTRA_NAME_RE.exec(path.basename(jarPath))
        if(match == null){
            throw new Error(`No puedo sacar nombre y versión de "${path.basename(jarPath)}". Esperaba nombre-1.2.3.jar`)
        }
        moduleId = `generated.fabricmod:${match[1].toLowerCase()}:${match[2]}@jar`
    }
    const bytes = fs.readFileSync(jarPath)
    return {
        id: moduleId,
        name: path.basename(jarPath, '.jar'),
        type: 'FabricMod',
        artifact: {
            size: bytes.length,
            MD5: crypto.createHash('md5').update(bytes).digest('hex'),
            url
        }
    }
}

function buildPruebasLayer({ jarPath, url, version, base = 'PokeAurora-1.21.1', now = new Date(), extras = [] }){
    if(typeof url !== 'string' || !url.startsWith('https://')){
        throw new Error('La URL del jar tiene que ser https://')
    }
    new URL(url)
    const finalVersion = version ?? datedVersion(now)
    if(!VERSION_RE.test(finalVersion)){
        throw new Error(`La versión "${finalVersion}" no es válida: usa letras, números, puntos o guiones.`)
    }

    const bytes = fs.readFileSync(jarPath)
    return {
        id: PRUEBAS_ID,
        name: 'Pruebas',
        address: 'pruebas.pokeaurora.com',
        description: 'Servidor de pruebas de PokeAurora',
        base,
        replace: {
            [CLIENT_MOD_ID]: {
                id: `generated.fabricmod:pokeaurora:${finalVersion}@jar`,
                name: `PokeAurora (pruebas ${finalVersion})`,
                type: 'FabricMod',
                artifact: {
                    size: bytes.length,
                    MD5: crypto.createHash('md5').update(bytes).digest('hex'),
                    url
                }
            }
        },
        add: extras.map(extraModule),
        remove: []
    }
}

if(require.main === module){
    const args = process.argv.slice(2)
    const extras = []
    const positional = []
    for(let i = 0; i < args.length; i++){
        if(args[i] === '--add'){
            extras.push({ jarPath: args[i + 1], url: args[i + 2] })
            i += 2
        } else {
            positional.push(args[i])
        }
    }
    const [jarPath, url, version] = positional
    if(!jarPath || !url || extras.some(extra => !extra.jarPath || !extra.url)){
        console.error('Uso: node scripts/publicar-pruebas.js <jar> <url-pública-del-jar> [versión] [--add <jar> <url>]...')
        process.exit(1)
    }
    try {
        console.log(JSON.stringify(buildPruebasLayer({ jarPath, url, version, extras }), null, 2))
    } catch(error) {
        console.error(error.message)
        process.exit(1)
    }
}

module.exports = { buildPruebasLayer, CLIENT_MOD_ID }
