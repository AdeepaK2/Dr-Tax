export function parseAmountToCents(text: string): number {
  return Math.round(parseFloat(text.replace(/,/g, '')) * 100);
}

export function formatCents(cents: number, currency = 'LKR'): string {
  const negative = cents < 0;
  const abs = Math.abs(cents);
  const whole = Math.floor(abs / 100)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const frac = (abs % 100).toString().padStart(2, '0');
  const prefix = currency === 'LKR' ? 'Rs ' : `${currency} `;
  return `${negative ? '-' : ''}${prefix}${whole}.${frac}`;
}

/** Compact form for tiles: Rs 1.2M, Rs 45.3K */
export function formatCompact(cents: number): string {
  const rs = cents / 100;
  const abs = Math.abs(rs);
  if (abs >= 1_000_000) return `Rs ${(rs / 1_000_000).toFixed(2)}M`;
  if (abs >= 10_000) return `Rs ${(rs / 1_000).toFixed(1)}K`;
  return formatCents(cents);
}
