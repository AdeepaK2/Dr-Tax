import type { AndroidSymbol } from 'expo-symbols';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import type { ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { getCategory, TAX_GROUPS } from '@/lib/categories';
import { formatDateTime } from '@/lib/dates';
import { formatCents } from '@/lib/money';
import { BANKS, type Txn, type TxnStatus } from '@/lib/types';

import { Backdrop, Glass, Icon, IconBadge, StatusBarGlass } from './glass';
import { categoryIcon } from './icons';
import { tint, useColors } from './theme';

export function Screen({
  title,
  subtitle,
  right,
  children,
  refreshing,
  onRefresh,
  underHeader,
}: {
  title?: string;
  /** Set on screens that already have a navigation header: no big title, no top inset. */
  underHeader?: boolean;
  subtitle?: string;
  right?: ReactNode;
  children: ReactNode;
  refreshing?: boolean;
  onRefresh?: () => void;
}) {
  const c = useColors();
  const insets = useSafeAreaInsets();
  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Backdrop />
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingTop: underHeader ? 14 : insets.top + 16, paddingBottom: insets.bottom + 110, paddingHorizontal: 16, gap: 14 }}
        refreshControl={
          onRefresh ? <RefreshControl refreshing={!!refreshing} onRefresh={onRefresh} tintColor={c.primary} colors={[c.primary]} /> : undefined
        }>
        {title || subtitle || right ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 2 }}>
            <View style={{ flex: 1 }}>
              {title ? <Text style={{ fontSize: 32, fontWeight: '800', color: c.text, letterSpacing: -0.8 }}>{title}</Text> : null}
              {subtitle ? <Text style={{ color: c.muted, marginTop: 2, fontSize: 14 }}>{subtitle}</Text> : null}
            </View>
            {right}
          </View>
        ) : null}
        {children}
      </ScrollView>
      {underHeader ? null : <StatusBarGlass />}
    </View>
  );
}

/** Glass card with padding. */
export function Card({ children, style, strong, tintColor }: { children: ReactNode; style?: StyleProp<ViewStyle>; strong?: boolean; tintColor?: string }) {
  return (
    <Glass strong={strong} tintColor={tintColor} style={[{ padding: 16 }, style]}>
      {children}
    </Glass>
  );
}

export function SectionTitle({ children, right }: { children: ReactNode; right?: ReactNode }) {
  const c = useColors();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 10, paddingHorizontal: 4 }}>
      <Text style={{ flex: 1, fontSize: 12, fontWeight: '800', letterSpacing: 1, color: c.muted, textTransform: 'uppercase' }}>{children}</Text>
      {right}
    </View>
  );
}

export function Button({
  label,
  onPress,
  kind = 'primary',
  busy,
  small,
  disabled,
  icon,
}: {
  label: string;
  onPress: () => void;
  kind?: 'primary' | 'secondary' | 'danger';
  busy?: boolean;
  small?: boolean;
  disabled?: boolean;
  icon?: AndroidSymbol;
}) {
  const c = useColors();
  const fg = kind === 'primary' ? c.primaryText : kind === 'danger' ? c.danger : c.primaryDeep;
  const pad = { paddingVertical: small ? 9 : 14, paddingHorizontal: small ? 14 : 18 };
  const inner = (
    <View style={[{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 }, pad]}>
      {busy ? <ActivityIndicator color={fg} size="small" /> : icon ? <Icon name={icon} size={small ? 16 : 18} color={fg} /> : null}
      <Text style={{ color: fg, fontWeight: '700', fontSize: small ? 13 : 15 }}>{label}</Text>
    </View>
  );
  return (
    <Pressable onPress={onPress} disabled={busy || disabled} style={({ pressed }) => ({ opacity: disabled ? 0.45 : pressed ? 0.75 : 1, transform: [{ scale: pressed ? 0.98 : 1 }] })}>
      {kind === 'primary' ? (
        <LinearGradient
          colors={c.primaryGradient}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={{ borderRadius: 16, boxShadow: '0px 8px 20px rgba(13,148,136,0.28)' }}>
          {inner}
        </LinearGradient>
      ) : (
        <View
          style={{
            borderRadius: 16,
            borderWidth: 1,
            borderColor: kind === 'danger' ? tint(c.danger, 0.3) : c.border,
            backgroundColor: kind === 'danger' ? tint(c.danger, 0.08) : 'rgba(255,255,255,0.62)',
          }}>
          {inner}
        </View>
      )}
    </Pressable>
  );
}

/** Pill button. `dot` shows the colour even when not selected (e.g. a category's tax group). */
export function Chip({ label, selected, onPress, color, dot }: { label: string; selected?: boolean; onPress?: () => void; color?: string; dot?: boolean }) {
  const c = useColors();
  const col = color ?? c.primary;
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        paddingVertical: 7,
        paddingHorizontal: 13,
        borderRadius: 999,
        backgroundColor: selected ? tint(col, 0.18) : c.chip,
        borderWidth: 1,
        borderColor: selected ? tint(col, 0.55) : c.border,
        opacity: pressed ? 0.7 : 1,
      })}>
      {selected || dot ? <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: col }} /> : null}
      <Text style={{ color: c.text, fontSize: 13, fontWeight: selected ? '700' : '500' }}>{label}</Text>
    </Pressable>
  );
}

const STATUS_LABEL: Record<TxnStatus, string> = {
  pending: 'Pending',
  confirmed: 'Confirmed',
  cancelled: 'Cancelled',
  hold: 'Hold released',
  excluded: 'Excluded',
};

export function statusLabel(s: TxnStatus) {
  return STATUS_LABEL[s];
}

export function StatusPill({ status }: { status: TxnStatus }) {
  const c = useColors();
  if (status === 'confirmed') return null;
  const color = status === 'pending' ? c.warn : c.muted;
  return (
    <View style={{ borderRadius: 999, paddingHorizontal: 7, paddingVertical: 1, backgroundColor: status === 'pending' ? c.warnBg : c.track }}>
      <Text style={{ fontSize: 10, fontWeight: '800', color, letterSpacing: 0.4 }}>{STATUS_LABEL[status].toUpperCase()}</Text>
    </View>
  );
}

export function Amount({ txn, size = 16 }: { txn: Pick<Txn, 'amount_cents' | 'currency' | 'direction' | 'status'>; size?: number }) {
  const c = useColors();
  const struck = txn.status === 'cancelled' || txn.status === 'hold' || txn.status === 'excluded';
  return (
    <Text
      style={{
        fontSize: size,
        fontWeight: '800',
        color: struck ? c.muted : txn.direction === 'credit' ? c.income : c.expense,
        textDecorationLine: struck ? 'line-through' : 'none',
        fontVariant: ['tabular-nums'],
        letterSpacing: -0.3,
      }}>
      {txn.direction === 'credit' ? '+' : '−'}
      {formatCents(txn.amount_cents, txn.currency)}
    </Text>
  );
}

export function TxnRow({ txn, last }: { txn: Txn; last?: boolean }) {
  const c = useColors();
  const cat = getCategory(txn.category);
  const bank = BANKS[txn.bank];
  const groupColor = TAX_GROUPS[cat.group].color;
  return (
    <Pressable
      onPress={() => router.push(`/txn/${txn.id}`)}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 12,
        gap: 12,
        opacity: pressed ? 0.6 : 1,
        borderBottomWidth: last ? 0 : StyleSheet.hairlineWidth,
        borderBottomColor: c.divider,
      })}>
      <IconBadge name={categoryIcon(txn.category)} color={groupColor} />
      <View style={{ flex: 1, gap: 3 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Text numberOfLines={1} style={{ color: c.text, fontSize: 15, fontWeight: '700', flexShrink: 1 }}>
            {txn.merchant}
          </Text>
          <StatusPill status={txn.status} />
          {txn.flag ? <Icon name="warning" size={14} color={c.warn} /> : null}
        </View>
        <Text numberOfLines={1} style={{ color: c.muted, fontSize: 12 }}>
          {cat.label} · {bank.short} · {formatDateTime(txn.occurred_at)}
        </Text>
      </View>
      <Amount txn={txn} size={15} />
    </Pressable>
  );
}

export function TxnList({ txns, empty }: { txns: Txn[]; empty?: string }) {
  const c = useColors();
  if (txns.length === 0) {
    return (
      <Card style={{ alignItems: 'center', gap: 8, paddingVertical: 24 }}>
        <Icon name="receipt_long" size={28} color={c.muted} />
        <Text style={{ color: c.muted, textAlign: 'center' }}>{empty ?? 'Nothing here yet.'}</Text>
      </Card>
    );
  }
  return (
    <Card style={{ paddingVertical: 2 }}>
      {txns.map((t, i) => (
        <TxnRow key={t.id} txn={t} last={i === txns.length - 1} />
      ))}
    </Card>
  );
}

export function Stat({ label, value, color, hint, icon }: { label: string; value: string; color?: string; hint?: string; icon?: AndroidSymbol }) {
  const c = useColors();
  return (
    <Card style={{ flex: 1, padding: 14, gap: 8 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        {icon ? <IconBadge name={icon} color={color ?? c.primary} size={30} /> : null}
        <Text style={{ flex: 1, color: c.textSecondary, fontSize: 12, fontWeight: '700' }} numberOfLines={1}>
          {label}
        </Text>
      </View>
      <Text style={{ color: c.text, fontSize: 20, fontWeight: '800', fontVariant: ['tabular-nums'], letterSpacing: -0.4 }} numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </Text>
      {hint ? <Text style={{ color: c.muted, fontSize: 11 }} numberOfLines={1}>{hint}</Text> : null}
    </Card>
  );
}

export function Bar({ fraction, color }: { fraction: number; color: string }) {
  const c = useColors();
  return (
    <View style={{ height: 8, borderRadius: 4, backgroundColor: c.track, overflow: 'hidden' }}>
      <View style={{ width: `${Math.max(2, Math.min(100, fraction * 100))}%`, height: '100%', backgroundColor: color, borderRadius: 4 }} />
    </View>
  );
}

export function Banner({ children, onPress, tone = 'warn' }: { children: ReactNode; onPress?: () => void; tone?: 'warn' | 'info' }) {
  const c = useColors();
  const warn = tone === 'warn';
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        backgroundColor: warn ? c.warnBg : c.card,
        borderColor: warn ? c.warnBorder : c.border,
        borderWidth: 1,
        borderRadius: 18,
        padding: 14,
        opacity: pressed ? 0.75 : 1,
      })}>
      <Icon name={warn ? 'notifications' : 'auto_awesome'} size={22} color={warn ? c.warn : c.primary} />
      <Text style={{ flex: 1, color: warn ? '#92400E' : c.text, fontWeight: '600', lineHeight: 20 }}>{children}</Text>
      {onPress ? <Icon name="chevron_right" size={22} color={warn ? c.warn : c.muted} /> : null}
    </Pressable>
  );
}

export function Muted({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const c = useColors();
  return (
    <View style={[{ paddingHorizontal: 4 }, style]}>
      <Text style={{ color: c.muted, fontSize: 13, lineHeight: 19 }}>{children}</Text>
    </View>
  );
}
