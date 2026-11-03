import { merchantKey } from './parsers';
import type { TxnFlag, TxnStatus } from './types';

/** The fields reconciliation needs. Kept small so it can be tested without a database. */
export type CardTxn = {
  id: number;
  account: string | null;
  merchant: string;
  description: string;
  amount_cents: number;
  occurred_at: number;
  status: TxnStatus;
  flag: TxnFlag | null;
  reviewed: number;
  channel: string;
};

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

/** How far back a cancellation SMS can refer to. */
export const CANCEL_LOOKBACK_MS = 3 * DAY;
/** Two charges at the same merchant this close together look like a hold + the real charge. */
export const HOLD_WINDOW_MS = 30 * 60 * 1000;

function sameMerchant(a: string, b: string): boolean {
  const ka = merchantKey(a);
  const kb = merchantKey(b);
  if (!ka || !kb) return false;
  return ka === kb || a.toUpperCase().includes(b.toUpperCase()) || b.toUpperCase().includes(a.toUpperCase());
}

function cardOf(account: string | null): string {
  return (account ?? '').replace(/\D/g, '').slice(-4);
}

/**
 * Finds which card purchase a "YOUR TRANSACTION AT UBER ... HAS BEEN CANCELLED" message refers to.
 * The SMS has no amount, so pick the latest active purchase at that merchant on that card before
 * the cancellation. If another one is close by, mark it ambiguous so you can check it.
 */
export function findCancelTarget(
  cancel: { merchant: string; card: string; occurredAt: number },
  txns: CardTxn[],
): { targetId: number; ambiguous: boolean } | null {
  const candidates = txns
    .filter(
      (t) =>
        t.channel === 'card' &&
        (t.status === 'pending' || t.status === 'confirmed') &&
        // small allowance for the bank's clock vs the phone's clock
        t.occurred_at <= cancel.occurredAt + 60 * 1000 &&
        t.occurred_at >= cancel.occurredAt - CANCEL_LOOKBACK_MS &&
        cardOf(t.account) === cancel.card &&
        (sameMerchant(t.merchant, cancel.merchant) || sameMerchant(t.description, cancel.merchant)),
    )
    .sort((a, b) => b.occurred_at - a.occurred_at);

  if (candidates.length === 0) return null;
  const [latest, next] = candidates;
  const ambiguous = next != null && latest.occurred_at - next.occurred_at < 2 * HOUR;
  return { targetId: latest.id, ambiguous };
}

/**
 * Finds likely temporary holds: two charges at the same merchant on the same card within
 * HOLD_WINDOW_MS (e.g. Uber Rs 316.27 at 3:40 PM and again at 3:44 PM). The earlier one is
 * marked as a possible hold and linked to the later one. Already-reviewed items are left alone.
 */
export function findPossibleHolds(txns: CardTxn[]): { holdId: number; keptId: number }[] {
  const active = txns
    .filter((t) => t.channel === 'card' && (t.status === 'pending' || t.status === 'confirmed'))
    .sort((a, b) => a.occurred_at - b.occurred_at);

  const result: { holdId: number; keptId: number }[] = [];
  const used = new Set<number>();
  for (let i = 0; i < active.length; i++) {
    const first = active[i];
    if (first.reviewed || first.flag || used.has(first.id)) continue;
    for (let j = i + 1; j < active.length; j++) {
      const second = active[j];
      if (second.occurred_at - first.occurred_at > HOLD_WINDOW_MS) break;
      if (cardOf(second.account) !== cardOf(first.account)) continue;
      if (!sameMerchant(first.merchant, second.merchant)) continue;
      result.push({ holdId: first.id, keptId: second.id });
      used.add(first.id);
      break;
    }
  }
  return result;
}
