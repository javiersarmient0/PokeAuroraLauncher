// Búsqueda y filtro de la pestaña Mods (puro, sin DOM).

function normalizeSearch(text){
    return String(text ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()
}

/**
 * @param {{name: string, enabled: boolean}} mod
 * @param {string} query texto del buscador
 * @param {'all'|'on'|'off'} filter
 */
function modMatches(mod, query, filter){
    if(filter === 'on' && !mod.enabled) return false
    if(filter === 'off' && mod.enabled) return false
    const q = normalizeSearch(query)
    return q === '' || normalizeSearch(mod.name).includes(q)
}

module.exports = { normalizeSearch, modMatches }
