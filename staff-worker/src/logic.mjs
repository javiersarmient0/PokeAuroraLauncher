// Lógica pura del Worker de staff.pokeaurora.com (sin I/O): lista de nicks, clave maestra,
// sesiones y validación de la capa de pruebas. Usa WebCrypto, disponible en Workers y en Node 22.

export const PRUEBAS_ID = 'pokeaurora-pruebas'
export const SESSION_MS = 12 * 60 * 60 * 1000
// Cloudflare Workers no acepta PBKDF2 con más de 100.000 iteraciones (Node sí): no subir este número.
export const MAX_ITERATIONS = 100000
export const DEFAULT_ITERATIONS = MAX_ITERATIONS

const NICK_RE = /^[A-Za-z0-9_]{3,16}$/
const NOTE_MAX = 120
const encoder = new TextEncoder()

export function normalizeNick(nick){
    return typeof nick === 'string' ? nick.trim().toLowerCase() : ''
}

export function isValidNick(nick){
    return typeof nick === 'string' && NICK_RE.test(nick.trim())
}

export function hasNick(list, nick){
    const key = normalizeNick(nick)
    return key.length > 0 && Array.isArray(list) && list.some(entry => normalizeNick(entry?.nick) === key)
}

export function addNick(list, nick, nota, now){
    if(!isValidNick(nick)){
        throw new Error('Nick inválido: usa de 3 a 16 letras, números o guion bajo.')
    }
    const current = Array.isArray(list) ? list : []
    if(hasNick(current, nick)) return current
    return [...current, { nick: nick.trim(), agregado: now, nota: String(nota ?? '').trim().slice(0, NOTE_MAX) }]
}

export function removeNick(list, nick){
    const key = normalizeNick(nick)
    return (Array.isArray(list) ? list : []).filter(entry => normalizeNick(entry?.nick) !== key)
}

function toB64(bytes){
    let binary = ''
    for(const byte of new Uint8Array(bytes)) binary += String.fromCharCode(byte)
    return btoa(binary)
}

function fromB64(text){
    const binary = atob(text)
    const bytes = new Uint8Array(binary.length)
    for(let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
    return bytes
}

function toB64Url(bytes){
    return toB64(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

// Comparación de tiempo constante (para strings de igual largo; el largo no es secreto).
export function timingSafeEqual(a, b){
    if(typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false
    let diff = 0
    for(let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
    return diff === 0
}

async function pbkdf2(password, salt, iterations){
    const key = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits'])
    const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, key, 256)
    return toB64(bits)
}

export async function hashPassword(password, saltB64, iterations = DEFAULT_ITERATIONS){
    const hash = await pbkdf2(password, fromB64(saltB64), iterations)
    return `pbkdf2$${iterations}$${saltB64}$${hash}`
}

export async function verifyPassword(password, stored){
    if(typeof password !== 'string' || password.length === 0 || typeof stored !== 'string') return false
    const parts = stored.split('$')
    if(parts.length !== 4 || parts[0] !== 'pbkdf2') return false
    const iterations = Number(parts[1])
    if(!Number.isSafeInteger(iterations) || iterations < 1000 || iterations > MAX_ITERATIONS) return false
    try {
        const hash = await pbkdf2(password, fromB64(parts[2]), iterations)
        return timingSafeEqual(hash, parts[3])
    } catch {
        return false
    }
}

async function hmac(secret, message){
    const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
    return toB64Url(await crypto.subtle.sign('HMAC', key, encoder.encode(message)))
}

export async function signSession(secret, expiresAt){
    const exp = String(Math.floor(expiresAt))
    return `${exp}.${await hmac(secret, `session:${exp}`)}`
}

export async function verifySession(secret, token, now){
    if(typeof secret !== 'string' || secret.length === 0 || typeof token !== 'string') return false
    const [exp, sig, extra] = token.split('.')
    if(extra !== undefined || !/^\d{1,16}$/.test(exp ?? '') || typeof sig !== 'string') return false
    if(Number(exp) < now || Number(exp) > now + SESSION_MS) return false
    return timingSafeEqual(await hmac(secret, `session:${exp}`), sig)
}

function isObject(value){
    return value != null && typeof value === 'object' && !Array.isArray(value)
}

function moduleError(module, where){
    if(!isObject(module)) return `${where}: el módulo no es un objeto`
    if(typeof module.id !== 'string' || module.id.length === 0) return `${where}: falta el id del módulo`
    if(typeof module.type !== 'string') return `${where}: falta el tipo del módulo ${module.id}`
    const artifact = module.artifact
    if(!isObject(artifact)) return `${where}: falta el artifact de ${module.id}`
    if(!Number.isSafeInteger(artifact.size) || artifact.size < 0) return `${where}: tamaño inválido en ${module.id}`
    if(typeof artifact.MD5 !== 'string' || !/^[a-f0-9]{32}$/i.test(artifact.MD5)) return `${where}: MD5 inválido en ${module.id}`
    try {
        if(new URL(artifact.url).protocol !== 'https:') return `${where}: la URL de ${module.id} no es https`
    } catch {
        return `${where}: URL inválida en ${module.id}`
    }
    return null
}

// Valida la forma de la capa. El launcher la vuelve a validar (hosts permitidos) con su sanitizador.
export function validateLayer(layer){
    const fail = error => ({ ok: false, error })
    if(!isObject(layer)) return fail('La capa tiene que ser un objeto JSON.')
    if(layer.id !== PRUEBAS_ID) return fail(`El id tiene que ser "${PRUEBAS_ID}".`)
    if(typeof layer.base !== 'string' || layer.base.length === 0) return fail('Falta "base" (id del servidor principal).')
    if(!isObject(layer.replace)) return fail('"replace" tiene que ser un objeto { idViejo: módulo }.')
    if(!Array.isArray(layer.add)) return fail('"add" tiene que ser una lista de módulos.')
    if(!Array.isArray(layer.remove) || !layer.remove.every(id => typeof id === 'string')) return fail('"remove" tiene que ser una lista de ids.')
    for(const [id, module] of Object.entries(layer.replace)){
        const error = moduleError(module, `replace["${id}"]`)
        if(error) return fail(error)
    }
    for(const [i, module] of layer.add.entries()){
        const error = moduleError(module, `add[${i}]`)
        if(error) return fail(error)
    }
    for(const key of ['name', 'address', 'description']){
        if(layer[key] != null && typeof layer[key] !== 'string') return fail(`"${key}" tiene que ser texto.`)
    }
    return { ok: true, error: null }
}
