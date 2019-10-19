'use strict';
Object.defineProperty(exports, "__esModule", { value: true });
const http = require("http");
const crypto = require("crypto");
const util = require("util");
class FakeKMS {
    constructor(options = {}) {
        this.httpServer = http.createServer();
        this.port = options.port || 0;
        this.hostPort = null;
        this.iv = crypto.randomBytes(16);
        this.key = crypto.randomBytes(32);
        this.arn = 'fake-arn';
        this.ciphers = {};
        if (options.encrypt) {
            for (const key of Object.keys(options.encrypt)) {
                this.ciphers[key] = this.encrypt(options.encrypt[key]);
            }
        }
    }
    async bootstrap() {
        if (!this.httpServer) {
            throw new Error('cannot bootstrap closed server');
        }
        this.httpServer.on('request', (req, res) => {
            this.handleServerRequest(req, res);
        });
        const server = this.httpServer;
        await util.promisify((cb) => {
            server.listen(this.port, cb);
        })();
        const addr = this.httpServer.address();
        if (!addr || typeof addr === 'string') {
            throw new Error('invalid http server address');
        }
        this.hostPort = `localhost:${addr.port}`;
        return this.hostPort;
    }
    async close() {
        if (this.httpServer) {
            await util.promisify(this.httpServer.close.bind(this.httpServer))();
            this.httpServer = null;
        }
    }
    getCiphers() {
        return this.ciphers;
    }
    handleServerRequest(req, res) {
        let body = '';
        req.on('data', (chunk) => {
            body += chunk.toString();
        });
        req.on('end', () => {
            const target = req.headers['x-amz-target'];
            let respBody;
            if (target === 'TrentService.Decrypt') {
                respBody = this.decrypt(body);
            }
            else {
                res.statusCode = 400;
                res.end('Not Found');
                return;
            }
            res.writeHead(200, {
                'Content-Type': 'application/x-amz-json-1.1'
            });
            res.end(JSON.stringify(respBody));
        });
    }
    /**
     * Encrypts the plainText key and creates a ciphertextblob
     * which is a base64 string.
     */
    encrypt(plainText) {
        const cipher = crypto.createCipheriv('aes-256-gcm', this.key, this.iv);
        let encrypted = cipher.update(plainText);
        encrypted = Buffer.concat([encrypted, cipher.final()]);
        const result = Buffer.concat([
            cipher.getAuthTag(), encrypted
        ]);
        const arnBytes = Buffer.from(this.arn);
        const version = 1;
        const ciphertextBlobBytes = Buffer.alloc(1 + arnBytes.length + 4 + result.length);
        ciphertextBlobBytes.writeInt8(this.arn.length, 0);
        arnBytes.copy(ciphertextBlobBytes, 1);
        ciphertextBlobBytes.writeInt32LE(version, 1 + arnBytes.length);
        result.copy(ciphertextBlobBytes, 1 + arnBytes.length + 4);
        return ciphertextBlobBytes.toString('base64');
    }
    decrypt(body) {
        const json = JSON.parse(body);
        const buf = Buffer.from(json.CiphertextBlob, 'base64');
        const identLength = buf.readInt8(0);
        const cipherText = buf.slice(identLength + 5);
        const authTag = cipherText.slice(0, 16);
        const encrypted = cipherText.slice(16);
        const decipher = crypto.createDecipheriv('aes-256-gcm', this.key, this.iv);
        decipher.setAuthTag(authTag);
        let decrypted = decipher.update(encrypted);
        decrypted = Buffer.concat([decrypted, decipher.final()]);
        return {
            Plaintext: decrypted.toString('base64')
        };
    }
}
exports.FakeKMS = FakeKMS;
//# sourceMappingURL=index.js.map