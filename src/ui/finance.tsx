import { router } from 'expo-router';
import { Pressable, Text, View } from 'react-native';

import { getCategory, TAX_GROUPS } from '@/lib/categories';
import { formatCents, formatCompact } from '@/lib/money';
import { monthLabel, shiftMonth, type Month } from '@/lib/period';
import type { Summary } from '@/lib/summary';
import { BANKS } from '@/lib/types';

import { Bar, Button, Card, Muted } from './components';
import { Glass, Icon, IconBadge } from './glass';
import { GROUP_ICONS, categoryIcon } from './icons';
import { tint, useColors } from './theme';

function MonthArrow({ dir, onPress }: { dir: -1 | 1; onPress: () => void }) {
  const c = useColors();
  return (
    <Pressable
      onPress={onPress}
      hitSlop={8}
      style={({ pressed }) => ({
        width: 40,
        height: 40,
        borderRadius: 20,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: pressed ? tint(c.primary, 0.18) : 'rgba(255,255,255,0.75)',
        borderWidth: 1,
        borderColor: c.border,
      })}>
      <Icon name={dir < 0 ? 'chevron_left' : 'chevron_right'} size={24} color={c.primaryDeep} />
    </Pressable>
  );
}

/** ‹ November 2026 › */
export function MonthPicker({ month, onChange, label }: { month: Month; onChange: (m: Month) => void; label?: string }) {
  const c = useColors();
  return (
    <Glass radius={26} style={{ flexDirection: 'row', alignItems: 'center', padding: 6 }}>
      <MonthArrow dir={-1} onPress={() => onChange(shiftMonth(month, -1))} />
      <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
        <Icon name="calendar_month" size={18} color={c.primary} />
        <Text style={{ color: c.text, fontSize: 17, fontWeight: '800', letterSpacing: -0.3 }}>{label ?? monthLabel(month)}</Text>
      </View>
      <MonthArrow dir={1} onPress={() => onChange(shiftMonth(month, 1))} />
    </Glass>
  );
}

/** Two-option switch, e.g. Month | Year. */
export function Segmented<T extends string>({ value, options, onChange }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void }) {
  const c = useColors();
  return (
    <Glass radius={18} style={{ flexDirection: 'row', padding: 4 }}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <Pressable
            key={o.value}
            onPress={() => onChange(o.value)}
            style={{
              flex: 1,
              paddingVertical: 10,
              borderRadius: 14,
              backgroundColor: on ? 'rgba(255,255,255,0.95)' : 'transparent',
              boxShadow: on ? '0px 4px 12px rgba(30,41,59,0.10)' : undefined,
              alignItems: 'center',
            }}>
            <Text style={{ color: on ? c.primaryDeep : c.muted, fontWeight: on ? '800' : '600' }}>{o.label}</Text>
          </Pressable>
        );
      })}
    </Glass>
  );
}

/** Hero card: what you saved this period, with money in / out and a comparison. */
export function FlowTiles({ s, previous, title = 'Saved' }: { s: Summary; previous?: Summary; title?: string }) {
  const c = useColors();
  const saved = s.inCents - s.outCents;
  // Only compare once this month has spending, so an empty month isn't "down 100%".
  const change = previous && previous.outCents > 0 && s.outCents > 0 ? Math.round(((s.outCents - previous.outCents) / previous.outCents) * 100) : null;
  return (
    <Glass strong tintColor={saved >= 0 ? '#14B8A6' : '#EF4444'} radius={26} style={{ padding: 18, gap: 14 }}>
      <View style={{ gap: 2 }}>
        <Text style={{ color: c.textSecondary, fontSize: 13, fontWeight: '700' }}>{saved >= 0 ? title : 'Overspent'}</Text>
        <Text style={{ color: c.text, fontSize: 34, fontWeight: '800', letterSpacing: -1, fontVariant: ['tabular-nums'] }} numberOfLines={1} adjustsFontSizeToFit>
          {formatCents(Math.abs(saved))}
        </Text>
      </View>
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <Flow label="Money in" value={formatCompact(s.inCents)} color={c.inMark} icon="south_west" />
        <Flow label="Money out" value={formatCompact(s.outCents)} color={c.outMark} icon="north_east" />
      </View>
      {change != null ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Icon name={change > 0 ? 'trending_up' : 'trending_down'} size={18} color={change > 0 ? c.outMark : c.inMark} />
          <Text style={{ color: c.textSecondary, fontSize: 13 }}>
            Spending {change === 0 ? 'same as' : `${change > 0 ? 'up' : 'down'} ${Math.abs(change)}% vs`} last month ({formatCompact(previous!.outCents)})
          </Text>
        </View>
      ) : null}
    </Glass>
  );
}

function Flow({ label, value, color, icon }: { label: string; value: string; color: string; icon: 'south_west' | 'north_east' }) {
  const c = useColors();
  return (
    <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: 'rgba(255,255,255,0.6)', borderRadius: 16, padding: 10, borderWidth: 1, borderColor: c.border }}>
      <IconBadge name={icon} color={color} size={32} />
      <View style={{ flex: 1 }}>
        <Text style={{ color: c.muted, fontSize: 11, fontWeight: '700' }}>{label}</Text>
        <Text style={{ color: c.text, fontSize: 16, fontWeight: '800', fontVariant: ['tabular-nums'] }} numberOfLines={1} adjustsFontSizeToFit>
          {value}
        </Text>
      </View>
    </View>
  );
}

/** One card per tax group, with category bars. */
export function GroupCards({ s, emptyText }: { s: Summary; emptyText: string }) {
  const c = useColors();
  if (s.groups.length === 0) {
    return (
      <Card style={{ alignItems: 'center', gap: 8, paddingVertical: 24 }}>
        <Icon name="insights" size={28} color={c.muted} />
        <Text style={{ color: c.muted, textAlign: 'center' }}>{emptyText}</Text>
      </Card>
    );
  }
  return (
    <>
      {s.groups.map((g) => {
        const meta = TAX_GROUPS[g.group];
        const max = Math.max(1, ...g.categories.map((x) => Math.abs(x.cents)));
        return (
          <Card key={g.group} style={{ gap: 12 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <IconBadge name={GROUP_ICONS[g.group]} color={meta.color} size={34} />
              <Text style={{ flex: 1, color: c.text, fontSize: 16, fontWeight: '800' }}>{meta.label}</Text>
              <Text style={{ color: c.text, fontSize: 16, fontWeight: '800', fontVariant: ['tabular-nums'] }}>
                {g.group === 'unsorted' ? `${g.count} to sort` : formatCents(g.cents)}
              </Text>
            </View>
            {g.group === 'unsorted' ? (
              <>
                <Muted style={{ paddingHorizontal: 0 }}>{meta.hint}</Muted>
                <Button label="Sort them now" kind="secondary" small icon="fact_check" onPress={() => router.navigate('/review')} />
              </>
            ) : null}
            {g.categories.map((cat) => (
              <View key={cat.category} style={{ gap: 6 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Icon name={categoryIcon(cat.category)} size={16} color={c.muted} />
                  <Text style={{ flex: 1, color: c.text, fontSize: 13 }}>
                    {getCategory(cat.category).label} <Text style={{ color: c.muted }}>· {cat.count}</Text>
                  </Text>
                  <Text style={{ color: c.text, fontSize: 13, fontWeight: '600', fontVariant: ['tabular-nums'] }}>{formatCents(cat.cents)}</Text>
                </View>
                <Bar fraction={Math.abs(cat.cents) / max} color={meta.color} />
              </View>
            ))}
          </Card>
        );
      })}
    </>
  );
}

export function BankBreakdown({ s }: { s: Summary }) {
  const c = useColors();
  if (s.byBank.length === 0) return null;
  return (
    <Card style={{ gap: 12 }}>
      {s.byBank.map((b) => (
        <View key={b.bank} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <IconBadge name="account_balance" color={BANKS[b.bank].color} size={32} />
          <Text style={{ flex: 1, color: c.text, fontWeight: '600' }}>{BANKS[b.bank].name}</Text>
          <Text style={{ color: c.textSecondary, fontSize: 12, fontVariant: ['tabular-nums'] }}>
            +{formatCompact(b.inCents)} / −{formatCompact(b.outCents)}
          </Text>
        </View>
      ))}
    </Card>
  );
}
