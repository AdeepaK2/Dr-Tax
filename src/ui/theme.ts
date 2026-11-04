/**
 * Light "glass" theme: translucent white surfaces over a soft pastel backdrop.
 * The app always uses this light theme.
 */
const light = {
  /** Solid fallback behind the backdrop. */
  bg: '#F3F5FC',
  /** Glass surfaces. */
  card: 'rgba(255,255,255,0.58)',
  cardStrong: 'rgba(255,255,255,0.80)',
  border: 'rgba(255,255,255,0.92)',
  /** Thin dark line for dividers inside glass. */
  divider: 'rgba(15,23,42,0.07)',
  input: 'rgba(255,255,255,0.78)',
  chip: 'rgba(255,255,255,0.55)',
  track: 'rgba(15,23,42,0.07)',

  text: '#0F172A',
  textSecondary: '#475569',
  muted: '#64748B',

  primary: '#0D9488',
  primaryDeep: '#0F766E',
  accent: '#6366F1',
  primaryText: '#FFFFFF',
  /** Gradient for primary buttons and highlights. */
  primaryGradient: ['#14B8A6', '#6366F1'] as const,

  danger: '#DC2626',
  warn: '#B45309',
  warnBg: 'rgba(251,191,36,0.18)',
  warnBorder: 'rgba(245,158,11,0.40)',

  /** Signed amounts (with + / − prefix, so never colour alone). */
  income: '#0F8A63',
  expense: '#0F172A',
  /** Chart marks for money in / out (validated pair). */
  inMark: '#1BAF7A',
  outMark: '#EB6834',
};

export type Palette = typeof light;

export function useColors(): Palette {
  return light;
}

/** Soft drop shadow for glass. Drawn outside the box, so it never shows through the glass. */
export const glassShadow = '0px 10px 30px rgba(30, 41, 59, 0.08)';

/** Adds alpha to a #RRGGBB colour, e.g. tint('#14B8A6', 0.15). */
export function tint(hex: string, alpha: number): string {
  const a = Math.round(Math.max(0, Math.min(1, alpha)) * 255)
    .toString(16)
    .padStart(2, '0');
  return `${hex}${a}`;
}
