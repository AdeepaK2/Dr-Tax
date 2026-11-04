import { parseAmountToCents } from './money';
import type { BankId, Channel, Direction } from './types';

export type ParsedTxn = {
  kind: 'txn';
  direction: Direction;
  amountCents: number;
  currency: string;
  account: string | null;
  merchant: string;
  description: string;
  channel: Channel;
  occurredAt: number;
  /** Card authorisations start as pending; account debits/credits are final. */
  pending: boolean;
  /** false when the generic fallback parser was used. */
  confident: boolean;
};

export type ParsedCancel = {
  kind: 'cancel';
  merchant: string;
  card: string;
  occurredAt: number;
};

export type ParsedSms =
  | ParsedTxn
  | ParsedCancel
  | { kind: 'otp' }
  | { kind: 'alert' }
  | { kind: 'unknown' };

const AMOUNT = '([\\d,]+(?:\\.\\d{1,2})?)';

// ---------- Sampath Bank (SAMPATHTXN) ----------
// LKR 4,000.00 debited from AC **5375 for CEFTLV-01-9003...-0 26/09/2026 22:38:38 To Inq Call ...
// LKR 5,000.00 credited to AC **5375 for SI No ROYAL COLLEGE UNION 01/10/2026 06:04:20 ...
const SAMPATH_TXN = new RegExp(
  `([A-Z]{3})\\s*${AMOUNT}\\s+(debited|credited)\\s+(?:from|to)\\s+A\\/?C\\s*[*xX]*\\s*(\\d+)\\s+for\\s+([\\s\\S]+?)\\s+(\\d{2})\\/(\\d{2})\\/(\\d{4})\\s+(\\d{1,2}):(\\d{2})(?::(\\d{2}))?`,
  'i',
);

function parseSampath(body: string): ParsedTxn | null {
  const m = body.match(SAMPATH_TXN);
  if (!m) return null;
  const [, currency, amount, verb, account, rawDesc, dd, mm, yyyy, hh, mi, ss] = m;
  const description = squash(rawDesc);
  const { merchant, channel } = describeSampath(description);
  return {
    kind: 'txn',
    direction: verb.toLowerCase() === 'debited' ? 'debit' : 'credit',
    amountCents: parseAmountToCents(amount),
    currency: currency.toUpperCase(),
    account: `**${account}`,
    merchant,
    description,
    channel,
    occurredAt: new Date(+yyyy, +mm - 1, +dd, +hh, +mi, ss ? +ss : 0).getTime(),
    pending: false,
    confident: true,
  };
}

function describeSampath(desc: string): { merchant: string; channel: Channel } {
  const compact = desc.replace(/\s+/g, '');
  if (/^CEFT/i.test(compact)) return { merchant: 'CEFT transfer', channel: 'transfer' };
  let m = desc.match(/^SI\s+No\.?\s+(.+)$/i);
  if (m) return { merchant: titleCase(m[1]), channel: 'standing_order' };
  m = desc.match(/^TFR\s+(.+?)\s*-\s*\d+$/i) ?? desc.match(/^TFR\s+(.+)$/i);
  if (m) return { merchant: titleCase(m[1]), channel: 'transfer' };
  if (/^\d{5,}$/.test(compact)) return { merchant: `Ref ${compact}`, channel: 'transfer' };
  return { merchant: titleCase(desc), channel: 'account' };
}

// ---------- Commercial Bank (COMBANK) ----------
// Dear Cardholder, Purchase at UBER 852 LK for LKR 3,149.45 on 22/10/26 10:32 AM has been authorised on your debit card ending #7405.
const COMBANK_CARD = new RegExp(
  `Purchase\\s+at\\s+([\\s\\S]+?)\\s+for\\s+([A-Z]{3})\\s*${AMOUNT}\\s+on\\s+(\\d{2})\\/(\\d{2})\\/(\\d{2,4})\\s+(\\d{1,2}):(\\d{2})\\s*(AM|PM)?\\s+has\\s+been\\s+authori[sz]ed\\s+on\\s+your\\s+(?:debit|credit)\\s+card\\s+ending\\s*#?\\s*(\\d{4})`,
  'i',
);
// Credit for Rs. 500,000.00 to 8014186987 at 16:55 at DIGITAL BANKING DIVISION
// (Debit for Rs. ... from ... is the same shape.)
const COMBANK_ACCOUNT = new RegExp(
  `(Credit|Debit)\\s+for\\s+(?:Rs\\.?|LKR)\\s*${AMOUNT}\\s+(?:to|from)\\s+(?:A\\/?C\\s*)?([\\dXx*]+)\\s+at\\s+(\\d{1,2}):(\\d{2})\\s+at\\s+([\\s\\S]+?)\\.?\\s*$`,
  'i',
);
// YOUR TRANSACTION AT UBER ON YOUR CARD ENDING WITH 7405 HAS BEEN CANCELLED.
const CARD_CANCEL = /TRANSACTION\s+AT\s+([\s\S]+?)\s+ON\s+YOUR\s+CARD\s+ENDING\s+(?:WITH\s+)?#?(\d{4})\s+HAS\s+BEEN\s+(?:CANCELL?ED|REVERSED|VOIDED)/i;

function parseComBankCard(body: string): ParsedTxn | null {
  const m = body.match(COMBANK_CARD);
  if (!m) return null;
  const [, rawMerchant, currency, amount, dd, mm, yy, hh, mi, ampm, card] = m;
  const year = yy.length === 2 ? 2000 + +yy : +yy;
  const description = squash(rawMerchant);
  return {
    kind: 'txn',
    direction: 'debit',
    amountCents: parseAmountToCents(amount),
    currency: currency.toUpperCase(),
    account: `card ${card}`,
    merchant: cleanCardMerchant(description),
    description,
    channel: 'card',
    occurredAt: new Date(year, +mm - 1, +dd, to24h(+hh, ampm), +mi).getTime(),
    pending: true,
    confident: true,
  };
}

function parseComBankAccount(body: string, receivedAt: number): ParsedTxn | null {
  const m = body.trim().match(COMBANK_ACCOUNT);
  if (!m) return null;
  const [, verb, amount, account, hh, mi, place] = m;
  // The SMS only has a time, so take the date from when the SMS arrived.
  const received = new Date(receivedAt);
  const at = new Date(received.getFullYear(), received.getMonth(), received.getDate(), +hh, +mi);
  if (at.getTime() > receivedAt + 60_000) at.setDate(at.getDate() - 1); // e.g. 23:59 txn, SMS after midnight
  const description = squash(place);
  return {
    kind: 'txn',
    direction: verb.toLowerCase() === 'credit' ? 'credit' : 'debit',
    amountCents: parseAmountToCents(amount),
    currency: 'LKR',
    account,
    merchant: titleCase(description),
    description,
    channel: 'account',
    occurredAt: at.getTime(),
    pending: false,
    confident: true,
  };
}

function parseCardCancel(body: string, receivedAt: number): ParsedCancel | null {
  const m = body.match(CARD_CANCEL);
  if (!m) return null;
  return { kind: 'cancel', merchant: squash(m[1]), card: m[2], occurredAt: receivedAt };
}

// ---------- Messages to skip ----------
// "OTP for Merchant 'PAYHERE LTC' for LKR 1,050.00 is 757772"
// "... LKR 100,000.00 attempted. Please use code 357524 to approve."
// Sampath adds "Do not Share OTP" to every message, so look for an actual code.
const OTP =
  /(\b(?:OTP|one[\s-]?time\s+(?:password|code)|verification\s+code|code)\b[^\n]{0,80}?\b(?:is|:)\s*\d{4,8}\b)|(\buse\s+code\s+\d{4,8}\b)|(\battempted\b)/i;
const ALERT =
  /\b(log\s?-?in|logged|password|PIN\b|blocked|invalid|registered|activated|device|new\s+payee|limit\s+(?:changed|updated)|statement)\b/i;

// ---------- Generic fallback (People's Bank and new formats) ----------
const GENERIC_AMOUNT = /\b(LKR|Rs\.?|USD|EUR|GBP)\s*([\d,]+(?:\.\d{1,2})?)/i;
const DEBIT_WORDS = /\b(debited|debit|withdrawn|withdrawal|purchase[ds]?|paid|payment|deducted|spent|transferred|sent)\b/i;
const CREDIT_WORDS = /\b(credited|credit|deposited|deposit|received)\b/i;

function parseGeneric(body: string, receivedAt: number): ParsedTxn | null {
  const amountMatch = body.match(GENERIC_AMOUNT);
  if (!amountMatch) return null;
  const debitAt = body.search(DEBIT_WORDS);
  const creditAt = body.search(CREDIT_WORDS);
  if (debitAt < 0 && creditAt < 0) return null;
  const direction: Direction =
    debitAt >= 0 && (creditAt < 0 || debitAt < creditAt) ? 'debit' : 'credit';

  const currencyRaw = amountMatch[1].toUpperCase();
  const currency = currencyRaw.startsWith('RS') ? 'LKR' : currencyRaw;
  const account = body.match(/\b(?:A\/?C|AC|account|card)\s*(?:no\.?)?\s*(?:ending\s*(?:with)?\s*)?[#*xX]*\s*(\d{3,})/i);
  const merchantMatch = body.match(
    /\b(?:at|to|from|for)\s+([A-Za-z][A-Za-z0-9 &'.\-]{2,40}?)(?=\s+(?:on|at|for|from|ref|via|dated)\b|[.,;]|\s+\d|$)/i,
  );
  const merchant = merchantMatch && !/^(your|the|a\/c|ac|account)\b/i.test(merchantMatch[1])
    ? titleCase(merchantMatch[1])
    : 'Unknown';

  return {
    kind: 'txn',
    direction,
    amountCents: parseAmountToCents(amountMatch[2]),
    currency,
    account: account ? account[1] : null,
    merchant,
    description: squash(body).slice(0, 160),
    channel: /\bcard\b/i.test(body) ? 'card' : 'account',
    occurredAt: findDate(body) ?? receivedAt,
    pending: /\bauthori[sz]ed\b/i.test(body),
    confident: false,
  };
}

function findDate(body: string): number | null {
  const m = body.match(/\b(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4}|\d{2})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)?)?/i);
  if (!m) return null;
  const year = m[3].length === 2 ? 2000 + +m[3] : +m[3];
  const month = +m[2] - 1;
  if (month < 0 || month > 11) return null;
  const hours = m[4] ? to24h(+m[4], m[7]) : 12;
  return new Date(year, month, +m[1], hours, m[5] ? +m[5] : 0, m[6] ? +m[6] : 0).getTime();
}

// ---------- Entry point ----------
export function parseSms(bank: BankId, body: string, receivedAt: number): ParsedSms {
  const known =
    bank === 'sampath'
      ? parseSampath(body)
      : bank === 'combank'
        ? parseComBankCard(body) ?? parseComBankAccount(body, receivedAt)
        : null;
  if (known) return known;

  const cancel = parseCardCancel(body, receivedAt);
  if (cancel) return cancel;

  if (OTP.test(body)) return { kind: 'otp' };

  // Try every known format in case a bank reuses another bank's wording.
  const any = parseSampath(body) ?? parseComBankCard(body) ?? parseComBankAccount(body, receivedAt);
  if (any) return any;

  if (ALERT.test(body) && !GENERIC_AMOUNT.test(body)) return { kind: 'alert' };

  return parseGeneric(body, receivedAt) ?? (ALERT.test(body) ? { kind: 'alert' } : { kind: 'unknown' });
}

/** Works out which bank a sender ID belongs to. */
export function bankForSender(sender: string, senders: Partial<Record<BankId, string[]>>): BankId | null {
  const key = normalizeSender(sender);
  for (const bank of Object.keys(senders) as BankId[]) {
    if ((senders[bank] ?? []).some((s) => normalizeSender(s) === key)) return bank;
  }
  return null;
}

export function normalizeSender(s: string): string {
  return s.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

/** "UBER 852 LK" → "UBER" — used to match cancellations and repeated holds. */
/** Merchant names too generic to build a rule from ("CEFT transfer", "Ref 2670…"). */
export const GENERIC_MERCHANT_KEYS = new Set(['CEFT', 'REF', 'UNKNOWN', 'TFR', 'DIGITAL', 'TRANSFER', 'PAYMENT']);

export function merchantKey(merchant: string): string {
  const words = merchant.toUpperCase().replace(/[^A-Z0-9 ]/g, ' ').split(/\s+/).filter(Boolean);
  return words.find((w) => /[A-Z]/.test(w)) ?? '';
}

// ---------- helpers ----------
function squash(s: string): string {
  return s.replace(/\s+/g, ' ').trim();
}

function to24h(hours: number, ampm?: string): number {
  if (!ampm) return hours;
  const pm = ampm.toUpperCase() === 'PM';
  if (hours === 12) return pm ? 12 : 0;
  return pm ? hours + 12 : hours;
}

/** "UBER 852 LK" → "Uber 852", "PAYHERE LTC Kalutara LK" → "Payhere Ltc Kalutara" */
function cleanCardMerchant(raw: string): string {
  return titleCase(raw.replace(/\s+[A-Z]{2}$/, ''));
}

function titleCase(s: string): string {
  return squash(s)
    .toLowerCase()
    .replace(/(^|[\s\-/(])([a-z])/g, (_, p, c) => p + c.toUpperCase());
}
