// Aplica los gráficos de un perfil al options.txt de Minecraft.
// Solo toca renderDistance, simulationDistance, graphicsMode, particles y resourcePacks.
// Nunca toca optionsshaders.txt ni config/iris.properties.
// Los packs que apaga un perfil se anotan en options.txt.packs-perfil para volver a
// prenderlos cuando el jugador pasa a un perfil que ya no los apaga.
const fs = require('fs-extra')

const KEYS = ['renderDistance', 'simulationDistance', 'graphicsMode', 'particles']

function matchesAny(pack, prefixes){
    return typeof pack === 'string' && prefixes.some(prefix => pack.startsWith(prefix))
}

/**
 * @returns {{value: string, removed: string[]}|null} null si la línea no es un JSON de lista válido
 */
function rewriteResourcePacks(value, prefixes, restore){
    try {
        const packs = JSON.parse(value)
        if(!Array.isArray(packs)) return null
        const removed = packs.filter(pack => matchesAny(pack, prefixes))
        const kept = packs.filter(pack => !matchesAny(pack, prefixes))
        for(const pack of restore){
            if(typeof pack === 'string' && !kept.includes(pack) && !matchesAny(pack, prefixes)){
                kept.push(pack)
            }
        }
        return { value: JSON.stringify(kept), removed }
    } catch {
        return null
    }
}

function rewriteOptions(text, graphics, restore = []){
    const eol = text.includes('\r\n') ? '\r\n' : '\n'
    const lines = text.split(/\r?\n/)
    const trailing = lines.length > 0 && lines[lines.length - 1] === ''
    if(trailing) lines.pop()

    const prefixes = graphics.disableResourcePacks || []
    const seen = new Set()
    let removed = []
    const out = lines.map(line => {
        const sep = line.indexOf(':')
        if(sep < 0) return line
        const key = line.slice(0, sep)
        if(KEYS.includes(key)){
            seen.add(key)
            return `${key}:${graphics[key]}`
        }
        if(key === 'resourcePacks'){
            const result = rewriteResourcePacks(line.slice(sep + 1), prefixes, restore)
            if(result == null) return line
            removed = result.removed
            return `${key}:${result.value}`
        }
        return line
    })
    for(const key of KEYS){
        if(!seen.has(key)) out.push(`${key}:${graphics[key]}`)
    }
    // Lo que sigue apagado: lo recién quitado más lo anotado que este perfil también apaga.
    const stillOff = [...new Set([...removed, ...restore.filter(pack => matchesAny(pack, prefixes))])]
    return { text: out.join(eol) + eol, stillOff }
}

function applyGraphicsToOptionsText(text, graphics, restore = []){
    return rewriteOptions(text, graphics, restore).text
}

async function readSidecar(file){
    try {
        const list = JSON.parse(await fs.readFile(file, 'utf8'))
        return Array.isArray(list) ? list.filter(pack => typeof pack === 'string') : []
    } catch {
        return []
    }
}

async function applyProfileGraphics(optionsPath, graphics){
    try {
        if(!await fs.pathExists(optionsPath)){
            return { applied: false, reason: 'missing' }
        }
        const sidecar = `${optionsPath}.packs-perfil`
        const text = await fs.readFile(optionsPath, 'utf8')
        const result = rewriteOptions(text, graphics, await readSidecar(sidecar))
        await fs.writeFile(`${optionsPath}.antes-perfil`, text)
        await fs.writeFile(optionsPath, result.text)
        if(result.stillOff.length > 0){
            await fs.writeFile(sidecar, JSON.stringify(result.stillOff))
        } else {
            await fs.remove(sidecar)
        }
        return { applied: true }
    } catch {
        return { applied: false, reason: 'error' }
    }
}

module.exports = {
    applyGraphicsToOptionsText,
    applyProfileGraphics
}
