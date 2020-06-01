'use strict'

const AWS = require('aws-sdk')
const tape = require('@pre-bundled/tape')
const tapeCluster = require('tape-cluster')

const FakeKMS = require('../index').FakeKMS

class TestHarness {
  // kmsServer: FakeKMS;
  // kms: AWS.KMS | null;
  // secrets: Dictionary<string>;

  constructor () {
    /** @type {Record<string, string>} */
    this.secrets = {
      SECRET_ONE: 'one',
      SECRET_TWO: 'two'
    }

    /** @type {FakeKMS} */
    this.kmsServer = new FakeKMS({
      port: 0,
      encrypt: this.secrets
    })
    /** @type {AWS.KMS | null} */
    this.kms = null
  }

  /** @returns {Promise<void>} */
  async bootstrap () {
    const hostPort = await this.kmsServer.bootstrap()

    this.kms = new AWS.KMS({
      region: 'us-east-1',
      endpoint: `http://${hostPort}`,
      sslEnabled: false,
      accessKeyId: '123',
      secretAccessKey: 'abc'
    })
  }

  /**
   * @param {AWS.KMS.Types.DecryptRequest} params
   * @returns {Promise<AWS.KMS.Types.DecryptResponse>}
   */
  async decrypt (params) {
    if (!this.kms) {
      throw new Error('must call bootstrap()')
    }
    return this.kms.decrypt(params).promise()
  }

  /** @returns {Record<string, string>} */
  getCiphers () {
    return this.kmsServer.getCiphers()
  }

  /** @returns {Promise<void>} */
  async close () {
    await this.kmsServer.close()
  }
}
exports.TestHarness = TestHarness

exports.test = tapeCluster(tape, TestHarness)
