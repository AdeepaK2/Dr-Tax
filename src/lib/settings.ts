import { getSetting, setSetting } from './db';
import type { BankId } from './types';

export type AppSettings = {
  /** SMS sender IDs for each bank. Matching ignores case, spaces and punctuation. */
  senders: Record<Exclude<BankId, 'cash'>, string[]>;
  /** Your own names / account numbers. Transfers to these count as own-account transfers. */
  ownNames: string[];
  /** Card purchases are confirmed automatically after this many days if nothing changed. 0 = never. */
  autoConfirmDays: number;
  /** Send a notification asking what a payment was for when it can't be identified. */
  askWithNotifications: boolean;
};

export const DEFAULT_SETTINGS: AppSettings = {
  senders: {
    sampath: ['SAMPATHTXN', 'SAMPATH', 'SampathBank'],
    combank: ['COMBANK', 'ComBank'],
    peoples: ['PeoplesBank', "People's Bank", 'PEOPLESBNK'],
  },
  ownNames: ['Adeepa'],
  autoConfirmDays: 3,
  askWithNotifications: true,
};

export async function loadSettings(): Promise<AppSettings> {
  const raw = await getSetting('app');
  if (!raw) return DEFAULT_SETTINGS;
  try {
    const parsed = JSON.parse(raw) as Partial<AppSettings>;
    return {
      ...DEFAULT_SETTINGS,
      ...parsed,
      senders: { ...DEFAULT_SETTINGS.senders, ...parsed.senders },
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export async function saveSettings(s: AppSettings): Promise<void> {
  await setSetting('app', JSON.stringify(s));
}

export function allSenders(s: AppSettings): string[] {
  return Object.values(s.senders).flat();
}
