'use strict';

import * as http from 'http';
import * as crypto from 'crypto';
import * as util from 'util';

export interface Dictionary<T> {
    [key: string]: T;
}

export interface Callback {
    (err?: Error): void;
}

export interface Options {
    port?: number;
    encrypt?: Dictionary<string>;
}

export class FakeKMS {
    private httpServer: http.Server | null;
    private readonly port: number;
    private readonly ciphers: Dictionary<string>;
    private hostPort: string | null;

    private readonly arn: string;
    private readonly key: Buffer;
    private readonly iv: Buffer;

    constructor(options: Options = {}) {
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

    async bootstrap(): Promise<string> {
        if (!this.httpServer) {
            throw new Error('cannot bootstrap closed server');
        }

        this.httpServer.on('request', (
            req: http.IncomingMessage,
            res: http.ServerResponse
        ) => {
            this.handleServerRequest(req, res);
        });

        const server = this.httpServer;
        await util.promisify((cb: Callback) => {
            server.listen(this.port, cb);
        })();

        const addr = this.httpServer.address();
        if (!addr || typeof addr === 'string') {
            throw new Error('invalid http server address');
        }

        this.hostPort = `localhost:${addr.port}`;
        return this.hostPort;
    }

    async close(): Promise<void> {
        if (this.httpServer) {
            await util.promisify(
                this.httpServer.close.bind(this.httpServer)
            )();
            this.httpServer = null;
        }
    }

    getCiphers(): Dictionary<string> {
        return this.ciphers;
    }

    private handleServerRequest(
        req: http.IncomingMessage,
        res: http.ServerResponse
    ): void {
        let body = '';
        req.on('data', (chunk: string) => {
            body += chunk.toString();
        });
        req.on('end', () => {
            const target = req.headers['x-amz-target'];

            let respBody: unknown;
            if (target === 'TrentService.Decrypt') {
                respBody = this.decrypt(body);
            } else {
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
    private encrypt(plainText: string): string {
        const cipher = crypto.createCipheriv(
            'aes-256-gcm', this.key, this.iv
        );

        let encrypted = cipher.update(plainText);
        encrypted = Buffer.concat([encrypted, cipher.final()]);

        const result = Buffer.concat([
            cipher.getAuthTag(), encrypted
        ]);

        const arnBytes = Buffer.from(this.arn);
        const version = 1;

        const ciphertextBlobBytes = Buffer.alloc(
            1 + arnBytes.length + 4 + result.length
        );

        ciphertextBlobBytes.writeInt8(this.arn.length, 0);
        arnBytes.copy(ciphertextBlobBytes, 1);
        ciphertextBlobBytes.writeInt32LE(
            version, 1 + arnBytes.length
        );
        result.copy(
            ciphertextBlobBytes,
            1 + arnBytes.length + 4
        );

        return ciphertextBlobBytes.toString('base64');
    }

    private decrypt(body: string): object {
        const json = <{ CiphertextBlob: string }> JSON.parse(body);

        const buf = Buffer.from(json.CiphertextBlob, 'base64');
        const identLength = buf.readInt8(0);
        const cipherText = buf.slice(identLength + 5);

        const authTag = cipherText.slice(0, 16);
        const encrypted = cipherText.slice(16);

        const decipher = crypto.createDecipheriv(
            'aes-256-gcm', this.key, this.iv
        );

        decipher.setAuthTag(authTag);

        let decrypted = decipher.update(encrypted);
        decrypted = Buffer.concat([decrypted, decipher.final()]);

        return {
            Plaintext: decrypted.toString('base64')
        };
    }
}
