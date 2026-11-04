import { Image } from 'expo-image';
import { router } from 'expo-router';
import type { AndroidSymbol } from 'expo-symbols';
import { Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/ui/components';
import { Backdrop, Glass, IconBadge } from '@/ui/glass';
import { useColors } from '@/ui/theme';

const POINTS: { icon: AndroidSymbol; color: string; title: string; body: string }[] = [
  { icon: 'sms', color: '#14B8A6', title: 'Reads your bank SMS', body: 'Payments from your banks are recorded automatically. One-time codes are never stored.' },
  { icon: 'fact_check', color: '#6366F1', title: 'Sorted for tax', body: 'Income, gifts, scholarships, reliefs and work costs kept apart. It asks when it can’t tell.' },
  { icon: 'cloud_done', color: '#E87BA4', title: 'Backed up nightly', body: 'Your account keeps your records safe and private, even if you change phones.' },
];

export default function Welcome() {
  const c = useColors();
  const insets = useSafeAreaInsets();
  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Backdrop />
      <View style={{ flex: 1, paddingTop: insets.top + 40, paddingBottom: insets.bottom + 24, paddingHorizontal: 22, gap: 22 }}>
        <View style={{ alignItems: 'center', gap: 12 }}>
          <Image source={require('@/assets/images/icon.png')} style={{ width: 96, height: 96, borderRadius: 26 }} />
          <Text style={{ fontSize: 36, fontWeight: '800', color: c.text, letterSpacing: -1 }}>Dr. Tax</Text>
          <Text style={{ fontSize: 16, color: c.textSecondary, textAlign: 'center' }}>Your bank SMS, sorted for your tax return.</Text>
        </View>

        <Glass strong style={{ padding: 16, gap: 16 }}>
          {POINTS.map((p) => (
            <View key={p.title} style={{ flexDirection: 'row', gap: 12 }}>
              <IconBadge name={p.icon} color={p.color} size={40} />
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={{ color: c.text, fontWeight: '800' }}>{p.title}</Text>
                <Text style={{ color: c.textSecondary, fontSize: 13, lineHeight: 18 }}>{p.body}</Text>
              </View>
            </View>
          ))}
        </Glass>

        <View style={{ flex: 1 }} />

        <View style={{ gap: 10 }}>
          <Button label="Create account" icon="person_add" onPress={() => router.push('/sign-in?mode=signup')} />
          <Button label="I already have an account" kind="secondary" icon="login" onPress={() => router.push('/sign-in?mode=signin')} />
          <Pressable onPress={() => router.push('/setup?from=local')} style={{ paddingVertical: 10, alignItems: 'center' }}>
            <Text style={{ color: c.primaryDeep, fontWeight: '700' }}>Use without an account</Text>
            <Text style={{ color: c.muted, fontSize: 12 }}>Data stays on this phone only. No backups.</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}
