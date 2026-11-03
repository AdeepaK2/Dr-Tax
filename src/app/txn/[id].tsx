import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Alert, Text, TextInput, View } from 'react-native';

import { categoriesFor, getCategory, GROUPS_NEEDING_DETAILS, TAX_GROUP_ORDER, TAX_GROUPS } from '@/lib/categories';
import { formatDateTime } from '@/lib/dates';
import { addRule, deleteTxn, getTxn, smsForTxn, updateTxn } from '@/lib/db';
import { GENERIC_MERCHANT_KEYS, merchantKey } from '@/lib/parsers';
import { notifyDataChanged, useLoader } from '@/lib/store';
import { reapplyCategories } from '@/lib/sync';
import { BANKS, type TxnStatus } from '@/lib/types';
import { Amount, Button, Card, Chip, Muted, Screen, SectionTitle, statusLabel } from '@/ui/components';
import { IconBadge } from '@/ui/glass';
import { categoryIcon } from '@/ui/icons';
import { useColors } from '@/ui/theme';

const STATUSES: TxnStatus[] = ['confirmed', 'pending', 'cancelled', 'hold', 'excluded'];

const FLAG_TEXT = {
  possible_hold: 'Possible temporary hold: charged again at the same merchant within minutes.',
  check_cancel: 'Cancellation matched one of two close charges. Check it hit the right one.',
  low_confidence: 'Read from an unfamiliar SMS format. Check the amount and direction.',
} as const;

function detailPrompt(categoryId: string, direction: 'debit' | 'credit'): string {
  switch (categoryId) {
    case 'freelance_income':
      return 'Who was the client and what was the work? (e.g. “ABC Ltd — logo design, invoice #12”)';
    case 'salary':
      return 'Which employer and which month?';
    case 'gift_received':
      return 'Who gave it and for what occasion? Helps show it isn’t income.';
    case 'scholarship':
      return 'Name of the scholarship / who awarded it. Keep the award letter.';
    case 'family_support':
      return 'Who sent it? (e.g. “Father — monthly allowance”)';
    case 'loan_received':
    case 'loan_repaid_to_me':
      return 'Who is the loan with, and is it being repaid?';
    case 'medical':
    case 'education':
    case 'donation':
      return 'Who was it paid to and what for? Keep the receipt.';
    case 'tax_payment':
      return 'Which tax and period? (e.g. “APIT Oct 2026”, “IRD 2nd instalment”)';
    default:
      return direction === 'credit' ? 'Who paid you and what for?' : 'What was it for and who was it paid to?';
  }
}

function NoteField({ initial, autoFocus, onSave }: { initial: string; autoFocus: boolean; onSave: (note: string) => void }) {
  const c = useColors();
  const [note, setNote] = useState(initial);
  return (
    <TextInput
      autoFocus={autoFocus}
      value={note}
      onChangeText={setNote}
      onEndEditing={() => note !== initial && onSave(note.trim())}
      placeholder="e.g. client, receipt no., who it was for"
      placeholderTextColor={c.muted}
      multiline
      style={{ backgroundColor: c.input, color: c.text, borderRadius: 16, padding: 14, minHeight: 80, borderWidth: 1, borderColor: c.border, textAlignVertical: 'top' }}
    />
  );
}

export default function TxnDetail() {
  const c = useColors();
  const { id, details } = useLocalSearchParams<{ id: string; details?: string }>();
  const txnId = Number(id);
  const { data } = useLoader(async () => {
    const txn = await getTxn(txnId);
    return { txn, sms: txn ? await smsForTxn(txn) : [] };
  }, [txnId]);
  const txn = data?.txn;

  if (!data) return null;
  if (!txn) {
    return (
      <Screen underHeader subtitle="Not found">
        <Muted>This transaction was deleted.</Muted>
      </Screen>
    );
  }
  const t = txn;

  async function patch(p: Parameters<typeof updateTxn>[1]) {
    await updateTxn(t.id, p);
    notifyDataChanged();
  }

  async function setCategory(category: string) {
    await patch({ category, category_locked: 1 });
    const key = merchantKey(t.merchant);
    if (!key || GENERIC_MERCHANT_KEYS.has(key) || category === t.category || t.channel === 'manual') return;
    const way = t.direction === 'credit' ? 'money from' : 'payments to';
    Alert.alert('Use for similar payments?', `Always put ${way} “${key}” in ${getCategory(category).label}?`, [
      { text: 'Just this one', style: 'cancel' },
      {
        text: 'Always',
        onPress: async () => {
          await addRule(key, category);
          const n = await reapplyCategories();
          if (n) Alert.alert('Updated', `${n} other payment(s) re-categorised.`);
        },
      },
    ]);
  }

  const cats = categoriesFor(t.direction);
  const category = getCategory(t.category);
  const needsDetails = GROUPS_NEEDING_DETAILS.includes(category.group);

  return (
    <>
      <Stack.Screen options={{ title: t.merchant }} />
      <Screen underHeader subtitle={`${BANKS[t.bank].name}${t.account ? ` · ${t.account}` : ''}`}>
        <Card strong tintColor={TAX_GROUPS[category.group].color} style={{ gap: 6 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
            <IconBadge name={categoryIcon(t.category)} color={TAX_GROUPS[category.group].color} size={52} />
            <View style={{ flex: 1, gap: 2 }}>
              <Amount txn={t} size={28} />
              <Text style={{ color: c.muted }}>{formatDateTime(t.occurred_at)}</Text>
            </View>
          </View>
          <Text style={{ color: c.textSecondary, fontWeight: '600', marginTop: 4 }}>
            {getCategory(t.category).label} · {TAX_GROUPS[category.group].label}
          </Text>
          {t.flag ? <Text style={{ color: c.warn, marginTop: 4 }}>⚠︎ {FLAG_TEXT[t.flag]}</Text> : null}
          {t.flag ? (
            <View style={{ flexDirection: 'row', marginTop: 4 }}>
              <Button label="Clear warning" kind="secondary" small onPress={() => patch({ flag: null, reviewed: 1 })} />
            </View>
          ) : null}
        </Card>

        <SectionTitle>Status</SectionTitle>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
          {STATUSES.map((s) => (
            <Chip key={s} label={statusLabel(s)} selected={t.status === s} onPress={() => patch({ status: s, reviewed: 1 })} />
          ))}
        </View>
        <Muted>Cancelled, hold released and excluded payments are left out of your totals.</Muted>

        <SectionTitle>Category</SectionTitle>
        {TAX_GROUP_ORDER.map((g) => {
          const inGroup = cats.filter((x) => x.group === g);
          if (!inGroup.length) return null;
          return (
            <View key={g} style={{ gap: 6 }}>
              <Text style={{ color: TAX_GROUPS[g].color, fontWeight: '700', fontSize: 12 }}>{TAX_GROUPS[g].label.toUpperCase()}</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                {inGroup.map((x) => (
                  <Chip key={x.id} label={x.label} selected={t.category === x.id} color={TAX_GROUPS[g].color} dot onPress={() => setCategory(x.id)} />
                ))}
              </View>
            </View>
          );
        })}
        {category.hint ? <Muted>{category.hint}</Muted> : null}

        <SectionTitle>{needsDetails ? 'Details for your tax record' : 'Note'}</SectionTitle>
        {needsDetails && !t.note ? (
          <Text style={{ color: c.warn, fontSize: 13 }}>{detailPrompt(category.id, t.direction)}</Text>
        ) : null}
        <NoteField key={t.id} initial={t.note ?? ''} autoFocus={details === '1' && !t.note} onSave={(note) => patch({ note: note || null })} />

        {data.sms.length ? (
          <>
            <SectionTitle>Bank SMS</SectionTitle>
            {data.sms.map((m) => (
              <Card key={m.id} style={{ gap: 4 }}>
                <Text style={{ color: c.muted, fontSize: 12 }}>
                  {m.sender} · {formatDateTime(m.received_at)}
                </Text>
                <Text style={{ color: c.text, fontSize: 13 }}>{m.body}</Text>
              </Card>
            ))}
          </>
        ) : (
          <Muted>Added by hand.</Muted>
        )}

        {t.channel === 'manual' ? (
          <Button
            label="Delete"
            kind="danger"
            onPress={() =>
              Alert.alert('Delete this payment?', undefined, [
                { text: 'Cancel', style: 'cancel' },
                {
                  text: 'Delete',
                  style: 'destructive',
                  onPress: async () => {
                    await deleteTxn(t.id);
                    notifyDataChanged();
                    router.back();
                  },
                },
              ])
            }
          />
        ) : null}
      </Screen>
    </>
  );
}
