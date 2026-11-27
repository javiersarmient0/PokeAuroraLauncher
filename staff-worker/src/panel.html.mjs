// Panel de staff.pokeaurora.com. HTML como string; el script y el estilo llevan el nonce de la CSP.
// Todo el contenido dinámico se pone con textContent (nada de innerHTML con datos).

export function renderPanel(nonce){
    return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>Staff · PokeAurora</title>
<style nonce="${nonce}">
:root {
    --bg: #050817;
    --card: rgba(181, 207, 255, 0.05);
    --line: rgba(181, 207, 255, 0.16);
    --text: #e8eeff;
    --muted: #8e9ab8;
    --green: #83ffc9;
    --violet: #8f8bff;
    --orange: #ffa94d;
    --danger: #ff7a7a;
    --button: linear-gradient(110deg, #83ffc9 0%, #58ddff 42%, #8f8bff 74%, #b97bff 100%);
}
* { box-sizing: border-box; }
body {
    margin: 0;
    min-height: 100vh;
    background: radial-gradient(1200px 600px at 10% -10%, rgba(143, 139, 255, 0.18), transparent 60%),
        radial-gradient(900px 500px at 110% 10%, rgba(131, 255, 201, 0.12), transparent 60%), var(--bg);
    color: var(--text);
    font: 14px/1.5 system-ui, -apple-system, "Segoe UI", sans-serif;
}
main { max-width: 760px; margin: 0 auto; padding: 40px 16px 64px; }
h1 { margin: 0 0 4px; font-size: 26px; letter-spacing: -0.02em; }
h1 span { color: var(--orange); }
h2 { margin: 0 0 14px; font-size: 16px; }
p.sub { margin: 0 0 28px; color: var(--muted); }
section { margin-bottom: 20px; padding: 20px; border: 1px solid var(--line); border-radius: 14px; background: var(--card); }
label { display: block; margin-bottom: 6px; color: var(--muted); font-size: 12px; font-weight: 700; letter-spacing: 0.04em; }
input, textarea {
    width: 100%;
    padding: 10px 12px;
    border: 1px solid var(--line);
    border-radius: 10px;
    background: rgba(5, 8, 23, 0.6);
    color: var(--text);
    font: inherit;
}
textarea { min-height: 220px; font: 12px/1.45 ui-monospace, Consolas, monospace; resize: vertical; }
input:focus, textarea:focus { outline: 2px solid rgba(131, 255, 201, 0.5); outline-offset: 1px; }
button {
    padding: 10px 18px;
    border: 0;
    border-radius: 10px;
    background: var(--button);
    color: #050817;
    cursor: pointer;
    font: inherit;
    font-weight: 800;
}
button.ghost { border: 1px solid var(--line); background: transparent; color: var(--text); font-weight: 650; white-space: nowrap; }
button.danger { border: 1px solid rgba(255, 122, 122, 0.4); background: transparent; color: var(--danger); font-weight: 650; padding: 6px 12px; }
.row { display: flex; gap: 10px; align-items: flex-end; flex-wrap: wrap; }
.row > div { flex: 1 1 180px; }
.top { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; }
ul { margin: 0; padding: 0; list-style: none; }
li { display: flex; align-items: center; gap: 12px; padding: 10px 0; border-top: 1px solid var(--line); }
li:first-child { border-top: 0; }
li .nick { font-weight: 750; }
li .meta { flex: 1; color: var(--muted); font-size: 12px; }
.empty { color: var(--muted); }
.msg { min-height: 20px; margin-top: 10px; font-size: 13px; }
.msg.ok { color: var(--green); }
.msg.err { color: var(--danger); }
.mt { margin-top: 10px; }
[hidden] { display: none !important; }
</style>
</head>
<body>
<main>
    <div class="top">
        <div>
            <h1>PokeAurora <span>· Staff</span></h1>
            <p class="sub">Quién ve el servidor Pruebas en el launcher. La whitelist del servidor sigue siendo la que deja entrar.</p>
        </div>
        <button id="logout" class="ghost" hidden>Cerrar sesión</button>
    </div>

    <section id="loginBox" hidden>
        <h2>Iniciar sesión</h2>
        <form id="loginForm" class="row">
            <div>
                <label for="password">Clave maestra</label>
                <input id="password" type="password" autocomplete="current-password" required>
            </div>
            <button type="submit">Entrar</button>
        </form>
        <div id="loginMsg" class="msg"></div>
    </section>

    <div id="adminBox" hidden>
        <section>
            <h2>Staff habilitado</h2>
            <form id="addForm" class="row">
                <div>
                    <label for="nick">Nick de Minecraft</label>
                    <input id="nick" maxlength="16" autocomplete="off" required>
                </div>
                <div>
                    <label for="nota">Nota (opcional)</label>
                    <input id="nota" maxlength="120" autocomplete="off">
                </div>
                <button type="submit">Agregar</button>
            </form>
            <div id="listMsg" class="msg"></div>
            <ul id="list"></ul>
        </section>

        <section>
            <h2>Capa del servidor de pruebas</h2>
            <label for="layer">JSON que arma <code>scripts/publicar-pruebas.js</code></label>
            <textarea id="layer" spellcheck="false"></textarea>
            <div class="row mt">
                <button id="saveLayer" type="button">Guardar capa</button>
            </div>
            <div id="layerMsg" class="msg"></div>
        </section>
    </div>
</main>
<script nonce="${nonce}">
(() => {
    const $ = id => document.getElementById(id)
    const show = (el, on) => { el.hidden = !on }
    const say = (el, text, ok) => { el.textContent = text || ''; el.className = 'msg ' + (ok ? 'ok' : 'err') }

    async function api(method, path, body){
        const res = await fetch(path, {
            method,
            credentials: 'same-origin',
            headers: body === undefined ? {} : { 'Content-Type': 'application/json' },
            body: body === undefined ? undefined : JSON.stringify(body)
        })
        let data = {}
        try { data = await res.json() } catch {}
        return { status: res.status, data }
    }

    function renderList(list){
        const ul = $('list')
        ul.replaceChildren()
        if(list.length === 0){
            const li = document.createElement('li')
            li.className = 'empty'
            li.textContent = 'Todavía no hay nadie habilitado.'
            ul.append(li)
            return
        }
        for(const entry of list){
            const li = document.createElement('li')
            const nick = document.createElement('span')
            nick.className = 'nick'
            nick.textContent = entry.nick
            const meta = document.createElement('span')
            meta.className = 'meta'
            const fecha = new Date(entry.agregado).toLocaleDateString('es')
            meta.textContent = entry.nota ? fecha + ' · ' + entry.nota : fecha
            const quitar = document.createElement('button')
            quitar.className = 'danger'
            quitar.type = 'button'
            quitar.textContent = 'Quitar'
            quitar.onclick = async () => {
                if(!confirm('¿Quitar a ' + entry.nick + ' del staff de pruebas?')) return
                const { status, data } = await api('POST', '/api/admin/remove', { nick: entry.nick })
                if(status === 200){ renderList(data.list); say($('listMsg'), entry.nick + ' ya no ve Pruebas. Recuerda sacarlo de la whitelist.', true) }
                else say($('listMsg'), data.error || 'No se pudo quitar.')
            }
            li.append(nick, meta, quitar)
            ul.append(li)
        }
    }

    async function load(){
        const { status, data } = await api('GET', '/api/admin/list')
        const logged = status === 200
        show($('loginBox'), !logged)
        show($('adminBox'), logged)
        show($('logout'), logged)
        if(!logged){
            if(status === 500) say($('loginMsg'), data.error || 'Error del servidor.')
            $('password').focus()
            return
        }
        renderList(data.list || [])
        $('layer').value = data.layer ? JSON.stringify(data.layer, null, 2) : ''
    }

    $('loginForm').onsubmit = async e => {
        e.preventDefault()
        const { status, data } = await api('POST', '/login', { password: $('password').value })
        $('password').value = ''
        if(status === 200){ say($('loginMsg'), ''); await load() }
        else say($('loginMsg'), data.error || 'No se pudo iniciar sesión.')
    }

    $('logout').onclick = async () => {
        await api('POST', '/logout')
        await load()
    }

    $('addForm').onsubmit = async e => {
        e.preventDefault()
        const nick = $('nick').value.trim()
        const { status, data } = await api('POST', '/api/admin/add', { nick, nota: $('nota').value })
        if(status === 200){
            renderList(data.list)
            $('nick').value = ''
            $('nota').value = ''
            say($('listMsg'), nick + ' ya ve Pruebas. Agrégalo también a la whitelist del servidor.', true)
        } else if(status === 401){
            await load()
        } else {
            say($('listMsg'), data.error || 'No se pudo agregar.')
        }
    }

    $('saveLayer').onclick = async () => {
        let layer
        try { layer = JSON.parse($('layer').value) } catch { say($('layerMsg'), 'El texto no es JSON válido.'); return }
        const { status, data } = await api('PUT', '/api/admin/layer', layer)
        if(status === 200) say($('layerMsg'), 'Capa guardada. El staff la recibe la próxima vez que abra el launcher o toque Jugar.', true)
        else if(status === 401) await load()
        else say($('layerMsg'), data.error || 'No se pudo guardar.')
    }

    load()
})()
</script>
</body>
</html>
`
}
