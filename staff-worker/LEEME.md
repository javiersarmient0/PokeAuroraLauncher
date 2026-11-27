# Worker de staff — `staff.pokeaurora.com`

Decide quién ve el servidor **Pruebas** en el launcher y guarda la "capa" del modpack de pruebas.
La whitelist del servidor de pruebas sigue siendo la que deja entrar: agregar o quitar a alguien son **dos pasos**
(panel + whitelist).

- `src/logic.mjs`: lista de nicks, clave maestra (PBKDF2-SHA256, 100.000 iteraciones: el máximo que acepta Workers), sesiones (HMAC, 12 h) y validación de la capa.
- `src/index.mjs`: rutas HTTP.
- `src/panel.html.mjs`: el panel web.
- `scripts/hash-clave.mjs`: genera el hash de la clave maestra.
- Tests: `test/staffworker.test.js` en la raíz del launcher (`npm test`).

No forma parte del instalador (`electron-builder.yml` excluye `staff-worker`).

## Rutas

| Ruta | Quién | Qué hace |
|---|---|---|
| `GET /api/pruebas/layer?nick=` | launcher | 200 con la capa si el nick está en la lista; 404 si no; 503 si está pero todavía no hay capa |
| `GET /api/staff?nick=` | cualquiera | `{ "staff": true/false }`, sin datos de la lista |
| `GET /` | Rey112 | panel |
| `POST /login`, `POST /logout` | panel | sesión por cookie `HttpOnly; Secure; SameSite=Strict` de 12 h; 10 fallos en 15 min por IP → 429 |
| `GET /api/admin/list`, `POST /api/admin/add`, `POST /api/admin/remove`, `PUT /api/admin/layer` | panel | exigen sesión y, al escribir, que el `Origin` sea el propio sitio |

El nick se compara sin distinguir mayúsculas. Se acepta el nick solo (también de cuentas no-premium).

## Publicarlo (lo hace Rey112, una sola vez)

**Ya publicado el 25/11/2026** en la cuenta de Cloudflare de PokeAurora (KV `STAFF` con id
`b7b92b3488814254ab17d06efde2fc42`, ya puesto en `wrangler.toml`). Para actualizar el código alcanza con
`npx wrangler deploy` dentro de `staff-worker/`; los secretos y la lista se conservan.

Hace falta Node 22 y una cuenta de Cloudflare con el dominio `pokeaurora.com`. Todos los comandos van dentro de
`staff-worker/`. `npx wrangler` descarga wrangler la primera vez.

1. Iniciar sesión en Cloudflare:
   ```
   npx wrangler login
   ```
2. Crear el KV y copiar el `id` que imprime en `wrangler.toml` (en lugar de `REEMPLAZAR_CON_EL_ID_DEL_KV`):
   ```
   npx wrangler kv namespace create STAFF
   ```
3. Elegir la clave maestra (12 caracteres o más) y generar su hash. La clave no se guarda en ningún lado,
   solo el hash (con `--out archivo` lo guarda en UTF-8, para pasárselo después a `wrangler secret put` con `<`):
   ```
   node scripts/hash-clave.mjs
   ```
4. Cargar los dos secretos. Pega el hash del paso 3 en el primero y, en el segundo, un texto largo al azar
   (por ejemplo, la salida de `node -e "console.log(crypto.randomBytes(32).toString('base64'))"`):
   ```
   npx wrangler secret put ADMIN_PASSWORD_HASH
   npx wrangler secret put SESSION_SECRET
   ```
5. Publicar:
   ```
   npx wrangler deploy
   ```
   `wrangler.toml` usa `custom_domain = true`: Cloudflare crea solo el registro DNS de `staff.pokeaurora.com`.
   Si ya existe un registro `staff` en el DNS, hay que borrarlo antes.
6. Abrir `https://staff.pokeaurora.com`, entrar con la clave maestra y agregar los nicks del staff.

Para cambiar la clave: repetir los pasos 3 y 4 (con `ADMIN_PASSWORD_HASH`). Para cerrar todas las sesiones abiertas:
cargar otro `SESSION_SECRET`.

## Cargar o actualizar el mod cliente de pruebas

1. Compilar el jar de pruebas de PokeAurora con una versión propia (por ejemplo `1.0.0-pruebas.20261121`).
2. Subirlo a R2 (ver abajo), con un nombre que lleve la versión.
3. Armar la capa (no sube nada, solo imprime el JSON). Desde la raíz del launcher:
   ```
   node scripts/publicar-pruebas.js <ruta-del-jar> <url-pública-del-jar> [versión]
   ```
4. En el panel, pegar el JSON en **Capa del servidor de pruebas** y tocar **Guardar capa**. El staff lo recibe la
   próxima vez que abra el launcher o toque Jugar.

La URL del jar tiene que estar en un host que el launcher acepte (`video.pokeaurora.com`,
`pub-16d8232ded904a1bbed89826fb24c57e.r2.dev` o `launcher.pokeaurora.com`); si no, el launcher ignora la capa y el staff
sigue con lo que tenía. Lo más simple es nuestro R2 `pokeaurora-video` (el `pub-16d8…` es de otra cuenta):
```
npx wrangler r2 object put "pokeaurora-video/launcher/pruebas/PokeAurora-<versión>.jar" --file <jar> --content-type application/java-archive --remote
```
URL pública: `https://video.pokeaurora.com/launcher/pruebas/PokeAurora-<versión>.jar`.

## Probarlo sin publicar

`npm test` en la raíz corre los tests del Worker con un KV en memoria. También se puede usar
`npx wrangler dev` dentro de `staff-worker/` (KV local) con un archivo `.dev.vars` que tenga
`ADMIN_PASSWORD_HASH=...` y `SESSION_SECRET=...` (no se sube al repo).
