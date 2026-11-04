/** Profile, banks and app preferences: types and pure helpers (no database access). */
import { bankInfo, BANK_CATALOG, normalizeSender } from './banks';

/** A bank account or card you added in your profile. */
export type BankAccount = {
  id: string;
  bank: string;
  kind: 'account' | 'card';
  /** Full account number, or the last digits shown in SMS (e.g. 5375 or 7405). */
  number: string;
  nickname?: string;
};

export type Profile = {
  name: string;
  /** Other names your bank SMS use for you (e.g. "GGAS KULARATHNA"), for own-transfer detection. */
  otherNames: string[];
};

export type AppSettings = {
  profile: Profile;
  /** Banks you use (ids from BANK_CATALOG). Only their SMS are read. */
  banks: string[];
  accounts: BankAccount[];
  /** Extra sender IDs per bank, found in your inbox or added by you. Catalog IDs are always included. */
  senders: Record<string, string[]>;
  /** Card purchases are confirmed automatically after this many days if nothing changed. 0 = never. */
  autoConfirmDays: number;
  /** Send a notification asking what a payment was for when it can't be identified. */
  askWithNotifications: boolean;
  /** Finished the welcome and profile setup. */
  onboarded: boolean;
};

export const DEFAULT_SETTINGS: AppSettings = {
  profile: { name: '', otherNames: [] },
  banks: [],
  accounts: [],
  senders: {},
  autoConfirmDays: 3,
  askWithNotifications: true,
  onboarded: false,
};

/** Sender IDs to read for each of your banks: the catalog's plus any found or added. */
export function sendersFor(s: AppSettings): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const id of s.banks) {
    const seen = new Set<string>();
    out[id] = [...bankInfo(id).senders, ...(s.senders[id] ?? [])].filter((x) => {
      const k = normalizeSender(x);
      if (!k || seen.has(k)) return false;
      seen.add(k);
      return true;
    });
  }
  return out;
}

export function allSenders(s: AppSettings): string[] {
  return Object.values(sendersFor(s)).flat();
}

/**
 * Names and account numbers that mean "you". Transfers to these are own-account transfers.
 * Uses your full name and first name (not the surname, which family members share).
 */
export function ownNames(s: AppSettings): string[] {
  const full = s.profile.name.trim();
  const first = full.split(/\s+/)[0] ?? '';
  const numbers = s.accounts.map((a) => a.number.replace(/\s/g, '')).filter((n) => n.length >= 6);
  return [...new Set([full, first, ...s.profile.otherNames, ...numbers].map((x) => x.trim()).filter((x) => x.length >= 3))];
}

export function newAccountId(): string {
  return `acc-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

/** Catalog order, your banks first. */
export function sortedCatalog(selected: string[]) {
  return [...BANK_CATALOG].sort((a, b) => Number(selected.includes(b.id)) - Number(selected.includes(a.id)));
}
