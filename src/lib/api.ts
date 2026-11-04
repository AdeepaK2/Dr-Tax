import { getSetting } from './db';

/** Your Dr. Tax server on Vercel. Used until a different address is set in Settings. */
export const DEFAULT_SERVER_URL = 'https://server-two-sand-67.vercel.app';

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status = 0,
  ) {
    super(message);
  }
}

/** Server address from Settings → Backup server, or the default. */
export async function getServerUrl(): Promise<string> {
  const raw = await getSetting('backup_config');
  const saved = raw ? (JSON.parse(raw) as { serverUrl?: string }) : {};
  return (saved.serverUrl || DEFAULT_SERVER_URL).trim().replace(/\/+$/, '').replace(/\/api$/, '');
}

type TokenProvider = () => Promise<string | null>;
let tokenProvider: TokenProvider = async () => null;
/** auth.ts registers how to get the current sign-in token (avoids an import cycle). */
export function setTokenProvider(p: TokenProvider) {
  tokenProvider = p;
}

/** JSON request to the Dr. Tax server. Sends your sign-in token when you're signed in. */
export async function api<T>(
  path: string,
  init: { method?: string; body?: unknown; timeoutMs?: number; serverUrl?: string; token?: string | null } = {},
): Promise<T> {
  const base = (init.serverUrl ?? (await getServerUrl())).replace(/\/+$/, '');
  const token = init.token !== undefined ? init.token : await tokenProvider();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), init.timeoutMs ?? 60_000);
  try {
    const res = await fetch(`${base}/api${path}`, {
      method: init.method ?? 'GET',
      headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
      body: init.body ? JSON.stringify(init.body) : undefined,
      signal: controller.signal,
    });
    const text = await res.text();
    let json: { message?: string | string[] } | null = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = null;
    }
    if (!res.ok) {
      const msg = Array.isArray(json?.message) ? json!.message.join('; ') : json?.message;
      throw new ApiError(msg ?? `Server said ${res.status}`, res.status);
    }
    return json as T;
  } catch (e) {
    if (e instanceof ApiError) throw e;
    if ((e as Error).name === 'AbortError') throw new ApiError('The server took too long to answer.');
    throw new ApiError(`Can’t reach the server (${(e as Error).message}). Check that the phone is online.`);
  } finally {
    clearTimeout(timer);
  }
}
