// Worker de staff.pokeaurora.com: lista de staff del servidor de pruebas y capa del modpack de pruebas.
// KV (binding STAFF): "staff:list" = [{ nick, agregado, nota }], "pruebas:layer" = capa,
// "login-fail:<ip>" = { count, since } para frenar fuerza bruta.
// Secretos: ADMIN_PASSWORD_HASH (pbkdf2$iter$salt$hash) y SESSION_SECRET. Nunca en el repo.

import {
    SESSION_MS,
    addNick,
    hasNick,
    removeNick,
    signSession,
    validateLayer,
    verifyPassword,
    verifySession
} from './logic.mjs'
import { renderPanel } from './panel.html.mjs'

const LIST_KEY = 'staff:list'
const LAYER_KEY = 'pruebas:layer'
const COOKIE = 'staff_session'
const MAX_FAILS = 10
const FAIL_WINDOW_MS = 15 * 60 * 1000
const MAX_BODY = 256 * 1024

function json(data, status = 200, headers = {}){
    return new Response(JSON.stringify(data), {
        status,
        headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers }
    })
}

function readCookie(request, name){
    const header = request.headers.get('Cookie') || ''
    for(const part of header.split(';')){
        const [key, ...rest] = part.trim().split('=')
        if(key === name) return rest.join('=')
    }
    return null
}

function sameOrigin(request, url){
    return request.headers.get('Origin') === url.origin
}

function secretsReady(env){
    return typeof env.ADMIN_PASSWORD_HASH === 'string' && env.ADMIN_PASSWORD_HASH.length > 0
        && typeof env.SESSION_SECRET === 'string' && env.SESSION_SECRET.length > 0
}

async function readBody(request){
    const text = await request.text()
    if(text.length > MAX_BODY) throw new Error('El cuerpo es demasiado grande.')
    return text.length === 0 ? {} : JSON.parse(text)
}

async function getList(env){
    return (await env.STAFF.get(LIST_KEY, { type: 'json' })) || []
}

async function isAdmin(request, env, now){
    return secretsReady(env) && verifySession(env.SESSION_SECRET, readCookie(request, COOKIE), now)
}

async function handleLogin(request, env, url, now){
    if(!sameOrigin(request, url)) return json({ error: 'Origen no permitido.' }, 403)
    if(!secretsReady(env)) return json({ error: 'El Worker no tiene configurados sus secretos.' }, 500)

    const ip = request.headers.get('CF-Connecting-IP') || 'desconocida'
    const failKey = `login-fail:${ip}`
    const fails = await env.STAFF.get(failKey, { type: 'json' })
    const recent = fails != null && now - fails.since < FAIL_WINDOW_MS
    if(recent && fails.count >= MAX_FAILS){
        return json({ error: 'Demasiados intentos. Espera unos minutos.' }, 429)
    }

    let body
    try {
        body = await readBody(request)
    } catch {
        return json({ error: 'Pedido inválido.' }, 400)
    }

    if(!await verifyPassword(String(body.password ?? ''), env.ADMIN_PASSWORD_HASH)){
        const next = recent ? { count: fails.count + 1, since: fails.since } : { count: 1, since: now }
        await env.STAFF.put(failKey, JSON.stringify(next), { expirationTtl: FAIL_WINDOW_MS / 1000 })
        return json({ error: 'Clave incorrecta.' }, 401)
    }

    await env.STAFF.delete(failKey)
    const token = await signSession(env.SESSION_SECRET, now + SESSION_MS)
    return json({ ok: true }, 200, {
        'Set-Cookie': `${COOKIE}=${token}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=${SESSION_MS / 1000}`
    })
}

async function handleAdmin(request, env, url, now){
    if(!secretsReady(env)) return json({ error: 'El Worker no tiene configurados sus secretos.' }, 500)
    if(!await isAdmin(request, env, now)) return json({ error: 'Inicia sesión.' }, 401)

    if(request.method === 'GET' && url.pathname === '/api/admin/list'){
        return json({ list: await getList(env), layer: await env.STAFF.get(LAYER_KEY, { type: 'json' }) })
    }

    if(request.method !== 'POST' && request.method !== 'PUT') return json({ error: 'Método no permitido.' }, 405)
    if(!sameOrigin(request, url)) return json({ error: 'Origen no permitido.' }, 403)

    let body
    try {
        body = await readBody(request)
    } catch {
        return json({ error: 'El cuerpo no es JSON válido.' }, 400)
    }

    if(request.method === 'POST' && url.pathname === '/api/admin/add'){
        try {
            const list = addNick(await getList(env), body.nick, body.nota, now)
            await env.STAFF.put(LIST_KEY, JSON.stringify(list))
            return json({ ok: true, list })
        } catch(error) {
            return json({ error: error.message }, 400)
        }
    }

    if(request.method === 'POST' && url.pathname === '/api/admin/remove'){
        const list = removeNick(await getList(env), body.nick)
        await env.STAFF.put(LIST_KEY, JSON.stringify(list))
        return json({ ok: true, list })
    }

    if(request.method === 'PUT' && url.pathname === '/api/admin/layer'){
        const result = validateLayer(body)
        if(!result.ok) return json({ error: result.error }, 400)
        await env.STAFF.put(LAYER_KEY, JSON.stringify(body))
        return json({ ok: true })
    }

    return json({ error: 'No encontrado.' }, 404)
}

export async function handle(request, env, now = Date.now()){
    const url = new URL(request.url)
    const { pathname } = url

    if(request.method === 'GET' && pathname === '/api/pruebas/layer'){
        if(!hasNick(await getList(env), url.searchParams.get('nick'))) return json({ error: 'No está en la lista.' }, 404)
        const layer = await env.STAFF.get(LAYER_KEY, { type: 'json' })
        if(layer == null) return json({ error: 'Todavía no hay capa de pruebas cargada.' }, 503)
        return json(layer)
    }

    if(request.method === 'GET' && pathname === '/api/staff'){
        return json({ staff: hasNick(await getList(env), url.searchParams.get('nick')) })
    }

    if(request.method === 'GET' && (pathname === '/' || pathname === '/index.html')){
        const nonce = crypto.randomUUID().replace(/-/g, '')
        return new Response(renderPanel(nonce), {
            headers: {
                'Content-Type': 'text/html; charset=utf-8',
                'Cache-Control': 'no-store',
                'Content-Security-Policy': `default-src 'none'; script-src 'nonce-${nonce}'; style-src 'nonce-${nonce}'; connect-src 'self'; img-src 'self' data:; form-action 'self'; frame-ancestors 'none'; base-uri 'none'`,
                'X-Content-Type-Options': 'nosniff',
                'Referrer-Policy': 'no-referrer'
            }
        })
    }

    if(request.method === 'POST' && pathname === '/login') return handleLogin(request, env, url, now)

    if(request.method === 'POST' && pathname === '/logout'){
        if(!sameOrigin(request, url)) return json({ error: 'Origen no permitido.' }, 403)
        return json({ ok: true }, 200, { 'Set-Cookie': `${COOKIE}=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0` })
    }

    if(pathname.startsWith('/api/admin/')) return handleAdmin(request, env, url, now)

    return json({ error: 'No encontrado.' }, 404)
}

export default {
    async fetch(request, env){
        try {
            return await handle(request, env)
        } catch(error) {
            console.error(error)
            return json({ error: 'Error interno.' }, 500)
        }
    }
}
