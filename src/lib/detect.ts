import { isSmsReaderAvailable, listSenders, readInbox } from '../../modules/sms-reader';
import { bankInfo, detectBanks, type BankInfo } from './banks';
import { parseSms } from './parsers';

export type DetectedBank = { bank: BankInfo; senders: string[]; count: number };
export type AccountSuggestion = { kind: 'account' | 'card'; number: string; count: number };

/** Banks that have sent you SMS, most messages first. Needs SMS permission. */
export async function scanInboxBanks(): Promise<DetectedBank[]> {
  if (!isSmsReaderAvailable) return [];
  try {
    return detectBanks(await listSenders(100));
  } catch {
    return [];
  }
}

/**
 * Account and card numbers seen in a bank's SMS (e.g. "AC **5375", "card ending #7405"),
 * read with that bank's template. Used to fill in your accounts automatically.
 */
export async function suggestAccounts(bankId: string, senders: string[]): Promise<AccountSuggestion[]> {
  if (!isSmsReaderAvailable) return [];
  const all = [...new Set([...bankInfo(bankId).senders, ...senders])];
  let messages: { body: string; date: number }[] = [];
  try {
    messages = await readInbox(0, all);
  } catch {
    return [];
  }
  const counts = new Map<string, AccountSuggestion>();
  for (const m of messages.slice(-500)) {
    const p = parseSms(bankId, m.body, m.date);
    if (p.kind !== 'txn' || !p.account) continue;
    const card = /card/i.test(p.account) || p.channel === 'card';
    const number = p.account.replace(/\D/g, '');
    if (number.length < 4) continue;
    const key = `${card ? 'card' : 'account'}:${number}`;
    const entry = counts.get(key) ?? { kind: card ? 'card' : 'account', number, count: 0 };
    entry.count++;
    counts.set(key, entry);
  }
  return [...counts.values()].sort((a, b) => b.count - a.count).slice(0, 6);
}
