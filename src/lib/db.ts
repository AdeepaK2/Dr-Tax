import * as SQLite from 'expo-sqlite';

import { NEEDS_CHECK_CATEGORIES } from './categories';
import type { BankId, Rule, SmsKind, SmsRow, Txn, TxnStatus } from './types';

let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

export function getDb(): Promise<SQLite.SQLiteDatabase> {
  if (!dbPromise) dbPromise = open();
  return dbPromise;
}

const MIGRATIONS: string[] = [
  `
  CREATE TABLE IF NOT EXISTS sms (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    android_id TEXT NOT NULL UNIQUE,
    sender TEXT NOT NULL,
    bank TEXT NOT NULL,
    body TEXT NOT NULL,
    received_at INTEGER NOT NULL,
    kind TEXT NOT NULL,
    txn_id INTEGER
  );
  CREATE INDEX IF NOT EXISTS sms_received ON sms(received_at);

  CREATE TABLE IF NOT EXISTS txns (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sms_id INTEGER,
    bank TEXT NOT NULL,
    account TEXT,
    direction TEXT NOT NULL,
    amount_cents INTEGER NOT NULL,
    currency TEXT NOT NULL DEFAULT 'LKR',
    merchant TEXT NOT NULL,
    description TEXT NOT NULL,
    channel TEXT NOT NULL,
    occurred_at INTEGER NOT NULL,
    status TEXT NOT NULL,
    category TEXT NOT NULL,
    category_locked INTEGER NOT NULL DEFAULT 0,
    flag TEXT,
    linked_txn_id INTEGER,
    reviewed INTEGER NOT NULL DEFAULT 0,
    note TEXT,
    created_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS txns_occurred ON txns(occurred_at);

  CREATE TABLE IF NOT EXISTS rules (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    pattern TEXT NOT NULL,
    category TEXT NOT NULL,
    created_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
  `,
  // 2: find the same SMS again after a restore onto a new phone (Android ids differ there).
  `CREATE INDEX IF NOT EXISTS sms_sender_time ON sms(sender, received_at);`,
];

async function open() {
  const db = await SQLite.openDatabaseAsync('drtax.db');
  await db.execAsync('PRAGMA journal_mode = WAL;');
  const row = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  let version = row?.user_version ?? 0;
  while (version < MIGRATIONS.length) {
    await db.execAsync(MIGRATIONS[version]);
    version++;
    await db.execAsync(`PRAGMA user_version = ${version}`);
  }
  return db;
}

// ---------- settings ----------
export async function getSetting(key: string): Promise<string | null> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ value: string }>('SELECT value FROM settings WHERE key = ?', key);
  return row?.value ?? null;
}

export async function setSetting(key: string, value: string): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
    key,
    value,
  );
}

// ---------- sms ----------
/** Returns the new row id, or null when this SMS was already imported. */
export async function insertSms(s: {
  androidId: string;
  sender: string;
  bank: BankId;
  body: string;
  receivedAt: number;
  kind: SmsKind;
}): Promise<number | null> {
  const db = await getDb();
  // Same message already stored under another Android id (e.g. restored from a backup).
  const twin = await db.getFirstAsync<{ id: number }>(
    'SELECT id FROM sms WHERE sender = ? AND received_at = ? AND body = ?',
    s.sender,
    s.receivedAt,
    s.body,
  );
  if (twin) return null;
  const r = await db.runAsync(
    'INSERT OR IGNORE INTO sms (android_id, sender, bank, body, received_at, kind) VALUES (?, ?, ?, ?, ?, ?)',
    s.androidId,
    s.sender,
    s.bank,
    s.body,
    s.receivedAt,
    s.kind,
  );
  return r.changes > 0 ? r.lastInsertRowId : null;
}

export async function linkSmsToTxn(smsId: number, txnId: number) {
  const db = await getDb();
  await db.runAsync('UPDATE sms SET txn_id = ? WHERE id = ?', txnId, smsId);
}

export async function listSms(kind?: SmsKind): Promise<SmsRow[]> {
  const db = await getDb();
  return kind
    ? db.getAllAsync<SmsRow>('SELECT * FROM sms WHERE kind = ? ORDER BY received_at DESC LIMIT 500', kind)
    : db.getAllAsync<SmsRow>('SELECT * FROM sms ORDER BY received_at DESC LIMIT 500');
}

export async function getSms(id: number): Promise<SmsRow | null> {
  const db = await getDb();
  return db.getFirstAsync<SmsRow>('SELECT * FROM sms WHERE id = ?', id);
}

export async function smsCounts(): Promise<Record<SmsKind, number>> {
  const db = await getDb();
  const rows = await db.getAllAsync<{ kind: SmsKind; n: number }>('SELECT kind, COUNT(*) AS n FROM sms GROUP BY kind');
  const out: Record<SmsKind, number> = { txn: 0, cancel: 0, otp: 0, alert: 0, unknown: 0 };
  for (const r of rows) out[r.kind] = r.n;
  return out;
}

// ---------- transactions ----------
export type NewTxn = Omit<Txn, 'id' | 'created_at' | 'linked_txn_id' | 'reviewed' | 'category_locked'> & {
  category_locked?: number;
  reviewed?: number;
};

export async function insertTxn(t: NewTxn): Promise<number> {
  const db = await getDb();
  const r = await db.runAsync(
    `INSERT INTO txns (sms_id, bank, account, direction, amount_cents, currency, merchant, description, channel,
      occurred_at, status, category, category_locked, flag, reviewed, note, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    t.sms_id,
    t.bank,
    t.account,
    t.direction,
    t.amount_cents,
    t.currency,
    t.merchant,
    t.description,
    t.channel,
    t.occurred_at,
    t.status,
    t.category,
    t.category_locked ?? 0,
    t.flag,
    t.reviewed ?? 0,
    t.note,
    Date.now(),
  );
  return r.lastInsertRowId;
}

export async function getTxn(id: number): Promise<Txn | null> {
  const db = await getDb();
  return db.getFirstAsync<Txn>('SELECT * FROM txns WHERE id = ?', id);
}

export type UpdatableTxn = Partial<
  Pick<Txn, 'status' | 'category' | 'category_locked' | 'flag' | 'linked_txn_id' | 'reviewed' | 'note' | 'merchant'>
>;

export async function updateTxn(id: number, patch: UpdatableTxn): Promise<void> {
  const keys = Object.keys(patch) as (keyof UpdatableTxn)[];
  if (keys.length === 0) return;
  const db = await getDb();
  await db.runAsync(
    `UPDATE txns SET ${keys.map((k) => `${k} = ?`).join(', ')} WHERE id = ?`,
    ...keys.map((k) => patch[k] ?? null),
    id,
  );
}

export async function deleteTxn(id: number) {
  const db = await getDb();
  await db.runAsync('DELETE FROM txns WHERE id = ?', id);
}

export type TxnFilter = {
  from?: number;
  to?: number;
  bank?: BankId;
  category?: string;
  status?: TxnStatus;
  search?: string;
};

export async function listTxns(f: TxnFilter = {}, limit = 1000): Promise<Txn[]> {
  const where: string[] = [];
  const params: (string | number)[] = [];
  const add = (clause: string, value: string | number) => {
    where.push(clause);
    params.push(value);
  };
  if (f.from != null) add('occurred_at >= ?', f.from);
  if (f.to != null) add('occurred_at < ?', f.to);
  if (f.bank) add('bank = ?', f.bank);
  if (f.category) add('category = ?', f.category);
  if (f.status) add('status = ?', f.status);
  if (f.search) {
    where.push('(merchant LIKE ? OR description LIKE ? OR note LIKE ?)');
    const like = `%${f.search}%`;
    params.push(like, like, like);
  }
  const db = await getDb();
  return db.getAllAsync<Txn>(
    `SELECT * FROM txns ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY occurred_at DESC LIMIT ${limit}`,
    params,
  );
}

/** Card purchases near a time, used to match cancellations and holds. */
export async function cardTxnsBetween(from: number, to: number): Promise<Txn[]> {
  const db = await getDb();
  return db.getAllAsync<Txn>(
    "SELECT * FROM txns WHERE channel = 'card' AND occurred_at >= ? AND occurred_at <= ? ORDER BY occurred_at",
    from,
    to,
  );
}

const NEEDS_CHECK_SQL = NEEDS_CHECK_CATEGORIES.map((c) => `'${c}'`).join(', ');

// Needs a look when: a cancellation may have hit the wrong charge, or an active transaction is
// still pending, has a warning, or has a guessed category you haven't confirmed.
const REVIEW_WHERE = `(
  flag = 'check_cancel'
  OR (status NOT IN ('cancelled', 'excluded', 'hold')
      AND (status = 'pending' OR flag IS NOT NULL
           OR (category IN (${NEEDS_CHECK_SQL}) AND category_locked = 0)))
)`;

/** Everything you still need to look at. */
export async function listReviewQueue(): Promise<Txn[]> {
  const db = await getDb();
  return db.getAllAsync<Txn>(`SELECT * FROM txns WHERE ${REVIEW_WHERE} ORDER BY occurred_at DESC`);
}

export async function reviewCount(): Promise<number> {
  const db = await getDb();
  const r = await db.getFirstAsync<{ n: number }>(`SELECT COUNT(*) AS n FROM txns WHERE ${REVIEW_WHERE}`);
  return r?.n ?? 0;
}

/** Marks every pending card purchase without a warning as confirmed. */
export async function confirmAllPending(): Promise<number> {
  const db = await getDb();
  const r = await db.runAsync(
    "UPDATE txns SET status = 'confirmed', reviewed = 1 WHERE status = 'pending' AND flag IS NULL",
  );
  return r.changes;
}

/** The original SMS plus any cancellation SMS linked to this transaction. */
export async function smsForTxn(txn: Txn): Promise<SmsRow[]> {
  const db = await getDb();
  return db.getAllAsync<SmsRow>(
    'SELECT * FROM sms WHERE id = ? OR txn_id = ? ORDER BY received_at',
    txn.sms_id ?? -1,
    txn.id,
  );
}

/** Re-applies categories to everything you haven't set by hand. */
export async function recategorizeUnlocked(fn: (t: Txn) => string): Promise<number> {
  const db = await getDb();
  const rows = await db.getAllAsync<Txn>('SELECT * FROM txns WHERE category_locked = 0');
  let changed = 0;
  await db.withTransactionAsync(async () => {
    for (const t of rows) {
      const c = fn(t);
      if (c !== t.category) {
        await db.runAsync('UPDATE txns SET category = ? WHERE id = ?', c, t.id);
        changed++;
      }
    }
  });
  return changed;
}

// ---------- rules ----------
export async function listRules(): Promise<Rule[]> {
  const db = await getDb();
  return db.getAllAsync<Rule>('SELECT * FROM rules ORDER BY created_at DESC');
}

export async function addRule(pattern: string, category: string) {
  const db = await getDb();
  await db.runAsync('DELETE FROM rules WHERE UPPER(pattern) = UPPER(?)', pattern);
  await db.runAsync('INSERT INTO rules (pattern, category, created_at) VALUES (?, ?, ?)', pattern, category, Date.now());
}

export async function deleteRule(id: number) {
  const db = await getDb();
  await db.runAsync('DELETE FROM rules WHERE id = ?', id);
}

// ---------- backup / restore ----------
export async function listAllTxns(): Promise<Txn[]> {
  const db = await getDb();
  return db.getAllAsync<Txn>('SELECT * FROM txns ORDER BY id');
}

export async function listAllSms(): Promise<SmsRow[]> {
  const db = await getDb();
  return db.getAllAsync<SmsRow>('SELECT * FROM sms ORDER BY id');
}

/** Replaces all payments, SMS and rules with the given rows, keeping their ids. All or nothing. */
export async function replaceAllData(data: { txns: Txn[]; sms: SmsRow[]; rules: Rule[] }): Promise<void> {
  const db = await getDb();
  await db.withExclusiveTransactionAsync(async (tx) => {
    await tx.execAsync('DELETE FROM txns; DELETE FROM sms; DELETE FROM rules;');
    for (const t of data.txns) {
      await tx.runAsync(
        `INSERT INTO txns (id, sms_id, bank, account, direction, amount_cents, currency, merchant, description, channel,
          occurred_at, status, category, category_locked, flag, linked_txn_id, reviewed, note, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        t.id, t.sms_id, t.bank, t.account, t.direction, t.amount_cents, t.currency, t.merchant, t.description, t.channel,
        t.occurred_at, t.status, t.category, t.category_locked, t.flag, t.linked_txn_id, t.reviewed, t.note, t.created_at,
      );
    }
    for (const m of data.sms) {
      await tx.runAsync(
        'INSERT INTO sms (id, android_id, sender, bank, body, received_at, kind, txn_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        m.id, m.android_id, m.sender, m.bank, m.body, m.received_at, m.kind, m.txn_id,
      );
    }
    for (const r of data.rules) {
      await tx.runAsync('INSERT INTO rules (id, pattern, category, created_at) VALUES (?, ?, ?, ?)', r.id, r.pattern, r.category, r.created_at);
    }
  });
}

// ---------- danger zone ----------
export async function wipeAll() {
  const db = await getDb();
  await db.execAsync('DELETE FROM txns; DELETE FROM sms; DELETE FROM rules; DELETE FROM settings;');
}
