import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';

import { getCategory, TAX_GROUPS } from './categories';
import { formatIsoDate } from './dates';
import { listTxns } from './db';
import { BANKS, type Txn } from './types';

const HEADER = [
  'Date', 'Bank', 'Account', 'Type', 'Amount (LKR)', 'Currency', 'Merchant / payee',
  'Category', 'Tax group', 'Status', 'Note', 'Bank description',
];

function cell(v: string | number | null | undefined): string {
  const s = v == null ? '' : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(txns: Txn[]): string {
  const rows = txns.map((t) => {
    const cat = getCategory(t.category);
    return [
      formatIsoDate(t.occurred_at),
      BANKS[t.bank].name,
      t.account,
      t.direction === 'credit' ? 'Money in' : 'Money out',
      (t.amount_cents / 100).toFixed(2),
      t.currency,
      t.merchant,
      cat.label,
      TAX_GROUPS[cat.group].label,
      t.status,
      t.note,
      t.description,
    ].map(cell).join(',');
  });
  // BOM so Excel opens it as UTF-8
  return '﻿' + [HEADER.join(','), ...rows].join('\r\n');
}

/** Writes all transactions in a date range to a CSV and opens the share sheet. */
export async function exportCsv(range: { start: number; end: number }, label: string): Promise<void> {
  const txns = (await listTxns({ from: range.start, to: range.end }, 100_000)).reverse();
  const file = new File(Paths.cache, `dr-tax-${label.replace(/[^A-Za-z0-9]+/g, '-')}.csv`);
  if (file.exists) file.delete();
  file.create();
  file.writeSync(toCsv(txns));
  if (!(await Sharing.isAvailableAsync())) throw new Error('Sharing is not available on this device');
  await Sharing.shareAsync(file.uri, {
    mimeType: 'text/csv',
    dialogTitle: `Dr. Tax ${label}`,
  });
}
