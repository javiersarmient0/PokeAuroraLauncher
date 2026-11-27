// Arma la "capa" del servidor de pruebas para un jar del mod cliente de PokeAurora.
// No sube nada: la subida a R2 y la carga en el panel de staff.pokeaurora.com son pasos manuales
// (ver staff-worker/LEEME.md).
//
// Uso: node scripts/publicar-pruebas.js <jar> <url-pública-del-jar> [versión]

const crypto = require('crypto')
const fs = require('fs')

const PRUEBAS_ID = 'pokeaurora-pruebas'
const CLIENT_MOD_ID = 'generated.fabricmod:pokeaurora:1.0.0@jar'
const VERSION_RE = /^[A-Za-z0-9.+_-]{1,64}$/

function datedVersion(now){
    const stamp = now.toISOString().slice(0, 10).replace(/-/g, '')
    return `1.0.0-pruebas.${stamp}`
}

function buildPruebasLayer({ jarPath, url, version, base = 'PokeAurora-1.21.1', now = new Date() }){
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
        add: [],
        remove: []
    }
}

if(require.main === module){
    const [jarPath, url, version] = process.argv.slice(2)
    if(!jarPath || !url){
        console.error('Uso: node scripts/publicar-pruebas.js <jar> <url-pública-del-jar> [versión]')
        process.exit(1)
    }
    try {
        console.log(JSON.stringify(buildPruebasLayer({ jarPath, url, version }), null, 2))
    } catch(error) {
        console.error(error.message)
        process.exit(1)
    }
}

module.exports = { buildPruebasLayer, CLIENT_MOD_ID }
