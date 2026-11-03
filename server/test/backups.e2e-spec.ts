import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import { MongoMemoryServer } from 'mongodb-memory-server';
import request from 'supertest';
import type { App } from 'supertest/types.js';

import { AppModule } from '../src/app.module.js';
import { loadConfig } from '../src/config.js';
import { configureApp } from '../src/setup.js';

const API_KEY = 'test-key-0123456789abcdef';
const DEVICE = 'device-aaaa-1111';

function txn(localId: number, extra: Record<string, unknown> = {}) {
  return {
    localId,
    smsLocalId: localId,
    bank: 'sampath',
    account: '**5375',
    direction: 'debit',
    amountCents: 285000,
    currency: 'LKR',
    merchant: 'Vishwa',
    description: 'TFR Vishwa -000088326017',
    channel: 'transfer',
    occurredAt: new Date(2026, 9, 3, 12, 54).getTime(),
    status: 'confirmed',
    category: 'unsorted_out',
    categoryLocked: false,
    flag: null,
    linkedLocalId: null,
    reviewed: false,
    note: null,
    createdAt: Date.now(),
    ...extra,
  };
}
function sms(localId: number) {
  return {
    localId,
    androidId: String(1000 + localId),
    sender: 'SAMPATHTXN',
    bank: 'sampath',
    body: 'LKR 2,850.00 debited from AC **5375 for TFR Vishwa -000088326017 03/10/2026 12:54:23',
    receivedAt: new Date(2026, 9, 3, 12, 54, 25).getTime(),
    kind: 'txn',
    txnLocalId: localId,
  };
}
function backup(txns: unknown[], extra: Record<string, unknown> = {}) {
  return {
    deviceId: DEVICE,
    deviceName: 'Pixel 7',
    appVersion: '1.0.0',
    trigger: 'nightly',
    txns,
    sms: txns.map((_, i) => sms(i + 1)),
    rules: [{ localId: 1, pattern: 'VISHWA', category: 'gift_given', createdAt: Date.now() }],
    settings: { ownNames: ['Adeepa'], autoConfirmDays: 3 },
    ...extra,
  };
}

describe('Dr. Tax backup server (e2e)', () => {
  let mongo: MongoMemoryServer;
  let app: INestApplication<App>;
  const api = () => request(app.getHttpServer());
  const auth = { 'x-api-key': API_KEY };

  beforeAll(async () => {
    mongo = await MongoMemoryServer.create();
    const config = loadConfig({ API_KEY, MONGODB_URI: mongo.getUri('drtax-test') });
    const moduleRef = await Test.createTestingModule({ imports: [AppModule.forRoot(config)] }).compile();
    app = configureApp(moduleRef.createNestApplication({ bodyParser: false }), config) as INestApplication<App>;
    await app.init();
  }, 120_000);

  afterAll(async () => {
    await app?.close();
    await mongo?.stop();
  });

  it('health check is public and reports the database', async () => {
    const res = await api().get('/api/health').expect(200);
    expect(res.body).toMatchObject({ ok: true, db: 'up' });
  });

  it('rejects requests without the right API key', async () => {
    await api().get('/api/devices').expect(401);
    await api().get('/api/devices').set('x-api-key', 'wrong-key-wrong-key').expect(401);
  });

  it('rejects malformed backups', async () => {
    await api().post('/api/backups').set(auth).send({ deviceId: DEVICE, txns: [{ localId: 'x' }], sms: [], rules: [], settings: {} }).expect(400);
    await api().post('/api/backups').set(auth).send({ deviceId: 'bad id!', txns: [], sms: [], rules: [], settings: {} }).expect(400);
  });

  it('stores a nightly backup', async () => {
    const res = await api().post('/api/backups').set(auth).send(backup([txn(1), txn(2, { amountCents: 150000 })])).expect(201);
    expect(res.body.counts).toEqual({ txns: 2, sms: 2, rules: 1, removedTxns: 0, removedSms: 0 });
  });

  it('a second backup updates in place, and marks payments deleted on the phone', async () => {
    // Payment 1 was sorted as a gift; payment 2 was deleted on the phone; payment 3 is new.
    const res = await api()
      .post('/api/backups')
      .set(auth)
      .send(backup([txn(1, { category: 'gift_given', categoryLocked: true, note: 'Birthday' }), txn(3, { merchant: 'Kasun', direction: 'credit', amountCents: 4500000 })]))
      .expect(201);
    expect(res.body.counts).toMatchObject({ txns: 2, removedTxns: 1 });

    const snap = await api().get(`/api/devices/${DEVICE}/snapshot`).set(auth).expect(200);
    expect(snap.body.txns.map((t: { localId: number }) => t.localId)).toEqual([1, 3]);
    expect(snap.body.txns[0]).toMatchObject({ category: 'gift_given', note: 'Birthday', occurredAt: txn(1).occurredAt });
    expect(snap.body.rules).toHaveLength(1);
    expect(snap.body.settings).toMatchObject({ ownNames: ['Adeepa'] });
  });

  it('refuses to overwrite a backup with an empty one unless asked', async () => {
    await api().post('/api/backups').set(auth).send(backup([])).expect(409);
    const snap = await api().get(`/api/devices/${DEVICE}/snapshot`).set(auth).expect(200);
    expect(snap.body.txns).toHaveLength(2);
  });

  it('lists devices and backup history', async () => {
    const devices = await api().get('/api/devices').set(auth).expect(200);
    expect(devices.body).toEqual([expect.objectContaining({ deviceId: DEVICE, deviceName: 'Pixel 7', txns: 2 })]);
    const history = await api().get(`/api/backups?deviceId=${DEVICE}`).set(auth).expect(200);
    expect(history.body).toHaveLength(2);
    expect(history.body[0]).toMatchObject({ trigger: 'nightly' });
  });

  it('accepts a large backup (a few years of payments)', async () => {
    const many = Array.from({ length: 5000 }, (_, i) => txn(i + 1));
    const res = await api().post('/api/backups').set(auth).send(backup(many, { deviceId: 'device-bbbb-2222' })).expect(201);
    expect(res.body.counts.txns).toBe(5000);
  }, 60_000);

  it('returns 404 for an unknown device', async () => {
    await api().get('/api/devices/nope-nope-nope/snapshot').set(auth).expect(404);
  });
});
