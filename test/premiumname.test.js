const test = require('node:test')
const assert = require('node:assert/strict')
const { EventEmitter } = require('node:events')
const { isPremiumUsername, PROFILE_LOOKUP_URL } = require('../app/assets/js/premiumname')

function fakeGet({ statusCode, error }){
    const calls = []
    const get = (url, options, callback) => {
        calls.push(url)
        const request = new EventEmitter()
        request.destroy = err => request.emit('error', err)
        setTimeout(() => {
            if(error){
                request.emit('error', error)
            } else {
                callback({ statusCode, resume(){} })
            }
        }, 0)
        return request
    }
    return { get, calls }
}

test('a name with a Mojang profile is premium', async () => {
    const { get, calls } = fakeGet({ statusCode: 200 })
    assert.equal(await isPremiumUsername('Notch', get), true)
    assert.equal(calls[0], `${PROFILE_LOOKUP_URL}Notch`)
})

test('a name without a Mojang profile is not premium', async () => {
    assert.equal(await isPremiumUsername('NadieLoUsa_91', fakeGet({ statusCode: 404 }).get), false)
})

test('an unexpected answer or network failure is reported as unknown', async () => {
    assert.equal(await isPremiumUsername('Notch', fakeGet({ statusCode: 429 }).get), null)
    assert.equal(await isPremiumUsername('Notch', fakeGet({ error: new Error('offline') }).get), null)
})
