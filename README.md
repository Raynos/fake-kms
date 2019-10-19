# fake-kms

Setup a fake KMS server for testing purposes

## Example

```js
const AWS = require('aws-sdk')
const FakeKMS = require('fake-kms').FakeKMS

async function test() {
  const server = new FakeKMS({
    port: 0,
    encrypt: {
      'SK_LIVE': 'a secret text'
    }
  })

  await server.bootstrap()

  const secrets = server.getCiphers()

  const kms = new AWS.KMS({
    endpoint: `http://${sever.hostPort}`,
    sslEnabled: false
  })

  const data = await kms.decrypt({
    CiphertextBlob: secrets['SK_LIVE']
  })

  // Should be `a secret text`
  console.log('the text', data.PLaintext.toString())

  await server.close()
}

process.on('unhandledRejection', (err) => { throw err })
test()
```
## Docs :

### `const server = new FakeKMS(opts)`

Creates a fake KMS server.

 - `opts.port` ; defaults to 0
 - `opts.encrypt` ; An object of key / value pairs that you
    want pre-created in the KMS.

### `await server.bootstrap()`

Starts the server.

After bootstrap returns you can read `server.hostPort` to get the
actual listening port of the server.

### `const secrets = server.getCiphers()`

This returns an object of key / value pairs for all the secrets
that have been encrypted in the KMS.

Each value is a valid CiphertextBlob as a base64 string that
can be passed to the `kms` library in `kms.decrypt()`

### `await server.close()`

Shuts down the server.

## install

```
% npm install fake-kms
```

## MIT Licensed

