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

function renderFallback(kind, username){
    const hash = hashUsername(username)
    const hue = hash % 360
    if(kind === 'body'){
        const { canvas, context } = makeCanvas(64, 128)
        context.fillStyle = `hsl(${hue} 34% 48%)`
        context.fillRect(16, 0, 32, 32)
        context.fillStyle = `hsl(${(hue + 32) % 360} 42% 36%)`
        context.fillRect(16, 32, 32, 48)
        context.fillRect(0, 32, 16, 48)
        context.fillRect(48, 32, 16, 48)
        context.fillStyle = `hsl(${(hue + 210) % 360} 36% 30%)`
        context.fillRect(16, 80, 16, 48)
        context.fillRect(32, 80, 16, 48)
        return canvas.toDataURL('image/png')
    }

    const { canvas, context } = makeCanvas(64, 64)
    context.fillStyle = `hsl(${hue} 34% 48%)`
    context.fillRect(0, 0, 64, 64)
    context.fillStyle = 'rgba(255,255,255,0.78)'
    context.fillRect(14, 22, 10, 10)
    context.fillRect(40, 22, 10, 10)
    context.fillStyle = 'rgba(0,0,0,0.42)'
    context.fillRect(22, 43, 20, 7)
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
