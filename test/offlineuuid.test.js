const test = require('node:test')
const assert = require('node:assert/strict')
const { createOfflineUUID } = require('../app/assets/js/offlineuuid')

test('creates the standard Minecraft offline UUID', () => {
    assert.equal(createOfflineUUID('Player'), 'a01e3843e5213998958af459800e4d11')
})

test('accepts only Minecraft usernames between 3 and 16 characters', () => {
    assert.throws(() => createOfflineUUID('ab'))
    assert.throws(() => createOfflineUUID('this_name_is_far_too_long'))
    assert.throws(() => createOfflineUUID('bad-name'))
    assert.equal(createOfflineUUID('abc').length, 32)
})
