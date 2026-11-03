import { getSetting, listAllSms, listAllTxns, listRules, replaceAllData, setSetting } from './db';
import { loadSettings, saveSettings, type AppSettings } from './settings';
import { notifyDataChanged } from './store';
import type { BankId, Rule, SmsKind, SmsRow, Txn, TxnFlag, TxnStatus } from './types';

/**
 * Backs up everything to your Dr. Tax server (server/ folder: NestJS + MongoDB).
 * Runs once a night from the background task, and whenever you tap "Back up now".
 */

export type BackupConfig = {
  /** e.g. http://192.168.1.20:3000 or https://drtax.example.com */
  serverUrl: string;
  /** Kept on the phone only. Never included in the uploaded data. */
  apiKey: string;
  /** Identifies this phone's data on the server. */
  deviceId: string;
  deviceName: string;
  nightly: boolean;
};

export type BackupStatus = { at: number; ok: boolean; message: string; trigger: Trigger };
type Trigger = 'nightly' | 'manual';

const CONFIG_KEY = 'backup_config';
const STATUS_KEY = 'backup_status';
const LAST_OK_KEY = 'backup_last_ok';
const APP_VERSION = '1.0.0';
const HOUR = 60 * 60 * 1000;

function newDeviceId() {
  const rand = () => Math.random().toString(36).slice(2, 10);
  return `drtax-${rand()}-${rand()}`;
}

export async function getBackupConfig(): Promise<BackupConfig> {
  const raw = await getSetting(CONFIG_KEY);
  const saved = raw ? (JSON.parse(raw) as Partial<BackupConfig>) : {};
  const config: BackupConfig = {
    serverUrl: '',
    apiKey: '',
    deviceName: 'My phone',
    nightly: true,
    ...saved,
    deviceId: saved.deviceId || newDeviceId(),
  };
  if (!saved.deviceId) await setSetting(CONFIG_KEY, JSON.stringify(config));
  return config;
}

export async function saveBackupConfig(c: BackupConfig): Promise<void> {
  await setSetting(CONFIG_KEY, JSON.stringify({ ...c, serverUrl: c.serverUrl.trim().replace(/\/+$/, '') }));
}

export async function getBackupStatus(): Promise<BackupStatus | null> {
  const raw = await getSetting(STATUS_KEY);
  return raw ? (JSON.parse(raw) as BackupStatus) : null;
}

async function setStatus(s: BackupStatus) {
  await setSetting(STATUS_KEY, JSON.stringify(s));
  if (s.ok) await setSetting(LAST_OK_KEY, String(s.at));
  notifyDataChanged();
}

/** True for http:// to a server outside your home network, where the key would travel unencrypted. */
export function isInsecureUrl(url: string): boolean {
  const m = url.trim().match(/^http:\/\/([^/:]+)/i);
  if (!m) return false;
  const host = m[1];
  return !/^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|[\w-]+\.local$)/i.test(host);
}

// ---------- HTTP ----------
class BackupError extends Error {}

async function call<T>(c: BackupConfig, path: string, init: { method?: string; body?: unknown; timeoutMs?: number } = {}): Promise<T> {
  if (!c.serverUrl) throw new BackupError('Add your server address first.');
  const base = c.serverUrl.replace(/\/+$/, '').replace(/\/api$/, '');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), init.timeoutMs ?? 60_000);
  try {
    const res = await fetch(`${base}/api${path}`, {
      method: init.method ?? 'GET',
      headers: { 'content-type': 'application/json', 'x-api-key': c.apiKey },
      body: init.body ? JSON.stringify(init.body) : undefined,
      signal: controller.signal,
    });
    const text = await res.text();
    const json = text ? JSON.parse(text) : null;
    if (!res.ok) {
      const msg = Array.isArray(json?.message) ? json.message.join('; ') : json?.message;
      if (res.status === 401) throw new BackupError('Wrong API key.');
      throw new BackupError(`Server said ${res.status}: ${msg ?? res.statusText}`);
    }
    return json as T;
  } catch (e) {
    if (e instanceof BackupError) throw e;
    if ((e as Error).name === 'AbortError') throw new BackupError('The server took too long to answer.');
    throw new BackupError(`Can’t reach the server (${(e as Error).message}). Check the address and that the phone is online.`);
  } finally {
    clearTimeout(timer);
  }
}

export async function testConnection(c: BackupConfig): Promise<string> {
  const health = await call<{ ok: boolean; db: string }>(c, '/health', { timeoutMs: 15_000 });
  if (!health.ok) return 'Server is up, but its database is down.';
  const devices = await call<{ deviceId: string }[]>(c, '/devices', { timeoutMs: 15_000 });
  return `Connected. The server has backups from ${devices.length} phone${devices.length === 1 ? '' : 's'}.`;
}

// ---------- Backup ----------
type BackupResult = { receivedAt: string; counts: { txns: number; sms: number; rules: number; removedTxns: number } };

function settingsForUpload(s: AppSettings) {
  // Only app preferences. The server address and API key live under a separate key.
  return { ...s };
}

export async function backupNow(trigger: Trigger = 'manual', at = Date.now()): Promise<BackupStatus> {
  const c = await getBackupConfig();
  try {
    const [txns, sms, rules, settings] = await Promise.all([listAllTxns(), listAllSms(), listRules(), loadSettings()]);
    if (txns.length === 0 && trigger === 'nightly') {
      const s: BackupStatus = { at, ok: true, message: 'Nothing to back up yet.', trigger };
      await setStatus(s);
      return s;
    }
    const result = await call<BackupResult>(c, '/backups', {
      method: 'POST',
      timeoutMs: 120_000,
      body: {
        deviceId: c.deviceId,
        deviceName: c.deviceName,
        appVersion: APP_VERSION,
        trigger,
        txns: txns.map(toTxnDto),
        sms: sms.map(toSmsDto),
        rules: rules.map((r) => ({ localId: r.id, pattern: r.pattern, category: r.category, createdAt: r.created_at })),
        settings: settingsForUpload(settings),
      },
    });
    const s: BackupStatus = {
      at,
      ok: true,
      trigger,
      message: `Backed up ${result.counts.txns} payments and ${result.counts.sms} bank SMS.`,
    };
    await setStatus(s);
    return s;
  } catch (e) {
    const s: BackupStatus = { at, ok: false, trigger, message: (e as Error).message };
    await setStatus(s);
    return s;
  }
}

/**
 * Called from the hourly background task and when the app opens. Backs up once a night
 * (midnight–6 AM), or straight away if the last good backup is more than 36 hours old
 * (e.g. the phone was off overnight).
 */
export async function maybeNightlyBackup(now = Date.now()): Promise<BackupStatus | null> {
  const c = await getBackupConfig();
  if (!c.nightly || !c.serverUrl || !c.apiKey) return null;
  const lastOk = Number((await getSetting(LAST_OK_KEY)) ?? '0');
  const lastTry = (await getBackupStatus())?.at ?? 0;
  const hour = new Date(now).getHours();
  const night = hour < 6 && now - lastOk > 12 * HOUR;
  const overdue = now - lastOk > 36 * HOUR;
  // After a failure, wait an hour before trying again.
  if (!(night || overdue) || now - lastTry < HOUR) return null;
  return backupNow('nightly', now);
}

// ---------- Restore ----------
export type ServerDevice = { deviceId: string; deviceName: string | null; lastBackupAt: string | null; txns: number };

export async function listServerDevices(): Promise<ServerDevice[]> {
  return call<ServerDevice[]>(await getBackupConfig(), '/devices', { timeoutMs: 30_000 });
}

type Snapshot = {
  deviceId: string;
  settings: Partial<AppSettings>;
  rules: { localId: number; pattern: string; category: string; createdAt: number }[];
  txns: TxnDto[];
  sms: SmsDto[];
};

/** Replaces this phone's data with a backup, then keeps backing up to that same record. */
export async function restoreFrom(deviceId: string): Promise<string> {
  const c = await getBackupConfig();
  const snap = await call<Snapshot>(c, `/devices/${encodeURIComponent(deviceId)}/snapshot`, { timeoutMs: 120_000 });
  await replaceAllData({
    txns: snap.txns.map(fromTxnDto),
    // Android SMS ids differ between phones; restored messages are matched by sender, time and text instead.
    sms: snap.sms.map((m) => ({ ...fromSmsDto(m), android_id: m.androidId.startsWith('r:') ? m.androidId : `r:${m.androidId}` })),
    rules: snap.rules.map((r): Rule => ({ id: r.localId, pattern: r.pattern, category: r.category, created_at: r.createdAt })),
  });
  if (snap.settings && Object.keys(snap.settings).length) {
    await saveSettings({ ...(await loadSettings()), ...snap.settings });
  }
  const latestSms = snap.sms.reduce((max, m) => Math.max(max, m.receivedAt), 0);
  if (latestSms) await setSetting('last_sms_date', String(latestSms));
  await saveBackupConfig({ ...c, deviceId });
  notifyDataChanged();
  return `Restored ${snap.txns.length} payments and ${snap.sms.length} bank SMS.`;
}

// ---------- row <-> server format ----------
type TxnDto = {
  localId: number;
  smsLocalId: number | null;
  bank: string;
  account: string | null;
  direction: 'debit' | 'credit';
  amountCents: number;
  currency: string;
  merchant: string;
  description: string;
  channel: string;
  occurredAt: number;
  status: string;
  category: string;
  categoryLocked: boolean;
  flag: string | null;
  linkedLocalId: number | null;
  reviewed: boolean;
  note: string | null;
  createdAt: number;
};
type SmsDto = {
  localId: number;
  androidId: string;
  sender: string;
  bank: string;
  body: string;
  receivedAt: number;
  kind: string;
  txnLocalId: number | null;
};

export function toTxnDto(t: Txn): TxnDto {
  return {
    localId: t.id,
    smsLocalId: t.sms_id,
    bank: t.bank,
    account: t.account,
    direction: t.direction,
    amountCents: t.amount_cents,
    currency: t.currency,
    merchant: t.merchant,
    description: t.description,
    channel: t.channel,
    occurredAt: t.occurred_at,
    status: t.status,
    category: t.category,
    categoryLocked: !!t.category_locked,
    flag: t.flag,
    linkedLocalId: t.linked_txn_id,
    reviewed: !!t.reviewed,
    note: t.note,
    createdAt: t.created_at,
  };
}

function fromTxnDto(t: TxnDto): Txn {
  return {
    id: t.localId,
    sms_id: t.smsLocalId,
    bank: t.bank as BankId,
    account: t.account,
    direction: t.direction,
    amount_cents: t.amountCents,
    currency: t.currency,
    merchant: t.merchant,
    description: t.description,
    channel: t.channel as Txn['channel'],
    occurred_at: t.occurredAt,
    status: t.status as TxnStatus,
    category: t.category,
    category_locked: t.categoryLocked ? 1 : 0,
    flag: t.flag as TxnFlag | null,
    linked_txn_id: t.linkedLocalId,
    reviewed: t.reviewed ? 1 : 0,
    note: t.note,
    created_at: t.createdAt,
  };
}

export function toSmsDto(m: SmsRow): SmsDto {
  return {
    localId: m.id,
    androidId: m.android_id,
    sender: m.sender,
    bank: m.bank,
    body: m.body,
    receivedAt: m.received_at,
    kind: m.kind,
    txnLocalId: m.txn_id,
  };
}

function fromSmsDto(m: SmsDto): SmsRow {
  return {
    id: m.localId,
    android_id: m.androidId,
    sender: m.sender,
    bank: m.bank as BankId,
    body: m.body,
    received_at: m.receivedAt,
    kind: m.kind as SmsKind,
    txn_id: m.txnLocalId,
  };
}
