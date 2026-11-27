const test = require('node:test')
const assert = require('node:assert/strict')

const {
    PRUEBAS_ID,
    normalizeNick,
    composePruebasServer,
    mergeStaffServer
} = require('../app/assets/js/staffaccess')

const R2 = 'https://pub-16d8232ded904a1bbed89826fb24c57e.r2.dev/servers'
const MD5 = 'a'.repeat(32)

function mod(id, extra = {}){
    return { id, name: id, type: 'FabricMod', artifact: { size: 1, MD5, url: `${R2}/PokeAurora-1.21.1/${id.replace(/[^\w.-]/g, '_')}.jar` }, ...extra }
}

function distribution(){
    return {
        version: '1.0.0',
        servers: [{
            id: 'PokeAurora-1.21.1',
            name: 'PokeAurora (Minecraft 1.21.1)',
            description: 'Minecraft 1.21.1 · Fabric',
            address: 'mc.pokeaurora.com:25568',
            minecraftVersion: '1.21.1',
            mainServer: true,
            pokeauroraProfiles: { default: 'normal', profiles: {} },
            pokeauroraNotice: { title: 'Aviso', body: 'Algo', url: null, until: null },
            modules: [
                mod('net.fabricmc:fabric-loader:0.16.0', { type: 'Fabric' }),
                mod('generated.fabricmod:pokeaurora:1.0.0@jar'),
                mod('generated.fabricmod:iris:1.8.0@jar', { required: { value: false, def: false } }),
                mod('com.goby56:wakes:1.0@jar', { required: { value: false } }),
                mod('generated.fabricmod:viejo:1.0@jar')
            ]
        }]
    }
}

function layer(extra = {}){
    return {
        id: PRUEBAS_ID,
        name: 'Pruebas',
        address: 'pruebas.pokeaurora.com',
        description: 'Servidor de pruebas',
        base: 'PokeAurora-1.21.1',
        replace: {
            'generated.fabricmod:pokeaurora:1.0.0@jar': mod('generated.fabricmod:pokeaurora:1.0.0-pruebas.20261121@jar')
        },
        add: [],
        remove: [],
        ...extra
    }
}

test('composes from base and replaces client jar', () => {
    const server = composePruebasServer(distribution(), layer())
    assert.equal(server.id, PRUEBAS_ID)
    assert.equal(server.name, 'Pruebas')
    assert.equal(server.address, 'pruebas.pokeaurora.com')
    assert.equal(server.mainServer, false)
    assert.equal(server.minecraftVersion, '1.21.1')
    assert.equal(server.pokeauroraProfiles, undefined)
    assert.equal(server.pokeauroraNotice, undefined)
    const ids = server.modules.map(m => m.id)
    assert.ok(ids.includes('generated.fabricmod:pokeaurora:1.0.0-pruebas.20261121@jar'))
    assert.ok(!ids.includes('generated.fabricmod:pokeaurora:1.0.0@jar'))
    assert.equal(ids.indexOf('generated.fabricmod:pokeaurora:1.0.0-pruebas.20261121@jar'), 1, 'mantiene la posición del módulo reemplazado')
})

test('compose does not mutate the public distribution', () => {
    const dist = distribution()
    const before = JSON.stringify(dist)
    const server = composePruebasServer(dist, layer())
    server.modules[2].required.def = true
    assert.equal(JSON.stringify(dist), before)
})

test('remove and add by id', () => {
    const server = composePruebasServer(distribution(), layer({
        remove: ['generated.fabricmod:viejo:1.0@jar'],
        add: [mod('generated.fabricmod:nuevo:2.0@jar')]
    }))
    const ids = server.modules.map(m => m.id)
    assert.ok(!ids.includes('generated.fabricmod:viejo:1.0@jar'))
    assert.equal(ids.at(-1), 'generated.fabricmod:nuevo:2.0@jar')
})

test('optional mods default on', () => {
    const server = composePruebasServer(distribution(), layer())
    const iris = server.modules.find(m => m.id.startsWith('generated.fabricmod:iris'))
    const wakes = server.modules.find(m => m.id.startsWith('com.goby56:wakes'))
    assert.deepEqual(iris.required, { value: false, def: true })
    assert.deepEqual(wakes.required, { value: false, def: true })
    const loader = server.modules.find(m => m.type === 'Fabric')
    assert.equal(loader.required, undefined)
})

test('no base returns null', () => {
    assert.equal(composePruebasServer(distribution(), layer({ base: 'NoExiste' })), null)
    assert.equal(composePruebasServer(distribution(), null), null)
})

test('layer without base uses server as is', () => {
    const full = { ...distribution().servers[0], id: PRUEBAS_ID, name: 'Pruebas', address: 'pruebas.pokeaurora.com' }
    const server = composePruebasServer(distribution(), { id: PRUEBAS_ID, server: full })
    assert.equal(server.id, PRUEBAS_ID)
    assert.equal(server.mainServer, false)
    assert.equal(server.modules.length, full.modules.length)
})

test('merge staff adds once', () => {
    const dist = distribution()
    const once = mergeStaffServer(dist, { status: 'staff', layer: layer() }, null)
    const twice = mergeStaffServer(once, { status: 'staff', layer: layer() }, null)
    assert.equal(twice.servers.filter(s => s.id === PRUEBAS_ID).length, 1)
    assert.equal(twice.servers[0].id, 'PokeAurora-1.21.1')
    assert.equal(dist.servers.length, 1, 'no muta la distribución original')
})

test('merge not-staff drops pruebas', () => {
    const withPruebas = mergeStaffServer(distribution(), { status: 'staff', layer: layer() }, null)
    const cached = withPruebas.servers[1]
    const result = mergeStaffServer(withPruebas, { status: 'not-staff' }, cached)
    assert.deepEqual(result.servers.map(s => s.id), ['PokeAurora-1.21.1'])
})

test('merge error keeps cached', () => {
    const cached = composePruebasServer(distribution(), layer())
    const result = mergeStaffServer(distribution(), { status: 'error' }, cached)
    assert.deepEqual(result.servers.map(s => s.id), ['PokeAurora-1.21.1', PRUEBAS_ID])
    const none = mergeStaffServer(distribution(), { status: 'error' }, null)
    assert.deepEqual(none.servers.map(s => s.id), ['PokeAurora-1.21.1'])
})

test('merge staff with broken layer keeps cached', () => {
    const cached = composePruebasServer(distribution(), layer())
    const result = mergeStaffServer(distribution(), { status: 'staff', layer: layer({ base: 'NoExiste' }) }, cached)
    assert.deepEqual(result.servers.map(s => s.id), ['PokeAurora-1.21.1', PRUEBAS_ID])
})

test('normalizeNick trims and lowercases', () => {
    assert.equal(normalizeNick('  Rey112 '), 'rey112')
    assert.equal(normalizeNick(null), '')
    assert.equal(normalizeNick(undefined), '')
})

const { fetchPruebasLayer, STAFF_API } = require('../app/assets/js/staffaccess')

function fakeFetch(handler){
    const calls = []
    const impl = async (url, opts) => {
        calls.push(url)
        return handler(url, opts)
    }
    impl.calls = calls
    return impl
}

function response(status, body){
    return {
        ok: status >= 200 && status < 300,
        status,
        json: async () => {
            if(typeof body === 'string') throw new SyntaxError('bad json')
            return body
        }
    }
}

test('STAFF_API defaults to staff.pokeaurora.com', () => {
    assert.equal(STAFF_API, 'https://staff.pokeaurora.com')
})

test('fetch 200 returns staff with layer', async () => {
    const f = fakeFetch(() => response(200, layer()))
    const result = await fetchPruebasLayer('Rey112', { fetchImpl: f, baseUrl: 'https://x.test' })
    assert.equal(result.status, 'staff')
    assert.equal(result.layer.id, PRUEBAS_ID)
    assert.equal(f.calls[0], 'https://x.test/api/pruebas/layer?nick=rey112')
})

test('fetch 404 returns not-staff', async () => {
    const result = await fetchPruebasLayer('Nadie', { fetchImpl: fakeFetch(() => response(404, {})) })
    assert.deepEqual(result, { status: 'not-staff' })
})

test('fetch 500 returns error', async () => {
    const result = await fetchPruebasLayer('Rey112', { fetchImpl: fakeFetch(() => response(500, {})) })
    assert.deepEqual(result, { status: 'error' })
})

test('fetch invalid json returns error', async () => {
    const result = await fetchPruebasLayer('Rey112', { fetchImpl: fakeFetch(() => response(200, 'nope')) })
    assert.deepEqual(result, { status: 'error' })
})

test('fetch network failure returns error', async () => {
    const result = await fetchPruebasLayer('Rey112', { fetchImpl: async () => { throw new TypeError('fetch failed') } })
    assert.deepEqual(result, { status: 'error' })
})

test('fetch hang aborts after timeout', async () => {
    const hang = (url, opts) => new Promise((resolve, reject) => {
        opts.signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })))
    })
    const started = Date.now()
    const result = await fetchPruebasLayer('Rey112', { fetchImpl: hang, timeoutMs: 50 })
    assert.deepEqual(result, { status: 'error' })
    assert.ok(Date.now() - started < 1000)
})

test('empty nick returns not-staff without fetching', async () => {
    const f = fakeFetch(() => response(200, layer()))
    assert.deepEqual(await fetchPruebasLayer('   ', { fetchImpl: f }), { status: 'not-staff' })
    assert.deepEqual(await fetchPruebasLayer(null, { fetchImpl: f }), { status: 'not-staff' })
    assert.equal(f.calls.length, 0)
})

test('nick is normalized and encoded in the url', async () => {
    const f = fakeFetch(() => response(404, {}))
    await fetchPruebasLayer('  Rey 112 ', { fetchImpl: f, baseUrl: 'https://x.test/' })
    assert.equal(f.calls[0], 'https://x.test/api/pruebas/layer?nick=rey%20112')
})

const { applyStaffAccess } = require('../app/assets/js/staffaccess')
const { sanitizeDistribution } = require('../app/assets/js/distributionsanitizer')

test('applyStaffAccess adds pruebas for a staff nick', async () => {
    const f = fakeFetch(() => response(200, layer()))
    const result = await applyStaffAccess(distribution(), { nick: 'REY112', cachedPruebas: null, fetchImpl: f, sanitize: sanitizeDistribution })
    assert.deepEqual(result.servers.map(s => s.id), ['PokeAurora-1.21.1', PRUEBAS_ID])
    assert.ok(f.calls[0].endsWith('nick=rey112'))
})

test('applyStaffAccess keeps the public distribution when the merged one is unsafe', async () => {
    const bad = layer({ add: [{ id: 'x:y:1@jar', type: 'FabricMod', artifact: { size: 1, MD5, url: 'https://evil.example.com/x.jar' } }] })
    const warnings = []
    const dist = distribution()
    const result = await applyStaffAccess(dist, { nick: 'Rey112', fetchImpl: fakeFetch(() => response(200, bad)), sanitize: sanitizeDistribution, logger: { warn: m => warnings.push(m), info(){} } })
    assert.deepEqual(result.servers.map(s => s.id), ['PokeAurora-1.21.1'])
    assert.equal(warnings.length, 1)
})

test('applyStaffAccess without account drops pruebas', async () => {
    const withPruebas = mergeStaffServer(distribution(), { status: 'staff', layer: layer() }, null)
    const f = fakeFetch(() => response(200, layer()))
    const result = await applyStaffAccess(withPruebas, { nick: null, cachedPruebas: withPruebas.servers[1], fetchImpl: f, sanitize: x => x })
    assert.deepEqual(result.servers.map(s => s.id), ['PokeAurora-1.21.1'])
    assert.equal(f.calls.length, 0)
})

test('applyStaffAccess keeps cached pruebas when the worker is down', async () => {
    const cached = composePruebasServer(distribution(), layer())
    const result = await applyStaffAccess(distribution(), { nick: 'Rey112', cachedPruebas: cached, fetchImpl: async () => { throw new Error('down') }, sanitize: sanitizeDistribution })
    assert.deepEqual(result.servers.map(s => s.id), ['PokeAurora-1.21.1', PRUEBAS_ID])
})

// ---------------------------------------------------------------- transporte Node (CSP del launcher)

const http = require('http')
const { nodeFetch } = require('../app/assets/js/staffaccess')

function serve(handler){
    return new Promise(resolve => {
        const server = http.createServer(handler)
        server.listen(0, '127.0.0.1', () => resolve(server))
    })
}

test('nodeFetch reads status and json from a real http server', async () => {
    const server = await serve((req, res) => {
        if(req.url.startsWith('/api/pruebas/layer?nick=rey112')){
            res.writeHead(200, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ id: PRUEBAS_ID }))
        } else {
            res.writeHead(404)
            res.end('{}')
        }
    })
    const base = `http://127.0.0.1:${server.address().port}`
    try {
        const ok = await fetchPruebasLayer('Rey112', { fetchImpl: nodeFetch, baseUrl: base })
        assert.deepEqual(ok, { status: 'staff', layer: { id: PRUEBAS_ID } })
        const no = await fetchPruebasLayer('Otro', { fetchImpl: nodeFetch, baseUrl: base })
        assert.deepEqual(no, { status: 'not-staff' })
    } finally {
        server.close()
    }
})

test('nodeFetch aborts a hanging server', async () => {
    const server = await serve(() => {})
    const base = `http://127.0.0.1:${server.address().port}`
    try {
        const started = Date.now()
        const result = await fetchPruebasLayer('Rey112', { fetchImpl: nodeFetch, baseUrl: base, timeoutMs: 100 })
        assert.deepEqual(result, { status: 'error' })
        assert.ok(Date.now() - started < 2000)
    } finally {
        server.closeAllConnections()
        server.close()
    }
})

test('nodeFetch refuses huge responses', async () => {
    const server = await serve((req, res) => {
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end('"' + 'x'.repeat(3 * 1024 * 1024) + '"')
    })
    const base = `http://127.0.0.1:${server.address().port}`
    try {
        assert.deepEqual(await fetchPruebasLayer('Rey112', { fetchImpl: nodeFetch, baseUrl: base }), { status: 'error' })
    } finally {
        server.close()
    }
})

test('fetchPruebasLayer uses the node transport by default', async () => {
    const { fetchPruebasLayer: f } = require('../app/assets/js/staffaccess')
    const server = await serve((req, res) => { res.writeHead(404); res.end('{}') })
    const base = `http://127.0.0.1:${server.address().port}`
    const original = globalThis.fetch
    globalThis.fetch = async () => { throw new Error('no se tiene que usar el fetch del navegador') }
    try {
        assert.deepEqual(await f('Rey112', { baseUrl: base }), { status: 'not-staff' })
    } finally {
        globalThis.fetch = original
        server.close()
    }
})
