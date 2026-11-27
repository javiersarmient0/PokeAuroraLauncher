const textureCache = new Map()
const renderCache = new Map()

function normalizeAccount(accountOrUuid, accountType, username){
    if(accountOrUuid != null && typeof accountOrUuid === 'object'){
        return {
            uuid: String(accountOrUuid.uuid || ''),
            type: String(accountOrUuid.type || ''),
            username: String(accountOrUuid.displayName || accountOrUuid.username || '')
        }
    }
    return {
        uuid: String(accountOrUuid || ''),
        type: String(accountType || ''),
        username: String(username || '')
    }
}

function normalizeTextureURL(raw){
    if(typeof raw !== 'string' || raw.length === 0){
        return null
    }
    try {
        const parsed = new URL(raw)
        if(parsed.hostname !== 'textures.minecraft.net'){
            return null
        }
        // Mojang texture payloads may still contain an http URL. The same
        // texture endpoint supports HTTPS, which is required by the launcher CSP.
        if(parsed.protocol === 'http:'){
            parsed.protocol = 'https:'
        }
        return parsed.protocol === 'https:' ? parsed.toString() : null
    } catch(_error) {
        return null
    }
}

async function getOfficialTextureByUUID(uuid){
    const normalized = String(uuid || '').replaceAll('-', '')
    if(!/^[a-f0-9]{32}$/i.test(normalized)){
        return null
    }

    const cacheKey = `uuid:${normalized.toLowerCase()}`
    if(textureCache.has(cacheKey)){
        return textureCache.get(cacheKey)
    }

    const promise = (async () => {
        const response = await fetch(`https://sessionserver.mojang.com/session/minecraft/profile/${normalized}`)
        if(!response.ok) return null
        const profile = await response.json()
        const encoded = profile.properties?.find(property => property.name === 'textures')?.value
        if(!encoded) return null
        const payload = JSON.parse(Buffer.from(encoded, 'base64').toString('utf8'))
        const skin = payload.textures?.SKIN
        const url = normalizeTextureURL(skin?.url)
        if(url == null) return null
        return {
            url,
            slim: skin?.metadata?.model === 'slim'
        }
    })().catch(() => null)

    textureCache.set(cacheKey, promise)
    return promise
}

async function getOfficialTextureByUsername(username){
    const normalized = String(username || '').trim()
    if(!/^[A-Za-z0-9_]{3,16}$/.test(normalized)){
        return null
    }

    const cacheKey = `name:${normalized.toLowerCase()}`
    if(textureCache.has(cacheKey)){
        return textureCache.get(cacheKey)
    }

    const promise = (async () => {
        const profileResponse = await fetch(`https://api.mojang.com/users/profiles/minecraft/${encodeURIComponent(normalized)}`)
        if(!profileResponse.ok) return null
        const profile = await profileResponse.json()
        return getOfficialTextureByUUID(profile.id)
    })().catch(() => null)

    textureCache.set(cacheKey, promise)
    return promise
}

async function resolveTexture(account){
    if(account.type === 'microsoft' || account.type === 'mojang'){
        return getOfficialTextureByUUID(account.uuid)
    }
    if(account.type === 'offline'){
        // If a no-premium username also belongs to an official Minecraft
        // profile, use that skin. Otherwise a neutral generated avatar is used.
        return getOfficialTextureByUsername(account.username)
    }
    return null
}

async function loadTextureBitmap(textureUrl){
    const response = await fetch(textureUrl)
    if(!response.ok){
        return null
    }
    const blob = await response.blob()

    if(typeof window.createImageBitmap === 'function'){
        return window.createImageBitmap(blob)
    }

    return new Promise((resolve, reject) => {
        const objectURL = URL.createObjectURL(blob)
        const image = new window.Image()
        image.onload = () => {
            URL.revokeObjectURL(objectURL)
            resolve(image)
        }
        image.onerror = () => {
            URL.revokeObjectURL(objectURL)
            reject(new Error('Unable to decode Minecraft skin texture.'))
        }
        image.src = objectURL
    })
}

function closeBitmap(bitmap){
    if(typeof bitmap?.close === 'function'){
        bitmap.close()
    }
}

function drawPart(context, bitmap, sx, sy, sw, sh, dx, dy, dw, dh){
    context.drawImage(bitmap, sx, sy, sw, sh, dx, dy, dw, dh)
}

function makeCanvas(width, height){
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const context = canvas.getContext('2d')
    context.imageSmoothingEnabled = false
    context.clearRect(0, 0, width, height)
    return { canvas, context }
}

async function renderHead(texture){
    const bitmap = await loadTextureBitmap(texture.url)
    if(bitmap == null) return null
    try {
        const { canvas, context } = makeCanvas(64, 64)
        drawPart(context, bitmap, 8, 8, 8, 8, 0, 0, 64, 64)
        if(bitmap.height >= 64){
            drawPart(context, bitmap, 40, 8, 8, 8, 0, 0, 64, 64)
        }
        return canvas.toDataURL('image/png')
    } finally {
        closeBitmap(bitmap)
    }
}

async function renderBody(texture){
    const bitmap = await loadTextureBitmap(texture.url)
    if(bitmap == null) return null
    try {
        const { canvas, context } = makeCanvas(64, 128)
        const slim = texture.slim === true
        const armSourceWidth = slim ? 3 : 4
        const armDestWidth = slim ? 12 : 16

        // Head + hat layer.
        drawPart(context, bitmap, 8, 8, 8, 8, 16, 0, 32, 32)
        if(bitmap.height >= 64){
            drawPart(context, bitmap, 40, 8, 8, 8, 16, 0, 32, 32)
        }

        // Torso + jacket.
        drawPart(context, bitmap, 20, 20, 8, 12, 16, 32, 32, 48)
        if(bitmap.height >= 64){
            drawPart(context, bitmap, 20, 36, 8, 12, 16, 32, 32, 48)
        }

        // Right arm.
        drawPart(context, bitmap, 44, 20, armSourceWidth, 12, 16 - armDestWidth, 32, armDestWidth, 48)
        if(bitmap.height >= 64){
            drawPart(context, bitmap, 44, 36, armSourceWidth, 12, 16 - armDestWidth, 32, armDestWidth, 48)
        }

        // Left arm. Legacy skins do not have a dedicated left arm, mirror the right arm.
        if(bitmap.height >= 64){
            drawPart(context, bitmap, 36, 52, armSourceWidth, 12, 48, 32, armDestWidth, 48)
            drawPart(context, bitmap, 52, 52, armSourceWidth, 12, 48, 32, armDestWidth, 48)
        } else {
            context.save()
            context.translate(64, 0)
            context.scale(-1, 1)
            drawPart(context, bitmap, 44, 20, 4, 12, 0, 32, 16, 48)
            context.restore()
        }

        // Right leg.
        drawPart(context, bitmap, 4, 20, 4, 12, 16, 80, 16, 48)
        if(bitmap.height >= 64){
            drawPart(context, bitmap, 4, 36, 4, 12, 16, 80, 16, 48)
        }

        // Left leg.
        if(bitmap.height >= 64){
            drawPart(context, bitmap, 20, 52, 4, 12, 32, 80, 16, 48)
            drawPart(context, bitmap, 4, 52, 4, 12, 32, 80, 16, 48)
        } else {
            context.save()
            context.translate(64, 0)
            context.scale(-1, 1)
            drawPart(context, bitmap, 4, 20, 4, 12, 16, 80, 16, 48)
            context.restore()
        }

        return canvas.toDataURL('image/png')
    } finally {
        closeBitmap(bitmap)
    }
}

function hashUsername(username){
    let hash = 2166136261
    for(const char of String(username || 'PokeAurora')){
        hash ^= char.charCodeAt(0)
        hash = Math.imul(hash, 16777619)
    }
    return hash >>> 0
}

const FALLBACK_SKIN = ['#ffdbac', '#f1c27d', '#e0ac69', '#c68642', '#8d5524']
const FALLBACK_HAIR = ['#2b1d14', '#4a2f1b', '#7a4a24', '#d9a441', '#1d1d24', '#a33b20']

function fallbackPalette(username){
    const hash = hashUsername(username)
    const hue = hash % 360
    return {
        skin: FALLBACK_SKIN[(hash >>> 3) % FALLBACK_SKIN.length],
        hair: FALLBACK_HAIR[(hash >>> 7) % FALLBACK_HAIR.length],
        shirt: `hsl(${hue} 52% 46%)`,
        shirtShade: `hsl(${hue} 52% 36%)`,
        pants: `hsl(${(hue + 200) % 360} 30% 28%)`,
        pantsShade: `hsl(${(hue + 200) % 360} 30% 21%)`,
        shoes: '#2a2d36'
    }
}

// Cara 8x8 de un avatar genérico (no es la skin de Mojang): h pelo, s piel, w ojo, e pupila, n nariz, m boca.
const FALLBACK_FACE = [
    'hhhhhhhh',
    'hhhhhhhh',
    'hssssssh',
    'hsssssss',
    'swessews',
    'sssnnsss',
    'sssmmsss',
    'ssssssss'
]

function drawFallbackFace(context, palette, x0, y0, unit){
    const colors = { h: palette.hair, s: palette.skin, w: '#f4f7ff', e: '#2c3a66', n: 'rgba(0,0,0,0.12)', m: 'rgba(60,20,20,0.55)' }
    FALLBACK_FACE.forEach((row, y) => {
        ;[...row].forEach((cell, x) => {
            if(cell === 'n' || cell === 'm'){
                context.fillStyle = palette.skin
                context.fillRect(x0 + x * unit, y0 + y * unit, unit, unit)
            }
            context.fillStyle = colors[cell]
            context.fillRect(x0 + x * unit, y0 + y * unit, unit, unit)
        })
    })
}

function renderFallback(kind, username){
    const palette = fallbackPalette(username)
    if(kind !== 'body'){
        const { canvas, context } = makeCanvas(64, 64)
        drawFallbackFace(context, palette, 0, 0, 8)
        return canvas.toDataURL('image/png')
    }

    // Cuerpo 16x32 unidades de 4 px, mismas proporciones que un personaje de Minecraft.
    const u = 4
    const { canvas, context } = makeCanvas(64, 128)
    const rect = (color, x, y, w, h) => {
        context.fillStyle = color
        context.fillRect(x * u, y * u, w * u, h * u)
    }
    drawFallbackFace(context, palette, 4 * u, 0, u)
    // Torso con cuello en V.
    rect(palette.shirt, 4, 8, 8, 12)
    rect(palette.skin, 7, 8, 2, 1)
    rect(palette.shirtShade, 4, 19, 8, 1)
    // Brazos: manga corta y mano.
    for(const x of [0, 12]){
        rect(palette.shirt, x, 8, 4, 4)
        rect(palette.skin, x, 12, 4, 8)
        rect('rgba(0,0,0,0.14)', x, 19, 4, 1)
    }
    rect(palette.shirtShade, 3, 8, 1, 4)
    rect(palette.shirtShade, 12, 8, 1, 4)
    // Piernas y zapatos.
    rect(palette.pants, 4, 20, 8, 10)
    rect(palette.pantsShade, 8, 20, 1, 10)
    rect(palette.shoes, 4, 30, 8, 2)
    return canvas.toDataURL('image/png')
}

async function renderAccount(accountOrUuid, accountType, username, kind){
    const account = normalizeAccount(accountOrUuid, accountType, username)
    const cacheKey = `${kind}:${account.type}:${account.uuid}:${account.username}`
    if(renderCache.has(cacheKey)){
        return renderCache.get(cacheKey)
    }

    const promise = (async () => {
        try {
            const texture = await resolveTexture(account)
            if(texture != null){
                const rendered = kind === 'body' ? await renderBody(texture) : await renderHead(texture)
                if(rendered != null) return rendered
            }
        } catch(_error) {
            // Fall through to a neutral generated avatar.
        }
        return renderFallback(kind, account.username)
    })()

    renderCache.set(cacheKey, promise)
    return promise
}

function getHead(accountOrUuid, accountType, username){
    return renderAccount(accountOrUuid, accountType, username, 'head')
}

function getBody(accountOrUuid, accountType, username){
    return renderAccount(accountOrUuid, accountType, username, 'body')
}

module.exports = { getBody, getHead }
