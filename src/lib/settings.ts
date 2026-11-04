import { getSetting, setSetting } from './db';
import { DEFAULT_SETTINGS, type AppSettings } from './profile';

export * from './profile';

/** Settings saved by the first version of the app (fixed banks, a plain list of names). */
type LegacySettings = { senders?: Record<string, string[]>; ownNames?: string[] };

export async function loadSettings(): Promise<AppSettings> {
  const raw = await getSetting('app');
  if (!raw) return DEFAULT_SETTINGS;
  try {
    const parsed = JSON.parse(raw) as Partial<AppSettings> & LegacySettings;
    if (!Array.isArray(parsed.banks)) {
      // Upgrade from the first version: keep its banks, sender IDs and names, skip setup.
      const senders = parsed.senders ?? {};
      const names = parsed.ownNames ?? [];
      return {
        ...DEFAULT_SETTINGS,
        autoConfirmDays: parsed.autoConfirmDays ?? DEFAULT_SETTINGS.autoConfirmDays,
        askWithNotifications: parsed.askWithNotifications ?? DEFAULT_SETTINGS.askWithNotifications,
        banks: Object.keys(senders).length ? Object.keys(senders) : ['sampath', 'combank', 'peoples'],
        senders,
        profile: { name: names[0] ?? '', otherNames: names.slice(1) },
        onboarded: true,
      };
    }
    return {
      ...DEFAULT_SETTINGS,
      ...parsed,
      profile: { ...DEFAULT_SETTINGS.profile, ...parsed.profile },
      senders: parsed.senders ?? {},
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export async function saveSettings(s: AppSettings): Promise<void> {
  await setSetting('app', JSON.stringify(s));
}

