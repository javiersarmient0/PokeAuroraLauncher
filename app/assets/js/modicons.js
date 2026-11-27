// Íconos oficiales de los mods: se leen del jar ya descargado (fabric.mod.json → "icon").
// No descarga nada; si el jar no está o no trae ícono, la pestaña Mods deja las iniciales.
const StreamZip = require('node-stream-zip')
const crypto = require('crypto')
const path = require('path')

const MAX_ICON_BYTES = 2 * 1024 * 1024
const MIME = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp' }

/**
 * fabric.mod.json permite "icon" como ruta o como mapa tamaño→ruta.
 *
 * @returns {string|null}
 */
function pickFabricIcon(icon){
    if(typeof icon === 'string' && icon.trim() !== '') return icon
    if(icon == null || typeof icon !== 'object') return null
    const sizes = Object.keys(icon).map(Number).filter(n => Number.isFinite(n) && typeof icon[n] === 'string').sort((a, b) => a - b)
    if(sizes.length === 0) return null
    const size = sizes.find(n => n >= 64) ?? sizes[sizes.length - 1]
    return icon[size]
}

async function readJson(zip, entries, name){
    if(entries[name] == null) return null
    const text = (await zip.entryData(name)).toString('utf8')
    // Algunos mods traen tabs o saltos de línea sin escapar dentro de strings.
    const clean = text.charCodeAt(0) === 0xFEFF ? text.slice(1) : text
    return JSON.parse(clean.replace(/[\u0000-\u001f]+/g, ' '))
}

/**
 * Lee solo el índice del jar y el ícono (no carga el jar entero en memoria).
 *
 * @param {string} jarPath
 * @returns {Promise<{data: Buffer, mime: string}|null>}
 */
async function readModIconFromJar(jarPath){
    let zip = null
    try {
        zip = new StreamZip.async({ file: jarPath })
        const entries = await zip.entries()
        const fabric = await readJson(zip, entries, 'fabric.mod.json')
        const quilt = fabric == null ? await readJson(zip, entries, 'quilt.mod.json') : null
        const iconPath = pickFabricIcon(fabric?.icon ?? quilt?.quilt_loader?.metadata?.icon)
        if(iconPath == null) return null
        const name = iconPath.replace(/^\/+/, '')
        const mime = MIME[path.extname(name).toLowerCase()]
        const entry = entries[name]
        if(mime == null || entry == null || entry.size > MAX_ICON_BYTES) return null
        const data = await zip.entryData(name)
        return data.length > 0 ? { data, mime } : null
    } catch {
        return null
    } finally {
        if(zip != null) await zip.close().catch(() => {})
    }
}

/**
 * Nombre de archivo de caché para el ícono de un jar (cambia si cambia la versión del jar).
 */
function iconCacheName(jarPath){
    const base = path.basename(String(jarPath)).replace(/\.jar$/i, '').replace(/[^\w.-]+/g, '_').slice(0, 60)
    const hash = crypto.createHash('sha1').update(String(jarPath)).digest('hex').slice(0, 10)
    return `${base}-${hash}.png`
}

module.exports = { pickFabricIcon, readModIconFromJar, iconCacheName }
