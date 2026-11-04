/**
 * Splits backup rows into parts that each stay under `maxChars` of JSON, so every request
 * fits hosts with a body size cap (Vercel: 4.5 MB). Order is kept; payments go first.
 */
export function splitIntoParts<T, S>(txns: T[], sms: S[], maxChars: number): { txns: T[]; sms: S[] }[] {
  const parts: { txns: T[]; sms: S[] }[] = [];
  let current = { txns: [] as T[], sms: [] as S[] };
  let size = 0;

  const push = <K extends 'txns' | 'sms'>(key: K, row: K extends 'txns' ? T : S) => {
    const len = JSON.stringify(row).length + 1;
    const empty = current.txns.length === 0 && current.sms.length === 0;
    if (!empty && size + len > maxChars) {
      parts.push(current);
      current = { txns: [], sms: [] };
      size = 0;
    }
    (current[key] as unknown[]).push(row);
    size += len;
  };

  for (const t of txns) push('txns', t as never);
  for (const m of sms) push('sms', m as never);
  parts.push(current);
  return parts;
}
