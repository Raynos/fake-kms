'use strict';
Object.defineProperty(exports, "__esModule", { value: true });
const AWS = require("aws-sdk");
const tape = require("tape");
const tapeCluster = require("tape-cluster");
const index_1 = require("../src/index");
class TestHarness {
    constructor() {
        this.secrets = {
            SECRET_ONE: 'one',
            SECRET_TWO: 'two'
        };
        this.kmsServer = new index_1.FakeKMS({
            port: 0,
            encrypt: this.secrets
        });
        this.kms = null;
    }
    async bootstrap() {
        const hostPort = await this.kmsServer.bootstrap();
        this.kms = new AWS.KMS({
            region: 'us-east-1',
            endpoint: `http://${hostPort}`,
            sslEnabled: false,
            accessKeyId: '123',
            secretAccessKey: 'abc'
        });
    }
    async decrypt(params) {
        if (!this.kms) {
            throw new Error('must call bootstrap()');
        }
        return this.kms.decrypt(params).promise();
    }
    getCiphers() {
        return this.kmsServer.getCiphers();
    }
    async close() {
        await this.kmsServer.close();
    }
}
exports.TestHarness = TestHarness;
exports.test = tapeCluster(tape, TestHarness);
//# sourceMappingURL=test-harness.js.map