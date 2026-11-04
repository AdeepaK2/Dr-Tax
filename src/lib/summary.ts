import { getCategory, TAX_GROUP_ORDER, type TaxGroup } from './categories';
import { COUNTED_STATUSES, type BankId, type Txn } from './types';

export type CategoryTotal = { category: string; cents: number; count: number };
export type GroupTotal = { group: TaxGroup; cents: number; count: number; categories: CategoryTotal[] };
export type MonthTotal = { month: number; inCents: number; outCents: number };

export type Summary = {
  /** All money in / out, excluding own-account transfers. */
  inCents: number;
  outCents: number;
  incomeCents: number;
  spendingCents: number;
  exemptCents: number;
  reliefCents: number;
  businessCents: number;
  taxPaidCents: number;
  unsortedCount: number;
  pendingCents: number;
  pendingCount: number;
  groups: GroupTotal[];
  months: MonthTotal[];
  byBank: { bank: BankId; inCents: number; outCents: number }[];
  /** Non-LKR transactions are listed but not added to the totals. */
  foreignCount: number;
  count: number;
};

/** Signed amount for a group total: money-in groups count credits, spending groups count debits net of credits. */
function signed(t: Txn, group: TaxGroup): number {
  if (group === 'unsorted') return t.amount_cents;
  if (group === 'income' || group === 'exempt') return t.direction === 'credit' ? t.amount_cents : -t.amount_cents;
  return t.direction === 'debit' ? t.amount_cents : -t.amount_cents;
}

export function summarize(txns: Txn[]): Summary {
  const groupMap = new Map<TaxGroup, Map<string, CategoryTotal>>();
  const monthMap = new Map<number, MonthTotal>();
  const bankMap = new Map<BankId, { bank: BankId; inCents: number; outCents: number }>();
  let pendingCents = 0;
  let pendingCount = 0;
  let foreignCount = 0;
  let count = 0;

  for (const t of txns) {
    if (!COUNTED_STATUSES.includes(t.status)) continue;
    if (t.currency !== 'LKR') {
      foreignCount++;
      continue;
    }
    count++;
    const group = getCategory(t.category).group;
    if (t.status === 'pending') {
      pendingCents += t.amount_cents;
      pendingCount++;
    }

    let cats = groupMap.get(group);
    if (!cats) groupMap.set(group, (cats = new Map()));
    const ct = cats.get(t.category) ?? { category: t.category, cents: 0, count: 0 };
    ct.cents += signed(t, group);
    ct.count++;
    cats.set(t.category, ct);

    if (group === 'transfer') continue; // own money: not in/out flow

    const d = new Date(t.occurred_at);
    const monthKey = new Date(d.getFullYear(), d.getMonth(), 1).getTime();
    const m = monthMap.get(monthKey) ?? { month: monthKey, inCents: 0, outCents: 0 };
    const b = bankMap.get(t.bank) ?? { bank: t.bank, inCents: 0, outCents: 0 };
    if (t.direction === 'credit') {
      m.inCents += t.amount_cents;
      b.inCents += t.amount_cents;
    } else {
      m.outCents += t.amount_cents;
      b.outCents += t.amount_cents;
    }
    monthMap.set(monthKey, m);
    bankMap.set(t.bank, b);
  }

  const groups: GroupTotal[] = TAX_GROUP_ORDER.filter((g) => groupMap.has(g)).map((g) => {
    const categories = [...groupMap.get(g)!.values()].sort((a, b) => b.cents - a.cents);
    return {
      group: g,
      categories,
      cents: categories.reduce((s, c) => s + c.cents, 0),
      count: categories.reduce((s, c) => s + c.count, 0),
    };
  });
  const total = (g: TaxGroup) => groups.find((x) => x.group === g)?.cents ?? 0;

  const months = [...monthMap.values()].sort((a, b) => a.month - b.month);
  return {
    inCents: months.reduce((s, m) => s + m.inCents, 0),
    outCents: months.reduce((s, m) => s + m.outCents, 0),
    incomeCents: total('income'),
    exemptCents: total('exempt'),
    reliefCents: total('relief'),
    businessCents: total('business'),
    taxPaidCents: total('taxpaid'),
    unsortedCount: groups.find((x) => x.group === 'unsorted')?.count ?? 0,
    spendingCents: total('relief') + total('business') + total('personal'),
    pendingCents,
    pendingCount,
    groups,
    months,
    byBank: [...bankMap.values()],
    foreignCount,
    count,
  };
}
