const test = require('node:test')
const assert = require('node:assert/strict')

const { normalizeSearch, modMatches } = require('../app/assets/js/modfilter')

test('normalizeSearch lowercases and strips accents', () => {
    assert.equal(normalizeSearch('  Ánimación  ÑU '), 'animacion  nu')
})

test('modMatches by name ignoring case and accents', () => {
    const mod = { name: 'Iris Shaders', enabled: true }
    assert.equal(modMatches(mod, 'IRIS', 'all'), true)
    assert.equal(modMatches({ name: 'Animación', enabled: true }, 'animacion', 'all'), true)
    assert.equal(modMatches(mod, 'sodium', 'all'), false)
})

test('modMatches empty query matches everything', () => {
    assert.equal(modMatches({ name: 'X', enabled: false }, '', 'all'), true)
})

test('modMatches state filter', () => {
    const on = { name: 'A', enabled: true }
    const off = { name: 'B', enabled: false }
    assert.equal(modMatches(on, '', 'on'), true)
    assert.equal(modMatches(off, '', 'on'), false)
    assert.equal(modMatches(off, '', 'off'), true)
    assert.equal(modMatches(on, '', 'off'), false)
})
