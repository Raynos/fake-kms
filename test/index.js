'use strict'

const test = require('./test-harness').test

test('decrypt a secret', async (harness, assert) => {
  const ciphers = harness.getCiphers()

  const resp = await harness.decrypt({
    CiphertextBlob: Buffer.from(ciphers.SECRET_ONE, 'base64')
  })

  if (!resp.Plaintext) {
    assert.ok(false, 'did not get plaintext')
    return
  }

  const str = resp.Plaintext.toString('ascii')
  assert.equal(str, 'one')

  assert.ok(true)
})
