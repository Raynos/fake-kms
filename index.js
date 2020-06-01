'use strict'
// @ts-check

const http = require('http')
const crypto = require('crypto')
const util = require('util')

/** @typedef {{
      (err?: Error): void;
    }} Callback
 */

/** @typedef {{
      port?: number;
      encrypt?: Record<string, string>;
    }} Options
 */

class FakeKMS {
  /** @param {Options} options */
  constructor (options = {}) {
    /** @type {http.Server | null} */
    this.httpServer = http.createServer()
    /** @type {number} */
    this.port = options.port || 0
    /** @type {string|null} */
    this.hostPort = null

    /** @type {Buffer} */
    this.iv = crypto.randomBytes(16)
    /** @type {Buffer} */
    this.key = crypto.randomBytes(32)
    /** @type {string} */
    this.arn = 'fake-arn'

    /** @type {Record<string, string>} */
    this.ciphers = {}
    if (options.encrypt) {
      for (const key of Object.keys(options.encrypt)) {
        this.ciphers[key] = this.encrypt(options.encrypt[key])
      }
    }
  }

  /** @returns {Promise<string>} */
  async bootstrap () {
    if (!this.httpServer) {
      throw new Error('cannot bootstrap closed server')
    }

    this.httpServer.on('request', (
      /** @type {http.IncomingMessage} */req,
      /** @type {http.ServerResponse} */res
    ) => {
      this.handleServerRequest(req, res)
    })

    const server = this.httpServer
    await util.promisify((/** @type {Callback} */ cb) => {
      server.listen(this.port, cb)
    })()

    const addr = this.httpServer.address()
    if (!addr || typeof addr === 'string') {
      throw new Error('invalid http server address')
    }

    this.hostPort = `localhost:${addr.port}`
    return this.hostPort
  }

  /** @returns {Promise<void>} */
  async close () {
    if (this.httpServer) {
      await util.promisify(
        this.httpServer.close.bind(this.httpServer)
      )()
      this.httpServer = null
    }
  }

  /** @returns {Record<string, string>} */
  getCiphers () {
    return this.ciphers
  }

  /**
   * @param {http.IncomingMessage} req
   * @param {http.ServerResponse} res
   * @returns {void}
   */
  handleServerRequest (req, res) {
    let body = ''
    req.on('data', (/** @type {Buffer} */ chunk) => {
      body += chunk.toString()
    })
    req.on('end', () => {
      const target = req.headers['x-amz-target']
      if (target !== 'TrentService.Decrypt') {
        res.statusCode = 400
        res.end('Not Found')
        return
      }

      const respBody = this.decrypt(body)
      res.writeHead(200, {
        'Content-Type': 'application/x-amz-json-1.1'
      })
      res.end(JSON.stringify(respBody))
    })
  }

  /**
   * Encrypts the plainText key and creates a ciphertextblob
   * which is a base64 string.
   *
   * @param {string} plainText
   * @returns {string}
   */
  encrypt (plainText) {
    const cipher = crypto.createCipheriv(
      'aes-256-gcm', this.key, this.iv
    )

    let encrypted = cipher.update(plainText)
    encrypted = Buffer.concat([encrypted, cipher.final()])

    const result = Buffer.concat([
      cipher.getAuthTag(), encrypted
    ])

    const arnBytes = Buffer.from(this.arn)
    const version = 1

    const ciphertextBlobBytes = Buffer.alloc(
      1 + arnBytes.length + 4 + result.length
    )

    ciphertextBlobBytes.writeInt8(this.arn.length, 0)
    arnBytes.copy(ciphertextBlobBytes, 1)
    ciphertextBlobBytes.writeInt32LE(
      version, 1 + arnBytes.length
    )
    result.copy(
      ciphertextBlobBytes,
      1 + arnBytes.length + 4
    )

    return ciphertextBlobBytes.toString('base64')
  }

  /**
   * @param {string} body
   * @returns {{ Plaintext: string }}
   */
  decrypt (body) {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const json = /** @type {{ CiphertextBlob: string }} */ (
      JSON.parse(body)
    )

    const buf = Buffer.from(json.CiphertextBlob, 'base64')
    const identLength = buf.readInt8(0)
    const cipherText = buf.slice(identLength + 5)

    const authTag = cipherText.slice(0, 16)
    const encrypted = cipherText.slice(16)

    const decipher = crypto.createDecipheriv(
      'aes-256-gcm', this.key, this.iv
    )

    decipher.setAuthTag(authTag)

    let decrypted = decipher.update(encrypted)
    decrypted = Buffer.concat([decrypted, decipher.final()])

    return {
      Plaintext: decrypted.toString('base64')
    }
  }
}
exports.FakeKMS = FakeKMS
