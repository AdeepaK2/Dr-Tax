// Same filtering as the Kotlin module (modules/sms-reader), over a fake inbox.
export type RawSms = { id: string; address: string; body: string; date: number };
export const inbox: RawSms[] = [];
export const isSmsReaderAvailable = true;
const normalize = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, '');

export async function readInbox(sinceMs: number, senders: string[]): Promise<RawSms[]> {
  const wanted = new Set(senders.map(normalize).filter(Boolean));
  return inbox.filter((m) => m.date > sinceMs && wanted.has(normalize(m.address))).sort((a, b) => a.date - b.date);
}
export async function listSenders() {
  const counts = new Map<string, number>();
  for (const m of inbox) if (/[A-Za-z]/.test(m.address)) counts.set(m.address, (counts.get(m.address) ?? 0) + 1);
  return [...counts].map(([address, count]) => ({ address, count }));
}
