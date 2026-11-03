import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';

import { formatDateTime } from '@/lib/dates';
import { listSms } from '@/lib/db';
import { useLoader } from '@/lib/store';
import { BANKS, type SmsKind } from '@/lib/types';
import { Card, Chip, Muted, Screen } from '@/ui/components';
import { useColors } from '@/ui/theme';

const KIND_LABEL: Record<SmsKind, string> = {
  txn: 'Payment',
  cancel: 'Cancellation',
  otp: 'One-time code',
  alert: 'Security alert',
  unknown: 'Not understood',
};

export default function Messages() {
  const c = useColors();
  const [kind, setKind] = useState<SmsKind | undefined>('unknown');
  const { data: sms } = useLoader(() => listSms(kind), [kind]);

  return (
    <Screen underHeader subtitle="Last 500 bank SMS Dr. Tax has read">
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
        <Chip label="All" selected={!kind} onPress={() => setKind(undefined)} />
        {(Object.keys(KIND_LABEL) as SmsKind[]).map((k) => (
          <Chip key={k} label={KIND_LABEL[k]} selected={kind === k} onPress={() => setKind(k)} />
        ))}
      </ScrollView>
      {kind === 'unknown' ? (
        <Muted>
          These came from your banks but didn’t look like a payment. If one of them is a payment, add it by hand, and send the message text to the developer so the format can be supported.
        </Muted>
      ) : null}
      {sms && sms.length === 0 ? <Muted>None.</Muted> : null}
      {(sms ?? []).map((m) => (
        <Pressable key={m.id} disabled={!m.txn_id} onPress={() => m.txn_id && router.push(`/txn/${m.txn_id}`)}>
          <Card style={{ gap: 4 }}>
            <View style={{ flexDirection: 'row' }}>
              <Text style={{ flex: 1, color: c.muted, fontSize: 12 }}>
                {BANKS[m.bank].short} · {m.sender} · {formatDateTime(m.received_at)}
              </Text>
              <Text style={{ color: m.kind === 'unknown' ? c.warn : c.muted, fontSize: 12, fontWeight: '600' }}>{KIND_LABEL[m.kind]}</Text>
            </View>
            <Text style={{ color: c.text, fontSize: 13 }} selectable>
              {m.body}
            </Text>
          </Card>
        </Pressable>
      ))}
    </Screen>
  );
}
