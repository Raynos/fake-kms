'use strict';

import * as AWS from '@pre-bundled/aws-sdk';
import * as tape from '@pre-bundled/tape';
import * as tapeCluster from 'tape-cluster';

import { FakeKMS } from '../src/index';

interface Dictionary<T> {
    [key: string]: T;
}

export class TestHarness {
    kmsServer: FakeKMS;
    kms: AWS.KMS | null;
    secrets: Dictionary<string>;

    constructor() {
        this.secrets = {
            SECRET_ONE: 'one',
            SECRET_TWO: 'two'
        };

        this.kmsServer = new FakeKMS({
            port: 0,
            encrypt: this.secrets
        });
        this.kms = null;
    }

    async bootstrap(): Promise<void> {
        const hostPort = await this.kmsServer.bootstrap();

        this.kms = new AWS.KMS({
            region: 'us-east-1',
            endpoint: `http://${hostPort}`,
            sslEnabled: false,
            accessKeyId: '123',
            secretAccessKey: 'abc'
        });
    }

    async decrypt(
        params: AWS.KMS.Types.DecryptRequest
    ): Promise<AWS.KMS.Types.DecryptResponse> {
        if (!this.kms) {
            throw new Error('must call bootstrap()');
        }
        return this.kms.decrypt(params).promise();
    }

    getCiphers(): Dictionary<string> {
        return this.kmsServer.getCiphers();
    }

    async close(): Promise<void> {
        await this.kmsServer.close();
    }
}

export const test = tapeCluster(tape, TestHarness);
