/**
 * End-to-end simulation of Dr. Tax on a fake phone inbox.
 * Runs the app's real sync, parsing, database, review and notification code.
 *
 *   npm run simulate
 */
import { getCategory } from '../src/lib/categories';
import { formatDateTime } from '../src/lib/dates';
import { addRule, listReviewQueue, listSms, listTxns, smsCounts, updateTxn } from '../src/lib/db';
import { toCsv } from '../src/lib/exportCsv';
import { formatCents } from '../src/lib/money';
import { handleNotificationResponse, setupNotifications } from '../src/lib/notify';
import { summarize } from '../src/lib/summary';
import { reapplyCategories, syncSms } from '../src/lib/sync';
import { taxYearOf } from '../src/lib/taxYear';
import type { Txn } from '../src/lib/types';
import { navigations } from './mocks/expo-router';
import { dismissed, sent, tap } from './mocks/expo-notifications';
import { SCREENSHOT_INBOX } from './inbox';
import { inbox } from './mocks/sms-reader';

// ---------- helpers ----------
let nextId = 1;
function receive(address: string, body: string, date: number) {
  inbox.push({ id: String(nextId++), address, body, date });
}

let passed = 0;
let failed = 0;
function check(label: string, ok: boolean, detail = '') {
  if (ok) passed++;
  else failed++;
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? `  (${detail})` : ''}`);
}
function heading(s: string) {
  console.log(`\n=== ${s} ${'='.repeat(Math.max(0, 70 - s.length))}`);
}
function printTxns(txns: Txn[]) {
  const rows = [...txns].sort((a, b) => a.occurred_at - b.occurred_at);
  for (const t of rows) {
    const amt = `${t.direction === 'credit' ? '+' : '-'}${formatCents(t.amount_cents)}`;
    console.log(
      `  ${formatDateTime(t.occurred_at).padEnd(19)} ${t.bank.padEnd(8)} ${t.merchant.slice(0, 26).padEnd(26)} ${amt.padStart(15)}  ${t.status.padEnd(9)} ${getCategory(t.category).label.slice(0, 26).padEnd(26)} ${t.flag ?? ''}`,
    );
  }
}
const find = (txns: Txn[], merchant: string, cents: number) =>
  txns.filter((t) => t.merchant.toUpperCase().includes(merchant.toUpperCase()) && t.amount_cents === cents);
const sentSince = (n: number) => sent.slice(n);

async function main() {
  await setupNotifications();

  // ---------- 1. Your inbox, exactly as in the screenshots ----------
  for (const m of SCREENSHOT_INBOX) receive(m.address, m.body, m.date);

  heading('1. First sync of your inbox (screenshot SMS)');
  let n = sent.length;
  const r1 = await syncSms();
  console.log(`  Sync result: ${JSON.stringify(r1)}`);
  let txns = await listTxns({}, 1000);
  printTxns(txns);
  const counts = await smsCounts();
  console.log(`  SMS stored by type: ${JSON.stringify(counts)}`);

  check('Read only bank SMS (non-bank messages ignored)', r1.scanned === 22, `${r1.scanned} of ${inbox.length}`);
  check('15 payments recorded (6 Sampath + 9 ComBank)', txns.length === 15, `${txns.length}`);
  check('3 one-time-code SMS skipped, codes not stored', counts.otp === 3 && (await listSms('otp')).every((m) => !/\d{6}/.test(m.body)));
  check("3 People's Bank login alerts not counted as payments", counts.alert === 3, `${counts.alert} alerts`);
  check('Uber Rs 3,149.45 cancelled by the cancellation SMS', find(txns, 'uber', 314945)[0]?.status === 'cancelled');
  check('Uber Rs 3,085.32 (the real fare) kept', find(txns, 'uber', 308532)[0]?.status !== 'cancelled');
  const holds = find(txns, 'uber', 31627).sort((a, b) => a.occurred_at - b.occurred_at);
  check('First Uber Rs 316.27 flagged as possible hold', holds[0]?.flag === 'possible_hold' && holds[0]?.status === 'pending');
  check('Second Uber Rs 316.27 auto-confirmed after 3 days', holds[1]?.status === 'confirmed');
  check('Transfer to "Adeepa" = own-account transfer', find(txns, 'adeepa', 252500)[0]?.category === 'transfer_self');
  check('Transfer to Vishwa is "not sorted" (app asks)', find(txns, 'vishwa', 285000)[0]?.category === 'unsorted_out');
  check('Rs 500,000 credit is "not sorted" (app asks)', find(txns, 'digital', 50000000)[0]?.category === 'unsorted_in');
  check('Uber → Transport, A2B → Food, PayHere → Online', find(txns, 'uber', 188381)[0]?.category === 'transport' && find(txns, 'a2b', 171600)[0]?.category === 'food' && find(txns, 'payhere', 105000)[0]?.category === 'online');
  console.log('  Notifications shown:');
  for (const x of sentSince(n)) console.log(`    🔔 ${x.title} — ${x.body}${x.buttons.length ? `  [${x.buttons.join('] [')}]` : ''}`);
  check('Old payments summarised in one notification (no spam)', sentSince(n).some((x) => /payments? to sort/.test(x.title)));
  check('Possible double charge notification sent', sentSince(n).some((x) => /double charge/.test(x.title)));

  heading('2. Sync again (nothing new)');
  const r2 = await syncSms();
  txns = await listTxns({}, 1000);
  check('No duplicates on re-sync', r2.added === 0 && txns.length === 15, `added ${r2.added}`);

  heading('3. New SMS arrive today (test messages, not from your screenshots)');
  const now = Date.now();
  const d = new Date(now);
  const stamp = `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:00`;
  const hm = d.getHours() % 12 || 12;
  const cardTime = `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getFullYear()).slice(2)} ${String(hm).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')} ${d.getHours() < 12 ? 'AM' : 'PM'}`;
  receive('SAMPATHTXN', `LKR 45,000.00 credited to AC **5375 for TFR Kasun -000099112233 ${stamp} To Inq Call 0112303050`, now - 60_000);
  receive('SAMPATHTXN', `LKR 7,500.00 debited from AC **5375 for TFR Nimal -000011223344 ${stamp} To Inq Call 0112303050`, now - 50_000);
  receive('COMBANK', `Dear Cardholder, Purchase at UBER 852 LK for LKR 1,250.00 on ${cardTime} has been authorised on your debit card ending #7405.`, now - 40_000);
  n = sent.length;
  const r3 = await syncSms();
  console.log(`  Sync result: ${JSON.stringify(r3)}`);
  txns = await listTxns({}, 1000);
  const kasun = find(txns, 'kasun', 4500000)[0];
  const nimal = find(txns, 'nimal', 750000)[0];
  const uberNow = find(txns, 'uber', 125000)[0];
  console.log('  Notifications shown:');
  for (const x of sentSince(n)) console.log(`    🔔 ${x.title} — ${x.body}  [${x.buttons.join('] [')}]`);
  const kasunNote = sentSince(n).find((x) => x.data.txnId === kasun?.id);
  const nimalNote = sentSince(n).find((x) => x.data.txnId === nimal?.id);
  check('Asked about Rs 45,000 received from Kasun, with Freelance/Gift/Other buttons', !!kasunNote && kasunNote.buttons.join() === 'Freelance,Gift,Other…');
  check('Asked about Rs 7,500 paid to Nimal, with Personal/Work/Other buttons', !!nimalNote && nimalNote.buttons.join() === 'Personal,Work,Other…');
  check('New Uber charge is pending, no question asked (category known)', uberNow?.status === 'pending' && !sentSince(n).some((x) => x.data.txnId === uberNow?.id));

  heading('4. Uber cancels today\'s ride two minutes later');
  receive('COMBANK', 'YOUR TRANSACTION AT UBER ON YOUR CARD ENDING WITH 7405 HAS BEEN CANCELLED.', now - 10_000);
  await syncSms();
  txns = await listTxns({}, 1000);
  check('Today\'s Uber Rs 1,250 marked cancelled', find(txns, 'uber', 125000)[0]?.status === 'cancelled');

  heading('5. You answer the notifications');
  navigations.length = 0;
  await handleNotificationResponse(tap(kasunNote!, 'Freelance') as never);
  await handleNotificationResponse(tap(nimalNote!, 'Personal') as never);
  txns = await listTxns({}, 1000);
  check('Tap "Freelance" → Rs 45,000 is Freelance income', find(txns, 'kasun', 4500000)[0]?.category === 'freelance_income');
  check('…and opens the payment to add client details', navigations.includes(`push /txn/${kasun!.id}`), navigations.join(', '));
  check('Tap "Personal" → Rs 7,500 is personal, no screen opened', find(txns, 'nimal', 750000)[0]?.category === 'personal_other' && navigations.length === 1);
  check('Answered notifications are dismissed', dismissed.length === 2);
  await handleNotificationResponse(tap(kasunNote!, 'Freelance') as never);
  check('Same tap delivered twice is handled once', navigations.length === 1);

  heading('6. You finish sorting in the Review tab');
  let queue = await listReviewQueue();
  console.log(`  Review queue before: ${queue.length} items`);
  for (const t of queue) console.log(`    • ${t.merchant} ${formatCents(t.amount_cents)} — ${t.flag ?? (t.status === 'pending' ? 'pending' : 'what was it for?')}`);
  // "It was a hold" on the first Uber 316.27
  await updateTxn(holds[0].id, { status: 'hold', flag: null, reviewed: 1 });
  // Vishwa → Gift given, "Always"
  const vishwa = find(txns, 'vishwa', 285000)[0];
  await updateTxn(vishwa.id, { category: 'gift_given', category_locked: 1 });
  await addRule('VISHWA', 'gift_given');
  // Rs 500,000 → Scholarship (example answer), Royal College Union credit → Refund
  await updateTxn(find(txns, 'digital', 50000000)[0].id, { category: 'scholarship', category_locked: 1, note: 'Example: scholarship payment' });
  await updateTxn(find(txns, 'royal college', 500000)[0].id, { category: 'refund', category_locked: 1 });
  // A later transfer to Vishwa should now be sorted automatically by the rule
  receive('SAMPATHTXN', `LKR 1,500.00 debited from AC **5375 for TFR Vishwa -000088326017 ${stamp} To Inq Call 0112303050`, now - 5_000);
  n = sent.length;
  await syncSms();
  await reapplyCategories();
  txns = await listTxns({}, 1000);
  check('"It was a hold" removes the Rs 316.27 hold from totals', find(txns, 'uber', 31627).some((t) => t.status === 'hold'));
  check('Rule learned: next transfer to Vishwa auto-sorted as Gift given', find(txns, 'vishwa', 150000)[0]?.category === 'gift_given');
  check('…and no question asked for it', !sentSince(n).some((x) => /Vishwa/.test(x.body)));
  queue = await listReviewQueue();
  console.log(`  Review queue after: ${queue.length} items`);
  for (const t of queue) console.log(`    • ${t.merchant} ${formatCents(t.amount_cents)} — ${t.flag ?? (t.status === 'pending' ? 'pending' : 'what was it for?')}`);

  heading(`7. Tax year ${taxYearOf(now).label} report`);
  const ty = taxYearOf(now);
  const yearTxns = await listTxns({ from: ty.start, to: ty.end }, 100_000);
  printTxns(yearTxns);
  const s = summarize(yearTxns);
  console.log('');
  for (const g of s.groups) {
    console.log(`  ${g.group.padEnd(9)} ${g.group === 'unsorted' ? `${g.count} to sort` : formatCents(g.cents)}`);
    for (const c of g.categories) console.log(`      ${getCategory(c.category).label.padEnd(32)} ${formatCents(c.cents).padStart(16)}  (${c.count})`);
  }
  check('Freelance Rs 45,000 counted as taxable income', s.incomeCents === 4500000, formatCents(s.incomeCents));
  check('Scholarship Rs 500,000 kept out of taxable income', s.exemptCents === 50000000 + 500000, formatCents(s.exemptCents));
  const transport = s.groups.flatMap((g) => g.categories).find((c) => c.category === 'transport');
  check('Transport = only real Uber fares (cancelled + hold left out)', transport?.cents === 308532 + 188381 + 31627, formatCents(transport?.cents ?? 0));
  check('Own transfer to Adeepa not counted as spending', s.groups.find((g) => g.group === 'transfer')?.categories.some((c) => c.category === 'transfer_self') === true);

  const csv = toCsv(yearTxns.slice().reverse());
  console.log('\n  CSV export (first 4 lines):');
  for (const line of csv.replace(/^﻿/, '').split('\r\n').slice(0, 4)) console.log(`    ${line}`);
  check('CSV has one row per payment plus header', csv.split('\r\n').length === yearTxns.length + 1);

  heading('Result');
  console.log(`  ${passed} passed, ${failed} failed`);
  process.exitCode = failed ? 1 : 0;
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
