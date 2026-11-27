// Descarga de la distribución con respaldos: varias URLs en orden y una copia empaquetada en el instalador.
const fs = require('fs')
const path = require('path')

const REMOTE_DISTRO_URLS = [
    'https://launcher.pokeaurora.com/distribution.json',
    'https://pub-16d8232ded904a1bbed89826fb24c57e.r2.dev/distribution.json'
]

/**
 * Prueba cada URL en orden y devuelve la primera distribución que llega y pasa el sanitizador.
 *
 * @param {string[]} urls
 * @param {(url: string) => Promise<{data: object|null}>} pullOne
 * @param {(data: object) => object} sanitize lanza si la distribución no es válida
 * @returns {Promise<{data: object|null, url: string|null}>}
 */
async function pullFirstValid(urls, pullOne, sanitize){
    for(const url of urls){
        try {
            const response = await pullOne(url)
            if(response?.data != null){
                return { data: sanitize(response.data), url }
            }
        } catch {
            // Se prueba la siguiente URL.
        }
    }
    return { data: null, url: null }
}

/**
 * Lee la copia de la distribución que viaja dentro del instalador (assets/distribution.fallback.json).
 *
 * @param {string} appDir carpeta app/ del launcher
 * @param {(data: object) => object} sanitize
 * @returns {object|null}
 */
function readBundledDistribution(appDir, sanitize){
    try {
        const raw = JSON.parse(fs.readFileSync(path.join(appDir, 'assets', 'distribution.fallback.json'), 'utf8'))
        return sanitize(raw)
    } catch {
        return null
    }
}

module.exports = {
    REMOTE_DISTRO_URLS,
    pullFirstValid,
    readBundledDistribution
}
