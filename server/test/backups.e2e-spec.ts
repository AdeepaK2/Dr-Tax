import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import { MongoMemoryServer } from 'mongodb-memory-server';
import request from 'supertest';
import type { App } from 'supertest/types.js';

import { AppModule } from '../src/app.module.js';
import { loadConfig } from '../src/config.js';
import { configureApp } from '../src/setup.js';

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
  let auth: { authorization: string };
  let otherAuth: { authorization: string };

  beforeAll(async () => {
    mongo = await MongoMemoryServer.create();
    const config = loadConfig({ JWT_SECRET: 'test-secret-0123456789abcdef', MONGODB_URI: mongo.getUri('drtax-test') });
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

  // ---- accounts ----
  it('creates an account and returns a login token', async () => {
    const res = await api()
      .post('/api/auth/register')
      .send({ email: 'Adeepa@Example.com', password: 'correct horse 1', name: 'Adeepa' })
      .expect(201);
    expect(res.body.user).toMatchObject({ email: 'adeepa@example.com', name: 'Adeepa' });
    expect(res.body.user.passwordHash).toBeUndefined();
    expect(typeof res.body.token).toBe('string');
    auth = { authorization: `Bearer ${res.body.token}` };
  });

  it('refuses a duplicate email, a short password and a bad email', async () => {
    await api().post('/api/auth/register').send({ email: 'adeepa@example.com', password: 'another pass', name: 'X' }).expect(409);
    await api().post('/api/auth/register').send({ email: 'new@example.com', password: 'short', name: 'X' }).expect(400);
    await api().post('/api/auth/register').send({ email: 'not-an-email', password: 'long enough', name: 'X' }).expect(400);
  });

  it('signs in with the right password only', async () => {
    const ok = await api().post('/api/auth/login').send({ email: 'ADEEPA@example.com', password: 'correct horse 1' }).expect(200);
    expect(ok.body.user.name).toBe('Adeepa');
    const bad = await api().post('/api/auth/login').send({ email: 'adeepa@example.com', password: 'wrong password' }).expect(401);
    const unknown = await api().post('/api/auth/login').send({ email: 'nobody@example.com', password: 'wrong password' }).expect(401);
    // Same message either way, so emails can't be discovered.
    expect(bad.body.message).toBe(unknown.body.message);
  });

  it('saves and returns the profile', async () => {
    const profile = { ownNames: ['Adeepa', 'GGAS KULARATHNA'], accounts: [{ bank: 'sampath', last4: '5375' }] };
    await api().put('/api/me').set(auth).send({ name: 'Adeepa K', profile }).expect(200);
    const me = await api().get('/api/me').set(auth).expect(200);
    expect(me.body).toMatchObject({ name: 'Adeepa K', profile });
  });

  it('rejects requests without a valid sign-in', async () => {
    await api().get('/api/devices').expect(401);
    await api().get('/api/devices').set('authorization', 'Bearer not-a-real-token').expect(401);
    await api().get('/api/me').set('x-api-key', 'old-style-key').expect(401);
  });

  // ---- backups ----
  it('rejects malformed backups', async () => {
    await api().post('/api/backups').set(auth).send({ deviceId: DEVICE, txns: [{ localId: 'x' }], sms: [], rules: [], settings: {} }).expect(400);
    await api().post('/api/backups').set(auth).send({ deviceId: 'bad id!', txns: [], sms: [], rules: [], settings: {} }).expect(400);
  });

  it('stores a nightly backup', async () => {
    const res = await api().post('/api/backups').set(auth).send(backup([txn(1), txn(2, { amountCents: 150000 })])).expect(201);
    expect(res.body.counts).toEqual({ txns: 2, sms: 2, rules: 1, removedTxns: 0, removedSms: 0 });
  });

  it('a second backup updates in place, and marks payments deleted on the phone', async () => {
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
  });

  it('refuses to overwrite a backup with an empty one unless asked', async () => {
    await api().post('/api/backups').set(auth).send(backup([])).expect(409);
    const snap = await api().get(`/api/devices/${DEVICE}/snapshot`).set(auth).expect(200);
    expect(snap.body.txns).toHaveLength(2);
  });

  // ---- privacy between people ----
  it("keeps each person's data private, even with the same phone id", async () => {
    const res = await api().post('/api/auth/register').send({ email: 'kasun@example.com', password: 'another person', name: 'Kasun' }).expect(201);
    otherAuth = { authorization: `Bearer ${res.body.token}` };
    // The other person sees nothing of Adeepa's.
    expect((await api().get('/api/devices').set(otherAuth).expect(200)).body).toEqual([]);
    await api().get(`/api/devices/${DEVICE}/snapshot`).set(otherAuth).expect(404);
    expect((await api().get('/api/backups').set(otherAuth).expect(200)).body).toEqual([]);
    // Even backing up under the same device id doesn't touch Adeepa's data.
    await api().post('/api/backups').set(otherAuth).send(backup([txn(1, { merchant: 'Kasun shop' })])).expect(201);
    const mine = await api().get(`/api/devices/${DEVICE}/snapshot`).set(auth).expect(200);
    expect(mine.body.txns.map((t: { merchant: string }) => t.merchant)).toEqual(['Vishwa', 'Kasun']);
    const theirs = await api().get(`/api/devices/${DEVICE}/snapshot`).set(otherAuth).expect(200);
    expect(theirs.body.txns.map((t: { merchant: string }) => t.merchant)).toEqual(['Kasun shop']);
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

  it('accepts a backup sent in several parts (for hosts with a request size cap)', async () => {
    const dev = 'device-cccc-3333';
    await api().post('/api/backups').set(auth).send(backup([txn(1), txn(2), txn(3)], { deviceId: dev })).expect(201);
    const sessionId = 'sess-0001-abcd';
    const p0 = await api()
      .post('/api/backups')
      .set(auth)
      .send(backup([txn(1), txn(2)], { deviceId: dev, sessionId, part: 0, final: false, rules: [], settings: {} }))
      .expect(201);
    expect(p0.body.partial).toBe(true);
    let snap = await api().get(`/api/devices/${dev}/snapshot`).set(auth).expect(200);
    expect(snap.body.txns.map((t: { localId: number }) => t.localId)).toEqual([1, 2, 3]);

    const p1 = await api()
      .post('/api/backups')
      .set(auth)
      .send({ ...backup([txn(4)], { deviceId: dev, sessionId, part: 1, final: true }), sms: [sms(1), sms(2), sms(4)] })
      .expect(201);
    expect(p1.body.partial).toBeUndefined();
    expect(p1.body.counts).toMatchObject({ txns: 3, removedTxns: 1 });
    snap = await api().get(`/api/devices/${dev}/snapshot`).set(auth).expect(200);
    expect(snap.body.txns.map((t: { localId: number }) => t.localId)).toEqual([1, 2, 4]);
  });

  it('an empty non-final part is not treated as wiping the backup', async () => {
    await api().post('/api/backups').set(auth).send(backup([], { sessionId: 'sess-0002-abcd', part: 1, final: false })).expect(201);
  });

  it('pages the restore snapshot', async () => {
    const dev = 'device-bbbb-2222';
    const p0 = await api().get(`/api/devices/${dev}/snapshot?page=0&pageSize=2000`).set(auth).expect(200);
    expect(p0.body).toMatchObject({ page: 0, txnsTotal: 5000, hasMore: true });
    expect(p0.body.txns).toHaveLength(2000);
    const p2 = await api().get(`/api/devices/${dev}/snapshot?page=2&pageSize=2000`).set(auth).expect(200);
    expect(p2.body.txns).toHaveLength(1000);
    expect(p2.body.hasMore).toBe(false);
    expect(p2.body.txns[0].localId).toBe(4001);
  });

  it('returns 404 for an unknown device', async () => {
    await api().get('/api/devices/nope-nope-nope/snapshot').set(auth).expect(404);
  });
});
