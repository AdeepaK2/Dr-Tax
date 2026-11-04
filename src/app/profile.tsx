import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, KeyboardAvoidingView, Text, View } from 'react-native';

import { pushProfile } from '@/lib/auth';
import { scanInboxBanks, type DetectedBank } from '@/lib/detect';
import { loadSettings, saveSettings, type AppSettings } from '@/lib/settings';
import { notifyDataChanged } from '@/lib/store';
import { reapplyCategories, syncSms } from '@/lib/sync';
import { Button, Card, Muted, Screen, SectionTitle } from '@/ui/components';
import { BanksEditor, NamesInput, TextField } from '@/ui/forms';
import { useColors } from '@/ui/theme';

/** Settings → Profile & banks: your name, other names, banks and accounts. */
export default function ProfileScreen() {
  const c = useColors();
  const [draft, setDraft] = useState<AppSettings | null>(null);
  const [detected, setDetected] = useState<DetectedBank[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    loadSettings().then(setDraft);
    scanInboxBanks().then(setDetected);
  }, []);

  async function save() {
    if (!draft) return;
    setBusy(true);
    try {
      const before = await loadSettings();
      await saveSettings({ ...before, profile: draft.profile, banks: draft.banks, accounts: draft.accounts });
      const changed = await reapplyCategories();
      pushProfile(await loadSettings()).catch(() => {});
      // New banks: read their SMS now.
      if (draft.banks.some((b) => !before.banks.includes(b))) syncSms().catch(() => {});
      notifyDataChanged();
      router.back();
      if (changed) Alert.alert('Saved', `${changed} payment(s) re-sorted with your updated names.`);
    } finally {
      setBusy(false);
    }
  }

  if (!draft) return null;
  return (
    <KeyboardAvoidingView behavior="padding" style={{ flex: 1 }}>
      <Screen underHeader>
        <SectionTitle>About you</SectionTitle>
        <Card style={{ gap: 14 }}>
          <TextField
            label="Your name"
            value={draft.profile.name}
            onChangeText={(name) => setDraft({ ...draft, profile: { ...draft.profile, name } })}
            autoCapitalize="words"
          />
          <View style={{ gap: 6 }}>
            <Text style={{ color: c.text, fontWeight: '700' }}>Other names on your bank SMS</Text>
            <NamesInput
              value={draft.profile.otherNames}
              onChange={(otherNames) => setDraft({ ...draft, profile: { ...draft.profile, otherNames } })}
              placeholder="e.g. GGAS KULARATHNA"
            />
          </View>
          <Muted style={{ paddingHorizontal: 0 }}>Money sent to these names, your first name or your account numbers is counted as moving your own money.</Muted>
        </Card>

        <SectionTitle>Banks & accounts</SectionTitle>
        <BanksEditor banks={draft.banks} accounts={draft.accounts} detected={detected} onChange={({ banks, accounts }) => setDraft({ ...draft, banks, accounts })} />

        <Button label="Save" icon="check" busy={busy} disabled={!draft.profile.name.trim()} onPress={save} />
      </Screen>
    </KeyboardAvoidingView>
  );
}
