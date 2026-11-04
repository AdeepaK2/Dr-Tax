import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, Pressable, Text, View } from 'react-native';

import { getCategory, GROUPS_NEEDING_DETAILS, NEEDS_CHECK_CATEGORIES, QUICK_PICKS, TAX_GROUPS } from '@/lib/categories';
import { formatDateTime } from '@/lib/dates';
import { confirmAllPending, getTxn, listReviewQueue, updateTxn, type UpdatableTxn } from '@/lib/db';
import { formatCents } from '@/lib/money';
import { notifyDataChanged, useLoader } from '@/lib/store';
import { BANKS, type Txn } from '@/lib/types';
import { Amount, Button, Card, Chip, Muted, Screen } from '@/ui/components';
import { IconBadge } from '@/ui/glass';
import { categoryIcon } from '@/ui/icons';
import { useColors } from '@/ui/theme';

type Action = { label: string; kind?: 'primary' | 'secondary' | 'danger'; patch: UpdatableTxn; after?: string };

function issueFor(t: Txn, linked: Txn | null): { reason: string; actions: Action[] } | null {
  if (t.flag === 'check_cancel') {
    return {
      reason:
        'The bank cancelled a charge here, but there were two charges close together. This one was marked cancelled. Is that right?',
      actions: [
        { label: 'Yes, this one', patch: { flag: null, reviewed: 1 } },
        {
          label: 'No, the other one',
          kind: 'secondary',
          patch: { status: 'confirmed', flag: null, reviewed: 1 },
          after: 'Restored. Find the other charge in Payments and set it to Cancelled.',
        },
      ],
    };
  }
  if (t.flag === 'possible_hold') {
    const other = linked ? ` and ${formatCents(linked.amount_cents)} a few minutes later` : ' again a few minutes later';
    return {
      reason: `Charged ${formatCents(t.amount_cents)}${other} at the same merchant. The earlier one is often a temporary hold that is released.`,
      actions: [
        { label: 'It was a hold', patch: { status: 'hold', flag: null, reviewed: 1 } },
        { label: 'Both are real', kind: 'secondary', patch: { status: 'confirmed', flag: null, reviewed: 1 } },
      ],
    };
  }
  if (t.flag === 'low_confidence') {
    return {
      reason: 'This SMS was in a format Dr. Tax doesn’t know yet. Check the amount and whether money went in or out.',
      actions: [
        { label: 'Looks right', patch: { flag: null } },
        { label: 'Not a payment', kind: 'secondary', patch: { status: 'excluded', flag: null } },
      ],
    };
  }
  if (t.status === 'pending') {
    return {
      reason: 'Card charge not final yet. It is confirmed automatically after a few days unless the bank cancels it.',
      actions: [
        { label: 'Confirm', patch: { status: 'confirmed', reviewed: 1 } },
        { label: 'Was a hold', kind: 'secondary', patch: { status: 'hold', reviewed: 1 } },
        { label: 'Cancelled', kind: 'secondary', patch: { status: 'cancelled', reviewed: 1 } },
      ],
    };
  }
  return null;
}

function ReviewCard({ txn }: { txn: Txn }) {
  const c = useColors();
  const { data: linked } = useLoader(
    async () => (txn.linked_txn_id ? getTxn(txn.linked_txn_id) : null),
    [txn.linked_txn_id],
  );
  const issue = issueFor(txn, linked ?? null);
  const guessedCategory = NEEDS_CHECK_CATEGORIES.includes(txn.category) && !txn.category_locked;

  async function apply(patch: UpdatableTxn, after?: string) {
    await updateTxn(txn.id, patch);
    notifyDataChanged();
    if (after) Alert.alert('Done', after);
  }

  async function pick(category: string) {
    await apply({ category, category_locked: 1 });
    // For tax-relevant answers, open the payment so you can add who / what for.
    if (GROUPS_NEEDING_DETAILS.includes(getCategory(category).group) && !txn.note) {
      router.push(`/txn/${txn.id}?details=1`);
    }
  }

  return (
    <Card style={{ gap: 10 }}>
      <Pressable onPress={() => router.push(`/txn/${txn.id}`)} style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <IconBadge name={categoryIcon(txn.category)} color={TAX_GROUPS[getCategory(txn.category).group].color} />
        <View style={{ flex: 1 }}>
          <Text style={{ color: c.text, fontWeight: '700', fontSize: 16 }} numberOfLines={1}>
            {txn.merchant}
          </Text>
          <Text style={{ color: c.muted, fontSize: 12 }}>
            {BANKS[txn.bank].short} · {formatDateTime(txn.occurred_at)}
          </Text>
        </View>
        <Amount txn={txn} />
      </Pressable>

      {issue ? (
        <>
          <Text style={{ color: c.warn, fontSize: 13, lineHeight: 18 }}>{issue.reason}</Text>
          <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
            {issue.actions.map((a) => (
              <Button key={a.label} label={a.label} kind={a.kind} small onPress={() => apply(a.patch, a.after)} />
            ))}
          </View>
        </>
      ) : null}

      {guessedCategory ? (
        <>
          <Text style={{ color: c.text, fontSize: 14, fontWeight: '600' }}>
            {txn.direction === 'credit' ? 'What was this money for?' : 'What was this payment for?'}
          </Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
            {QUICK_PICKS[txn.direction].map((id) => {
              const cat = getCategory(id);
              return <Chip key={id} label={cat.label} color={TAX_GROUPS[cat.group].color} dot onPress={() => pick(id)} />;
            })}
            <Chip label="Something else…" onPress={() => router.push(`/txn/${txn.id}`)} />
          </View>
        </>
      ) : null}
    </Card>
  );
}

export default function Review() {
  const c = useColors();
  const [busy, setBusy] = useState(false);
  const { data: queue } = useLoader(listReviewQueue, []);
  const plainPending = (queue ?? []).filter((t) => t.status === 'pending' && !t.flag).length;

  async function confirmAll() {
    setBusy(true);
    try {
      const n = await confirmAllPending();
      notifyDataChanged();
      Alert.alert('Confirmed', `${n} card charge${n === 1 ? '' : 's'} marked as final.`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen title="Review" subtitle={queue ? `${queue.length} item${queue.length === 1 ? '' : 's'} to finalise` : undefined}>
      <Muted>
        Card charges (like Uber) can be held, changed or cancelled before they settle. Check these so your tax-year totals are right.
      </Muted>
      {plainPending > 1 ? <Button label={`Confirm all ${plainPending} pending charges`} kind="secondary" onPress={confirmAll} busy={busy} /> : null}
      {queue && queue.length === 0 ? (
        <Card>
          <Text style={{ textAlign: 'center', fontSize: 16, color: c.text }}>✅ All caught up</Text>
        </Card>
      ) : null}
      {(queue ?? []).map((t) => (
        <ReviewCard key={t.id} txn={t} />
      ))}
    </Screen>
  );
}
