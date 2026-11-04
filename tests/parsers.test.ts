import assert from 'node:assert/strict';
import { test } from 'node:test';

import { categorize } from '../src/lib/categories';
import { splitIntoParts } from '../src/lib/chunk';
import { parseSms, type ParsedTxn } from '../src/lib/parsers';
import { findCancelTarget, findPossibleHolds, type CardTxn } from '../src/lib/reconcile';
import { taxYearOf } from '../src/lib/taxYear';

const RECEIVED = new Date(2026, 9, 22, 12, 0).getTime();

function txn(bank: 'sampath' | 'combank' | 'peoples', body: string, receivedAt = RECEIVED): ParsedTxn {
  const r = parseSms(bank, body, receivedAt);
  assert.equal(r.kind, 'txn', `expected txn for: ${body}`);
  return r as ParsedTxn;
}

// ---- Sampath ----
test('Sampath CEFT debit (description wraps across lines)', () => {
  const t = txn(
    'sampath',
    'LKR 4,000.00 debited from AC **5375 for CEFTLV-01-900380030010-02-6\n995-03-0000-0\n26/09/2026 22:38:38\nTo Inq Call 0112303050\nGet protected -Do not Share OTP',
  );
  assert.equal(t.direction, 'debit');
  assert.equal(t.amountCents, 400000);
  assert.equal(t.account, '**5375');
  assert.equal(t.merchant, 'CEFT transfer');
  assert.equal(t.channel, 'transfer');
  assert.equal(t.pending, false);
  assert.equal(t.occurredAt, new Date(2026, 8, 26, 22, 38, 38).getTime());
});

test('Sampath standing-instruction credit', () => {
  const t = txn('sampath', 'LKR 5,000.00 credited to AC **5375 for SI No ROYAL COLLEGE UNION 01/10/2026 06:04:20 To Inq Call 0112303050');
  assert.equal(t.direction, 'credit');
  assert.equal(t.amountCents, 500000);
  assert.equal(t.merchant, 'Royal College Union');
  assert.equal(t.channel, 'standing_order');
});

test('Sampath transfer to a person', () => {
  const t = txn('sampath', 'LKR 2,850.00 debited from AC **5375 for TFR Vishwa -000088326017 03/10/2026 12:54:23');
  assert.equal(t.merchant, 'Vishwa');
  assert.equal(t.channel, 'transfer');
  assert.equal(t.amountCents, 285000);
});

test('Sampath transfer to own name is an own-account transfer', () => {
  const t = txn('sampath', 'LKR 2,525.00 debited from AC **5375 for Adeepa 04/10/2026 15:29:41 To Inq Call 0112303050 Get protected -Do not Share OTP');
  assert.equal(t.merchant, 'Adeepa');
  assert.equal(categorize({ ...t }, [], ['Adeepa']), 'transfer_self');
});

test('Sampath payment to a reference number', () => {
  const t = txn('sampath', 'LKR 24,525.00 debited from AC **5375 for 267029193 22/10/2026 09:49:21 To Inq Call 0112303050');
  assert.equal(t.merchant, 'Ref 267029193');
  assert.equal(t.amountCents, 2452500);
});

test('Sampath "Do not Share OTP" footer is not treated as an OTP', () => {
  const t = txn('sampath', 'LKR 1,001.00 debited from AC **5375 for CEFTLV-01-900050060010-02-6995-03-0000-0 09/10/2026 07:28:02 To Inq Call 0112303050 Get protected -Do not Share OTP');
  assert.equal(t.amountCents, 100100);
});

// ---- Commercial Bank ----
test('ComBank account credit takes the date from the SMS', () => {
  const received = new Date(2026, 9, 28, 16, 55, 30).getTime();
  const t = txn('combank', 'Credit for Rs. 500,000.00 to 8014186987 at 16:55 at DIGITAL BANKING DIVISION', received);
  assert.equal(t.direction, 'credit');
  assert.equal(t.amountCents, 50000000);
  assert.equal(t.account, '8014186987');
  assert.equal(t.merchant, 'Digital Banking Division');
  assert.equal(t.occurredAt, new Date(2026, 9, 28, 16, 55).getTime());
});

test('ComBank card purchase is pending with a 12-hour time', () => {
  const t = txn('combank', 'Dear Cardholder, Purchase at UBER 852 LK for LKR 316.27 on 30/10/26 03:40 PM has been authorised on your debit card ending #7405.');
  assert.equal(t.channel, 'card');
  assert.equal(t.pending, true);
  assert.equal(t.merchant, 'Uber 852');
  assert.equal(t.account, 'card 7405');
  assert.equal(t.amountCents, 31627);
  assert.equal(t.occurredAt, new Date(2026, 9, 30, 15, 40).getTime());
  assert.equal(categorize(t, [], []), 'transport');
});

test('ComBank card purchase with a multi-word merchant', () => {
  const t = txn('combank', 'Dear Cardholder, Purchase at A2B Veg Restaurant - OGF COLOMBO-03 LK for LKR 1,716.00 on 30/10/26 03:24 PM has been authorised on your debit card ending #7405.');
  assert.equal(t.amountCents, 171600);
  assert.equal(categorize(t, [], []), 'food');
  const p = txn('combank', 'Dear Cardholder, Purchase at PAYHERE LTC Kalutara LK for LKR 1,050.00 on 22/10/26 09:35 AM has been authorised on your debit card ending #7405.');
  assert.equal(p.occurredAt, new Date(2026, 9, 22, 9, 35).getTime());
  assert.equal(categorize(p, [], []), 'online');
});

test('ComBank cancellation', () => {
  const r = parseSms('combank', 'YOUR TRANSACTION AT UBER ON YOUR CARD ENDING WITH 7405 HAS BEEN CANCELLED.', RECEIVED);
  assert.deepEqual(r, { kind: 'cancel', merchant: 'UBER', card: '7405', occurredAt: RECEIVED });
});

test('OTP / approval-code messages are skipped', () => {
  assert.equal(parseSms('combank', "OTP for Merchant 'PAYHERE LTC' for LKR 1,050.00 is 757772", RECEIVED).kind, 'otp');
  assert.equal(
    parseSms('combank', 'ComBank Digital-Transfer to Other Banks LKR 100,000.00 attempted. Please use code 357524 to approve. Do NOT share this number with anyone. PbgqGoDg8jk', RECEIVED).kind,
    'otp',
  );
});

// ---- People's Bank ----
test("People's Bank login alerts are not transactions", () => {
  assert.equal(parseSms('peoples', "Dear MR GGAS KULARATHNA, Your attempt to log in to People's Pay App failed. For inquiries, Call us on 1961.", RECEIVED).kind, 'alert');
  assert.equal(parseSms('peoples', 'Hi Adeepa K, Too many invalid logins were detected & we have blocked your Peoples Pay. Reset your password or Call 1961.', RECEIVED).kind, 'alert');
});

test("People's Bank style debit goes through the fallback parser", () => {
  const t = txn('peoples', 'Dear Customer, your A/C 123456789 has been debited by Rs. 2,500.00 on 05/10/2026 for payment to DIALOG AXIATA. Call 1961');
  assert.equal(t.direction, 'debit');
  assert.equal(t.amountCents, 250000);
  assert.equal(t.confident, false);
  assert.equal(t.occurredAt, new Date(2026, 9, 5, 12, 0).getTime());
});

// ---- Reconciliation ----
function card(id: number, merchant: string, amount: number, at: Date, extra: Partial<CardTxn> = {}): CardTxn {
  return {
    id, merchant, description: merchant, account: 'card 7405', amount_cents: amount,
    occurred_at: at.getTime(), status: 'pending', flag: null, reviewed: 0, channel: 'card', ...extra,
  };
}

test('Uber cancel hits the authorisation before it, not the one after', () => {
  // 10:32 auth 3,149.45 → CANCELLED → 10:35 auth 3,085.32
  const txns = [card(1, 'Uber 852', 314945, new Date(2026, 9, 22, 10, 32)), card(2, 'Uber 852', 308532, new Date(2026, 9, 22, 10, 35))];
  const r = findCancelTarget({ merchant: 'UBER', card: '7405', occurredAt: new Date(2026, 9, 22, 10, 33).getTime() }, txns);
  assert.deepEqual(r, { targetId: 1, ambiguous: false });
});

test('Cancel is ambiguous when two Uber charges are close together', () => {
  const txns = [card(1, 'Uber 852', 31627, new Date(2026, 9, 30, 15, 40)), card(2, 'Uber 852', 31627, new Date(2026, 9, 30, 15, 44))];
  const r = findCancelTarget({ merchant: 'UBER', card: '7405', occurredAt: new Date(2026, 9, 30, 15, 50).getTime() }, txns);
  assert.deepEqual(r, { targetId: 2, ambiguous: true });
});

test('Repeated Uber charges minutes apart are flagged as a possible hold', () => {
  const txns = [
    card(1, 'Uber 852', 188381, new Date(2026, 9, 30, 13, 31)),
    card(2, 'A2b Veg Restaurant - Ogf Colombo-03', 171600, new Date(2026, 9, 30, 15, 24)),
    card(3, 'Uber 852', 31627, new Date(2026, 9, 30, 15, 40)),
    card(4, 'Uber 852', 31627, new Date(2026, 9, 30, 15, 44)),
  ];
  assert.deepEqual(findPossibleHolds(txns), [{ holdId: 3, keptId: 4 }]);
});

test('Cancelled or reviewed charges are not flagged again', () => {
  const txns = [
    card(1, 'Uber 852', 314945, new Date(2026, 9, 22, 10, 32), { status: 'cancelled' }),
    card(2, 'Uber 852', 308532, new Date(2026, 9, 22, 10, 35)),
    card(3, 'Uber 852', 31627, new Date(2026, 9, 30, 15, 40), { reviewed: 1 }),
    card(4, 'Uber 852', 31627, new Date(2026, 9, 30, 15, 44)),
  ];
  assert.deepEqual(findPossibleHolds(txns), []);
});

// ---- Tax year ----
test('Sri Lanka year of assessment runs April to March', () => {
  assert.equal(taxYearOf(new Date(2026, 10, 3).getTime()).label, '2026/27');
  assert.equal(taxYearOf(new Date(2027, 2, 31).getTime()).label, '2026/27');
  assert.equal(taxYearOf(new Date(2026, 2, 31).getTime()).label, '2025/26');
});

// ---- Sorting for tax purposes ----
test('Unknown payments are "not sorted" so the user gets asked', () => {
  const vishwa = txn('sampath', 'LKR 2,850.00 debited from AC **5375 for TFR Vishwa -000088326017 03/10/2026 12:54:23');
  assert.equal(categorize(vishwa, [], ['Adeepa']), 'unsorted_out');
  const big = txn('combank', 'Credit for Rs. 500,000.00 to 8014186987 at 16:55 at DIGITAL BANKING DIVISION', new Date(2026, 9, 28, 17, 0).getTime());
  assert.equal(categorize(big, [], ['Adeepa']), 'unsorted_in');
});

test('Scholarships, freelance platforms and tax payments are recognised', () => {
  const base = { description: '', channel: 'account' };
  assert.equal(categorize({ ...base, merchant: 'Mahapola Scholarship', direction: 'credit' }, [], []), 'scholarship');
  assert.equal(categorize({ ...base, merchant: 'PAYONEER', direction: 'credit' }, [], []), 'freelance_income');
  assert.equal(categorize({ ...base, merchant: 'Inland Revenue', direction: 'debit' }, [], []), 'tax_payment');
});

test('A user rule only applies in the direction that makes sense', () => {
  const rules = [{ pattern: 'VISHWA', category: 'freelance_income' }];
  const base = { merchant: 'Vishwa', description: 'TFR Vishwa', channel: 'transfer' };
  assert.equal(categorize({ ...base, direction: 'credit' }, rules, []), 'freelance_income');
  assert.equal(categorize({ ...base, direction: 'debit' }, rules, []), 'unsorted_out');
});

// ---- Backup upload parts ----

test('Small backups go in one request', () => {
  const parts = splitIntoParts([{ a: 1 }, { a: 2 }], [{ b: 1 }], 1000);
  assert.equal(parts.length, 1);
  assert.deepEqual(parts[0], { txns: [{ a: 1 }, { a: 2 }], sms: [{ b: 1 }] });
});

test('Large backups are split, every part under the limit, nothing lost', () => {
  const txns = Array.from({ length: 500 }, (_, i) => ({ id: i, text: 'x'.repeat(200) }));
  const sms = Array.from({ length: 300 }, (_, i) => ({ id: i, body: 'y'.repeat(300) }));
  const parts = splitIntoParts(txns, sms, 20_000);
  assert.ok(parts.length > 5);
  for (const p of parts) assert.ok(JSON.stringify(p).length < 20_000 + 400);
  assert.deepEqual(parts.flatMap((p) => p.txns), txns);
  assert.deepEqual(parts.flatMap((p) => p.sms), sms);
});
