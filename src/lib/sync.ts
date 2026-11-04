import { PermissionsAndroid, Platform } from 'react-native';

import { listSenders, readInbox } from '../../modules/sms-reader';
import { detectBanks, normalizeSender } from './banks';
import { categorize, NEEDS_CHECK_CATEGORIES } from './categories';
import {
  cardTxnsBetween,
  getSetting,
  insertSms,
  insertTxn,
  linkSmsToTxn,
  listRules,
  recategorizeUnlocked,
  setSetting,
  updateTxn,
  getDb,
  getTxn,
} from './db';
import { askAboutNewPayments } from './notify';
import { bankForSender, parseSms, type ParsedCancel } from './parsers';
import { CANCEL_LOOKBACK_MS, findCancelTarget, findPossibleHolds } from './reconcile';
import { allSenders, loadSettings, ownNames, saveSettings, sendersFor, type AppSettings } from './settings';
import { notifyDataChanged } from './store';
import type { Txn } from './types';

const DAY = 24 * 60 * 60 * 1000;

export async function hasSmsPermission(): Promise<boolean> {
  if (Platform.OS !== 'android') return false;
  return PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.READ_SMS);
}

export async function requestSmsPermission(): Promise<boolean> {
  if (Platform.OS !== 'android') return false;
  const result = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.READ_SMS, {
    title: 'Read bank SMS',
    message:
      'Dr. Tax reads SMS from your banks (Sampath, ComBank, People\'s Bank) to record your payments. ' +
      'Messages stay on this phone. Other SMS are ignored.',
    buttonPositive: 'Allow',
    buttonNegative: 'Not now',
  });
  return result === PermissionsAndroid.RESULTS.GRANTED;
}

export type SyncResult = {
  scanned: number;
  added: number;
  cancelled: number;
  holds: number;
  autoConfirmed: number;
  unsorted: number;
};

let running: Promise<SyncResult> | null = null;

/** Imports new bank SMS, applies cancellations, flags holds and auto-confirms old card purchases. */
export function syncSms(): Promise<SyncResult> {
  if (!running) {
    running = doSync().finally(() => {
      running = null;
    });
  }
  return running;
}

async function doSync(): Promise<SyncResult> {
  const settings = await learnSenders(await loadSettings());
  const rules = await listRules();
  const names = ownNames(settings);
  const senderMap = sendersFor(settings);
  const lastDate = Number((await getSetting('last_sms_date')) ?? '0');
  // Re-read a little overlap; already-imported messages are skipped by their Android id.
  const since = lastDate > 0 ? lastDate - 2 * DAY : 0;
  const messages = await readInbox(since, allSenders(settings));

  let added = 0;
  const unsorted: Txn[] = [];
  let cancelled = 0;
  let maxDate = lastDate;

  for (const m of messages) {
    maxDate = Math.max(maxDate, m.date);
    const bank = bankForSender(m.address, senderMap);
    if (!bank) continue;
    const parsed = parseSms(bank, m.body, m.date);

    const smsId = await insertSms({
      androidId: m.id,
      sender: m.address,
      bank,
      // Never keep one-time codes.
      body: parsed.kind === 'otp' ? '[One-time code message — hidden by Dr. Tax]' : m.body,
      receivedAt: m.date,
      kind: parsed.kind,
    });
    if (smsId == null) continue; // already imported

    if (parsed.kind === 'txn') {
      const txnId = await insertTxn({
        sms_id: smsId,
        bank,
        account: parsed.account,
        direction: parsed.direction,
        amount_cents: parsed.amountCents,
        currency: parsed.currency,
        merchant: parsed.merchant,
        description: parsed.description,
        channel: parsed.channel,
        occurred_at: parsed.occurredAt,
        status: parsed.pending ? 'pending' : 'confirmed',
        category: categorize(parsed, rules, names),
        flag: parsed.confident ? null : 'low_confidence',
        note: null,
      });
      await linkSmsToTxn(smsId, txnId);
      added++;
      const saved = await getTxn(txnId);
      if (saved && NEEDS_CHECK_CATEGORIES.includes(saved.category)) unsorted.push(saved);
    } else if (parsed.kind === 'cancel') {
      const target = await applyCancel(parsed);
      if (target != null) {
        await linkSmsToTxn(smsId, target);
        cancelled++;
      }
    }
  }

  if (maxDate > lastDate) await setSetting('last_sms_date', String(maxDate));
  const holds = await flagHolds();
  const autoConfirmed = await autoConfirm(settings.autoConfirmDays);
  await setSetting('last_sync_at', String(Date.now()));

  notifyDataChanged();
  await askAboutNewPayments(unsorted, holds).catch((e) => console.warn('Notification failed', e));
  return { scanned: messages.length, added, cancelled, holds, autoConfirmed, unsorted: unsorted.length };
}

async function applyCancel(c: ParsedCancel): Promise<number | null> {
  const nearby = await cardTxnsBetween(c.occurredAt - CANCEL_LOOKBACK_MS, c.occurredAt + 60_000);
  const match = findCancelTarget(c, nearby);
  if (!match) return null;
  await updateTxn(match.targetId, {
    status: 'cancelled',
    flag: match.ambiguous ? 'check_cancel' : null,
  });
  return match.targetId;
}

async function flagHolds(): Promise<number> {
  const cards = await cardTxnsBetween(0, Number.MAX_SAFE_INTEGER);
  const pairs = findPossibleHolds(cards);
  for (const p of pairs) {
    await updateTxn(p.holdId, { flag: 'possible_hold', linked_txn_id: p.keptId });
  }
  return pairs.length;
}

async function autoConfirm(days: number): Promise<number> {
  if (days <= 0) return 0;
  const db = await getDb();
  const r = await db.runAsync(
    "UPDATE txns SET status = 'confirmed' WHERE status = 'pending' AND flag IS NULL AND occurred_at < ?",
    Date.now() - days * DAY,
  );
  return r.changes;
}

/** Re-runs categorisation on everything you haven't set by hand (after adding a rule or name). */
export async function reapplyCategories(): Promise<number> {
  const settings = await loadSettings();
  const rules = await listRules();
  const names = ownNames(settings);
  const changed = await recategorizeUnlocked((t) => categorize(t, rules, names));
  notifyDataChanged();
  return changed;
}

/** Reads the whole inbox again. Already-imported messages are skipped, so nothing is duplicated. */
export async function rescanInbox(): Promise<SyncResult> {
  await setSetting('last_sms_date', '0');
  return syncSms();
}

/**
 * Adds sender IDs from your inbox that belong to banks you use (e.g. a new "SAMPATHBANK" ID),
 * so their SMS are read too. Banks you haven't added are left alone.
 */
export async function learnSenders(settings: AppSettings): Promise<AppSettings> {
  if (settings.banks.length === 0) return settings;
  let found: { address: string; count: number }[] = [];
  try {
    found = await listSenders(80);
  } catch {
    return settings; // no SMS permission yet
  }
  let changed = false;
  const senders = { ...settings.senders };
  for (const d of detectBanks(found)) {
    if (!settings.banks.includes(d.bank.id)) continue;
    const known = new Set([...d.bank.senders, ...(senders[d.bank.id] ?? [])].map(normalizeSender));
    const fresh = d.senders.filter((x) => !known.has(normalizeSender(x)));
    if (fresh.length) {
      senders[d.bank.id] = [...(senders[d.bank.id] ?? []), ...fresh];
      changed = true;
    }
  }
  if (!changed) return settings;
  const next = { ...settings, senders };
  await saveSettings(next);
  return next;
}
