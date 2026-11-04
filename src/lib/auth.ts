import * as SecureStore from 'expo-secure-store';
import { useEffect, useSyncExternalStore } from 'react';

import { api, setTokenProvider } from './api';
import { getSetting, setSetting } from './db';
import type { AppSettings } from './settings';

export type AccountUser = { id: string; email: string; name: string; profile: Record<string, unknown> };
export type Session = { token: string; expiresAt: string; user: AccountUser };

/** Profile kept on the server so a new phone can be set up quickly. */
export type ServerProfile = Pick<AppSettings, 'banks' | 'accounts'> & { otherNames: string[] };

// The token lives in Android's encrypted storage, not in the app database.
const KEY = 'drtax.session';
let cached: Session | null | undefined;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export async function getSession(): Promise<Session | null> {
  if (cached === undefined) {
    try {
      const raw = await SecureStore.getItemAsync(KEY);
      cached = raw ? (JSON.parse(raw) as Session) : null;
    } catch {
      cached = null;
    }
    emit();
  }
  if (cached && Date.parse(cached.expiresAt) < Date.now()) return null;
  return cached ?? null;
}

setTokenProvider(async () => (await getSession())?.token ?? null);

async function saveSession(s: Session | null) {
  cached = s;
  if (s) await SecureStore.setItemAsync(KEY, JSON.stringify(s));
  else await SecureStore.deleteItemAsync(KEY);
  emit();
}

/** The signed-in account: undefined while loading, null when signed out. */
export function useSession(): Session | null | undefined {
  const s = useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => cached,
  );
  useEffect(() => {
    if (cached === undefined) void getSession();
  }, []);
  return s;
}

export async function signUp(input: { email: string; password: string; name: string }): Promise<Session> {
  const s = await api<Session>('/auth/register', { method: 'POST', body: input, token: null, timeoutMs: 30_000 });
  await saveSession(s);
  return s;
}

export async function signIn(input: { email: string; password: string }): Promise<Session> {
  const s = await api<Session>('/auth/login', { method: 'POST', body: input, token: null, timeoutMs: 30_000 });
  await saveSession(s);
  return s;
}

export async function signOut(): Promise<void> {
  await saveSession(null);
}

/** Saves your name, banks and accounts to your account (best effort; works offline later). */
export async function pushProfile(settings: AppSettings): Promise<void> {
  if (!(await getSession())) return;
  const profile: ServerProfile = { otherNames: settings.profile.otherNames, banks: settings.banks, accounts: settings.accounts };
  const user = await api<AccountUser>('/me', { method: 'PUT', body: { name: settings.profile.name, profile } });
  if (cached) await saveSession({ ...cached, user });
}

// ---- which account this phone's data belongs to ----
const OWNER_KEY = 'data_owner';

export async function dataOwner(): Promise<string | null> {
  return getSetting(OWNER_KEY);
}

export async function setDataOwner(userId: string): Promise<void> {
  await setSetting(OWNER_KEY, userId);
}
