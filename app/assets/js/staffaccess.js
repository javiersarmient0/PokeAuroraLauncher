// Acceso del staff al servidor de pruebas.
// El Worker de staff.pokeaurora.com devuelve una "capa" sobre el servidor principal
// (replace/add/remove por id de módulo); acá se arma el servidor de pruebas con ella.
// Sin dependencias de Electron: se prueba con node:test.

const PRUEBAS_ID = 'pokeaurora-pruebas'
const DEFAULT_STAFF_API = 'https://staff.pokeaurora.com'
const DEFAULT_TIMEOUT_MS = 4000

// En desarrollo (sin empaquetar) se puede apuntar a un Worker local con POKEAURORA_STAFF_API.
function resolveStaffApi(){
    const override = process.env.POKEAURORA_STAFF_API
    const packaged = __dirname.includes('app.asar')
    return !packaged && typeof override === 'string' && override.length > 0 ? override : DEFAULT_STAFF_API
}

const STAFF_API = resolveStaffApi()

function clone(value){
    return JSON.parse(JSON.stringify(value))
}

function normalizeNick(nick){
    return typeof nick === 'string' ? nick.trim().toLowerCase() : ''
}

// En pruebas todos los opcionales van prendidos (equivale a Pro).
function optionalsOn(modules){
    return modules.map(module => {
        if(module?.required != null && module.required.value === false){
            module.required = { ...module.required, def: true }
        }
        if(Array.isArray(module?.subModules)){
            module.subModules = optionalsOn(module.subModules)
        }
        return module
    })
}

function composePruebasServer(distribution, layer){
    if(layer == null || typeof layer !== 'object') return null

    let server
    if(layer.base == null){
        if(layer.server == null || typeof layer.server !== 'object') return null
        server = clone(layer.server)
    } else {
        const base = (distribution?.servers || []).find(s => s?.id === layer.base)
        if(base == null) return null
        server = clone(base)
        const replace = layer.replace != null && typeof layer.replace === 'object' ? layer.replace : {}
        const remove = new Set(Array.isArray(layer.remove) ? layer.remove : [])
        const add = Array.isArray(layer.add) ? layer.add : []
        server.modules = (server.modules || [])
            .filter(module => !remove.has(module?.id))
            .map(module => Object.prototype.hasOwnProperty.call(replace, module?.id) ? clone(replace[module.id]) : module)
            .concat(clone(add))
        for(const key of ['name', 'address', 'description']){
            if(typeof layer[key] === 'string') server[key] = layer[key]
        }
    }

    server.id = PRUEBAS_ID
    server.mainServer = false
    server.autoconnect = false
    delete server.pokeauroraProfiles
    delete server.pokeauroraNotice
    server.modules = optionalsOn(Array.isArray(server.modules) ? server.modules : [])
    return server
}

// result: {status:'staff', layer} | {status:'not-staff'} | {status:'error'}
function mergeStaffServer(distribution, result, cachedPruebas){
    const merged = clone(distribution)
    merged.servers = (merged.servers || []).filter(server => server?.id !== PRUEBAS_ID)

    let pruebas = null
    if(result?.status === 'staff'){
        pruebas = composePruebasServer(merged, result.layer) || cachedPruebas || null
    } else if(result?.status === 'error'){
        pruebas = cachedPruebas || null
    }

    if(pruebas != null){
        merged.servers.push({ ...clone(pruebas), id: PRUEBAS_ID, mainServer: false })
    }
    return merged
}

const MAX_LAYER_BYTES = 2 * 1024 * 1024

// GET con el http/https de Node. El launcher corre esto en el preload: así no depende de la CSP
// (connect-src) ni de CORS de la página, igual que la distribución, que baja con got.
function nodeFetch(url, { signal, headers = {} } = {}){
    return new Promise((resolve, reject) => {
        const parsed = new URL(url)
        const transport = parsed.protocol === 'http:' ? require('http') : require('https')
        const req = transport.get(parsed, { headers, signal }, res => {
            const chunks = []
            let size = 0
            res.on('data', chunk => {
                size += chunk.length
                if(size > MAX_LAYER_BYTES){
                    req.destroy(new Error('Respuesta demasiado grande.'))
                    return
                }
                chunks.push(chunk)
            })
            res.on('end', () => {
                const text = Buffer.concat(chunks).toString('utf8')
                resolve({ status: res.statusCode, json: async () => JSON.parse(text) })
            })
            res.on('error', reject)
        })
        req.on('error', reject)
    })
}

async function fetchPruebasLayer(nick, { fetchImpl = nodeFetch, timeoutMs = DEFAULT_TIMEOUT_MS, baseUrl = STAFF_API } = {}){
    const normalized = normalizeNick(nick)
    if(normalized.length === 0) return { status: 'not-staff' }

    const url = `${String(baseUrl).replace(/\/+$/, '')}/api/pruebas/layer?nick=${encodeURIComponent(normalized)}`
    const controller = new globalThis.AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    try {
        const res = await fetchImpl(url, { signal: controller.signal, headers: { Accept: 'application/json' }, cache: 'no-store' })
        if(res.status === 404) return { status: 'not-staff' }
        if(res.status !== 200) return { status: 'error' }
        const layer = await res.json()
        if(layer == null || typeof layer !== 'object') return { status: 'error' }
        return { status: 'staff', layer }
    } catch {
        return { status: 'error' }
    } finally {
        clearTimeout(timer)
    }
}

// Agrega (o quita) el servidor de pruebas sobre la distribución pública ya validada.
// Si el resultado no pasa el sanitizador, se queda la distribución pública: el servidor normal abre siempre.
async function applyStaffAccess(distribution, { nick, cachedPruebas = null, fetchImpl, timeoutMs, baseUrl, sanitize, logger } = {}){
    const result = await fetchPruebasLayer(nick, { fetchImpl, timeoutMs, baseUrl })
    const merged = mergeStaffServer(distribution, result, cachedPruebas)
    try {
        return sanitize(merged)
    } catch(error) {
        logger?.warn(`Se descartó el servidor de pruebas: ${error.message}`)
        return mergeStaffServer(distribution, { status: 'not-staff' }, null)
    }
}

module.exports = {
    PRUEBAS_ID,
    applyStaffAccess,
    STAFF_API,
    fetchPruebasLayer,
    nodeFetch,
    normalizeNick,
    composePruebasServer,
    mergeStaffServer
}
