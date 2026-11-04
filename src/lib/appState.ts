import { useSyncExternalStore } from 'react';

import { loadSettings, saveSettings, type AppSettings } from './settings';

/** Whether this phone has finished the welcome + profile setup. Drives which screens show. */
type State = { loaded: boolean; onboarded: boolean };
let state: State = { loaded: false, onboarded: false };
const listeners = new Set<() => void>();

function set(next: State) {
  state = next;
  listeners.forEach((l) => l());
}

export async function loadAppState(): Promise<void> {
  const s = await loadSettings();
  set({ loaded: true, onboarded: s.onboarded });
}

export function useAppState(): State {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => state,
  );
}

/** Saves the profile and opens the main app. */
export async function finishSetup(settings: AppSettings): Promise<void> {
  await saveSettings({ ...settings, onboarded: true });
  set({ loaded: true, onboarded: true });
}

/** Back to the welcome screen (after clearing this phone). */
export function backToWelcome(): void {
  set({ loaded: true, onboarded: false });
}
