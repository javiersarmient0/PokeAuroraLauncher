const test = require('node:test')
const assert = require('node:assert/strict')
const path = require('path')
const { pathToFileURL } = require('url')

const load = () => import(pathToFileURL(path.join(__dirname, '..', 'staff-worker', 'src', 'logic.mjs')).href)

const MD5 = 'a'.repeat(32)
function validLayer(extra = {}){
    return {
        id: 'pokeaurora-pruebas',
        name: 'Pruebas',
        address: 'pruebas.pokeaurora.com',
        base: 'PokeAurora-1.21.1',
        replace: {
            'generated.fabricmod:pokeaurora:1.0.0@jar': { id: 'generated.fabricmod:pokeaurora:1.0.0-pruebas.1@jar', type: 'FabricMod', artifact: { size: 1, MD5, url: 'https://pub-16d8232ded904a1bbed89826fb24c57e.r2.dev/servers/PokeAurora-pruebas/p.jar' } }
        },
        add: [],
        remove: [],
        ...extra
    }
}

test('isValidNick accepts minecraft nicks only', async () => {
    const { isValidNick } = await load()
    assert.equal(isValidNick('Rey112'), true)
    assert.equal(isValidNick('a_b'), true)
    assert.equal(isValidNick('ab'), false)
    assert.equal(isValidNick('x'.repeat(17)), false)
    assert.equal(isValidNick('con espacio'), false)
    assert.equal(isValidNick('<script>'), false)
    assert.equal(isValidNick(null), false)
})

test('normalizeNick trims and lowercases', async () => {
    const { normalizeNick } = await load()
    assert.equal(normalizeNick('  Rey112 '), 'rey112')
})

test('addNick keeps original form and does not duplicate', async () => {
    const { addNick, hasNick } = await load()
    let list = addNick([], ' Rey112 ', 'dueño', 1000)
    assert.deepEqual(list, [{ nick: 'Rey112', agregado: 1000, nota: 'dueño' }])
    list = addNick(list, 'REY112', 'otra', 2000)
    assert.equal(list.length, 1)
    assert.equal(hasNick(list, 'rey112'), true)
    assert.equal(hasNick(list, ' rEy112'), true)
    assert.equal(hasNick(list, 'otro'), false)
})

test('addNick rejects invalid nicks and trims long notes', async () => {
    const { addNick } = await load()
    assert.throws(() => addNick([], 'no válido', '', 1))
    const list = addNick([], 'Pepe', 'x'.repeat(500), 1)
    assert.equal(list[0].nota.length, 120)
})

test('removeNick ignores case', async () => {
    const { addNick, removeNick } = await load()
    const list = addNick(addNick([], 'Rey112', '', 1), 'Pepe', '', 2)
    assert.deepEqual(removeNick(list, 'REY112').map(e => e.nick), ['Pepe'])
    assert.equal(removeNick(list, 'nadie').length, 2)
})

test('hashPassword and verifyPassword round trip', async () => {
    const { hashPassword, verifyPassword } = await load()
    const stored = await hashPassword('clave-maestra-larga', 'c2FsdHNhbHRzYWx0', 1000)
    assert.match(stored, /^pbkdf2\$1000\$c2FsdHNhbHRzYWx0\$[A-Za-z0-9+/=]+$/)
    assert.equal(await verifyPassword('clave-maestra-larga', stored), true)
    assert.equal(await verifyPassword('clave-mala', stored), false)
    assert.equal(await verifyPassword('clave-maestra-larga', 'basura'), false)
    assert.equal(await verifyPassword('', stored), false)
})

test('hashPassword defaults to 100000 iterations (Workers limit)', async () => {
    const { hashPassword } = await load()
    const stored = await hashPassword('x', 'c2FsdA==')
    assert.ok(stored.startsWith('pbkdf2$100000$'))
})

test('sessions are signed and expire', async () => {
    const { signSession, verifySession, SESSION_MS } = await load()
    assert.equal(SESSION_MS, 12 * 60 * 60 * 1000)
    const now = 1_000_000
    const token = await signSession('secreto', now + SESSION_MS)
    assert.equal(await verifySession('secreto', token, now), true)
    assert.equal(await verifySession('secreto', token, now + SESSION_MS + 1), false)
    assert.equal(await verifySession('otro', token, now), false)
    const [exp, sig] = token.split('.')
    assert.equal(await verifySession('secreto', `${Number(exp) + 1000}.${sig}`, now), false)
    assert.equal(await verifySession('secreto', '', now), false)
    assert.equal(await verifySession('secreto', null, now), false)
})

test('validateLayer accepts a good layer', async () => {
    const { validateLayer } = await load()
    assert.deepEqual(validateLayer(validLayer()), { ok: true, error: null })
})

test('validateLayer rejects bad layers', async () => {
    const { validateLayer } = await load()
    const cases = [
        null,
        validLayer({ id: 'otro' }),
        validLayer({ base: 5 }),
        validLayer({ replace: [] }),
        validLayer({ add: {} }),
        validLayer({ remove: 'x' }),
        validLayer({ add: [{ id: 'a:b:1@jar', type: 'FabricMod', artifact: { size: 1, MD5, url: 'http://inseguro.com/a.jar' } }] }),
        validLayer({ replace: { 'x': { id: 'x', type: 'FabricMod', artifact: { size: 1, MD5 } } } })
    ]
    for(const layer of cases){
        const result = validateLayer(layer)
        assert.equal(result.ok, false, JSON.stringify(layer)?.slice(0, 80))
        assert.equal(typeof result.error, 'string')
    }
})

// ---------------------------------------------------------------- HTTP (Tarea 6)

const loadIndex = () => import(pathToFileURL(path.join(__dirname, '..', 'staff-worker', 'src', 'index.mjs')).href)
const HOST = 'https://staff.pokeaurora.com'

function memoryKV(){
    const store = new Map()
    return {
        store,
        async get(key, opts){
            const raw = store.has(key) ? store.get(key) : null
            if(raw == null) return null
            return opts === 'json' || opts?.type === 'json' ? JSON.parse(raw) : raw
        },
        async put(key, value){ store.set(key, typeof value === 'string' ? value : JSON.stringify(value)) },
        async delete(key){ store.delete(key) }
    }
}

async function makeEnv(){
    const { hashPassword } = await load()
    return {
        STAFF: memoryKV(),
        ADMIN_PASSWORD_HASH: await hashPassword('clave-maestra-larga', 'c2FsdHNhbHRzYWx0', 1000),
        SESSION_SECRET: 'secreto-de-sesion'
    }
}

function req(method, pathname, { body, cookie, origin = HOST, ip = '1.2.3.4' } = {}){
    const headers = { 'CF-Connecting-IP': ip }
    if(cookie) headers.Cookie = cookie
    if(origin) headers.Origin = origin
    if(body !== undefined) headers['Content-Type'] = 'application/json'
    return new globalThis.Request(HOST + pathname, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) })
}

async function login(handle, env){
    const res = await handle(req('POST', '/login', { body: { password: 'clave-maestra-larga' } }), env)
    assert.equal(res.status, 200)
    const setCookie = res.headers.get('Set-Cookie')
    assert.match(setCookie, /HttpOnly/)
    assert.match(setCookie, /Secure/)
    assert.match(setCookie, /SameSite=Strict/)
    return setCookie.split(';')[0]
}

test('worker: layer is 404 for a nick outside the list', async () => {
    const { handle } = await loadIndex()
    const env = await makeEnv()
    const res = await handle(req('GET', '/api/pruebas/layer?nick=Nadie'), env)
    assert.equal(res.status, 404)
})

test('worker: wrong password is 401 and admin needs a session', async () => {
    const { handle } = await loadIndex()
    const env = await makeEnv()
    const bad = await handle(req('POST', '/login', { body: { password: 'mala' } }), env)
    assert.equal(bad.status, 401)
    assert.equal(bad.headers.get('Set-Cookie'), null)
    const list = await handle(req('GET', '/api/admin/list'), env)
    assert.equal(list.status, 401)
    const forged = await handle(req('GET', '/api/admin/list', { cookie: 'staff_session=9999999999999.abc' }), env)
    assert.equal(forged.status, 401)
})

test('worker: add, layer, lookup and remove', async () => {
    const { handle } = await loadIndex()
    const env = await makeEnv()
    const cookie = await login(handle, env)

    assert.equal((await handle(req('POST', '/api/admin/add', { cookie, body: { nick: 'Rey112', nota: 'dueño' } }), env)).status, 200)
    assert.equal((await handle(req('POST', '/api/admin/add', { cookie, body: { nick: 'no válido' } }), env)).status, 400)

    // En la lista pero sin capa cargada: 503 (el launcher conserva lo que tenía).
    assert.equal((await handle(req('GET', '/api/pruebas/layer?nick=rey112'), env)).status, 503)

    assert.equal((await handle(req('PUT', '/api/admin/layer', { cookie, body: { id: 'otro' } }), env)).status, 400)
    assert.equal((await handle(req('PUT', '/api/admin/layer', { cookie, body: validLayer() }), env)).status, 200)

    const ok = await handle(req('GET', '/api/pruebas/layer?nick=%20REY112%20'), env)
    assert.equal(ok.status, 200)
    assert.equal((await ok.json()).id, 'pokeaurora-pruebas')
    assert.match(ok.headers.get('Cache-Control'), /no-store/)

    const staff = await handle(req('GET', '/api/staff?nick=Rey112'), env)
    assert.deepEqual(await staff.json(), { staff: true })

    const list = await (await handle(req('GET', '/api/admin/list', { cookie }), env)).json()
    assert.deepEqual(list.list.map(e => e.nick), ['Rey112'])
    assert.equal(list.layer.id, 'pokeaurora-pruebas')

    assert.equal((await handle(req('POST', '/api/admin/remove', { cookie, body: { nick: 'rey112' } }), env)).status, 200)
    assert.equal((await handle(req('GET', '/api/pruebas/layer?nick=Rey112'), env)).status, 404)
    assert.deepEqual(await (await handle(req('GET', '/api/staff?nick=Rey112'), env)).json(), { staff: false })
})

test('worker: admin writes need the same origin', async () => {
    const { handle } = await loadIndex()
    const env = await makeEnv()
    const cookie = await login(handle, env)
    const cross = await handle(req('POST', '/api/admin/add', { cookie, origin: 'https://evil.example.com', body: { nick: 'Pepe' } }), env)
    assert.equal(cross.status, 403)
    const none = await handle(req('POST', '/api/admin/add', { cookie, origin: null, body: { nick: 'Pepe' } }), env)
    assert.equal(none.status, 403)
    const badLogin = await handle(req('POST', '/login', { origin: 'https://evil.example.com', body: { password: 'clave-maestra-larga' } }), env)
    assert.equal(badLogin.status, 403)
})

test('worker: login is rate limited after 10 failures per ip', async () => {
    const { handle } = await loadIndex()
    const env = await makeEnv()
    for(let i = 0; i < 10; i++){
        assert.equal((await handle(req('POST', '/login', { body: { password: 'mala' }, ip: '9.9.9.9' }), env)).status, 401)
    }
    const blocked = await handle(req('POST', '/login', { body: { password: 'clave-maestra-larga' }, ip: '9.9.9.9' }), env)
    assert.equal(blocked.status, 429)
    const other = await handle(req('POST', '/login', { body: { password: 'clave-maestra-larga' }, ip: '8.8.8.8' }), env)
    assert.equal(other.status, 200)
})

test('worker: logout clears the cookie and panel is served', async () => {
    const { handle } = await loadIndex()
    const env = await makeEnv()
    const cookie = await login(handle, env)
    const out = await handle(req('POST', '/logout', { cookie }), env)
    assert.equal(out.status, 200)
    assert.match(out.headers.get('Set-Cookie'), /Max-Age=0/)
    const panel = await handle(req('GET', '/'), env)
    assert.equal(panel.status, 200)
    assert.match(panel.headers.get('Content-Type'), /text\/html/)
    assert.match(panel.headers.get('Content-Security-Policy'), /default-src 'none'/)
    const html = await panel.text()
    assert.match(html, /PokeAurora/)
    assert.doesNotMatch(html, /clave-maestra-larga/)
})

test('worker: unknown route is 404 and missing secrets fail closed', async () => {
    const { handle } = await loadIndex()
    const env = await makeEnv()
    assert.equal((await handle(req('GET', '/nada'), env)).status, 404)
    const noSecrets = { STAFF: memoryKV() }
    assert.equal((await handle(req('POST', '/login', { body: { password: 'x' } }), noSecrets)).status, 500)
})

test('verifyPassword rejects hashes over the Workers PBKDF2 limit', async () => {
    const { hashPassword, verifyPassword } = await load()
    const stored = await hashPassword('clave-maestra-larga', 'c2FsdA==', 100001)
    assert.equal(await verifyPassword('clave-maestra-larga', stored), false)
})
