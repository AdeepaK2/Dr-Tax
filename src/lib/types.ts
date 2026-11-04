import { bankInfo } from './banks';

/** A bank id from BANK_CATALOG (e.g. 'sampath'), or 'cash' for payments added by hand. */
export type BankId = string;
export type Direction = 'debit' | 'credit';
export type Channel = 'card' | 'account' | 'transfer' | 'standing_order' | 'manual';

/**
 * pending   – card authorisation, amount may still change or be released
 * confirmed – money actually moved
 * cancelled – bank sent a cancellation for it
 * hold      – temporary hold / pre-authorisation that never became a charge
 * excluded  – you chose to ignore it (duplicate, not relevant, ...)
 */
export type TxnStatus = 'pending' | 'confirmed' | 'cancelled' | 'hold' | 'excluded';

/** Why a transaction needs a second look. */
export type TxnFlag = 'possible_hold' | 'check_cancel' | 'low_confidence';

export type SmsKind = 'txn' | 'cancel' | 'otp' | 'alert' | 'unknown';

export type Txn = {
  id: number;
  sms_id: number | null;
  bank: BankId;
  account: string | null;
  direction: Direction;
  amount_cents: number;
  currency: string;
  merchant: string;
  description: string;
  channel: Channel;
  occurred_at: number;
  status: TxnStatus;
  category: string;
  category_locked: number;
  flag: TxnFlag | null;
  linked_txn_id: number | null;
  reviewed: number;
  note: string | null;
  created_at: number;
};

export type SmsRow = {
  id: number;
  android_id: string;
  sender: string;
  bank: BankId;
  body: string;
  received_at: number;
  kind: SmsKind;
  txn_id: number | null;
};

export type Rule = { id: number; pattern: string; category: string; created_at: number };

/** Display details for any bank id: BANKS[id].name / .short / .color. */
export const BANKS: Record<string, { name: string; short: string; color: string }> = new Proxy(
  {},
  { get: (_target, id) => bankInfo(String(id)) },
);

/** Statuses that count as money actually spent or received. */
export const COUNTED_STATUSES: TxnStatus[] = ['confirmed', 'pending'];
