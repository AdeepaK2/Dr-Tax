import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Alert, KeyboardAvoidingView, Pressable, Text, View } from 'react-native';

import { backToWelcome, useAppState } from '@/lib/appState';
import { dataOwner, pushProfile, setDataOwner, signIn, signOut, signUp } from '@/lib/auth';
import { listAllTxns, wipeAll } from '@/lib/db';
import { loadSettings } from '@/lib/settings';
import { notifyDataChanged } from '@/lib/store';
import { Banner, Button, Card, Screen } from '@/ui/components';
import { TextField } from '@/ui/forms';
import { useColors } from '@/ui/theme';

const ask = (title: string, message: string, ok: string) =>
  new Promise<boolean>((resolve) =>
    Alert.alert(title, message, [
      { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
      { text: ok, style: 'destructive', onPress: () => resolve(true) },
    ]),
  );

export default function SignIn() {
  const c = useColors();
  const { onboarded } = useAppState();
  const params = useLocalSearchParams<{ mode?: string }>();
  const [mode, setMode] = useState<'signin' | 'signup'>(params.mode === 'signup' ? 'signup' : 'signin');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const signup = mode === 'signup';

  async function submit() {
    setError(null);
    if (signup && !name.trim()) return setError('Enter your name.');
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) return setError('Enter a valid email address.');
    if (password.length < 8) return setError('Password must be at least 8 characters.');
    setBusy(true);
    try {
      const session = signup
        ? await signUp({ name: name.trim(), email: email.trim(), password })
        : await signIn({ email: email.trim(), password });

      // Don't mix two people's payments on one phone.
      let setUp = onboarded;
      const owner = await dataOwner();
      if (owner && owner !== session.user.id && (await listAllTxns()).length > 0) {
        const wipe = await ask(
          'This phone has someone else’s data',
          'Payments on this phone belong to another account. Remove them from this phone to continue? (Their backup on the server is not affected.)',
          'Remove and continue',
        );
        if (!wipe) {
          await signOut();
          return;
        }
        await wipeAll();
        notifyDataChanged();
        backToWelcome();
        setUp = false;
      }
      await setDataOwner(session.user.id);

      if (setUp) {
        // Signed in from Settings: keep this phone's data under the account.
        await pushProfile(await loadSettings()).catch(() => {});
        router.back();
      } else {
        router.replace('/setup?from=account');
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <KeyboardAvoidingView behavior="padding" style={{ flex: 1 }}>
      <Screen underHeader title={signup ? 'Create account' : 'Sign in'} subtitle={signup ? 'Your records stay private to your account.' : 'Welcome back.'}>
        <Card strong style={{ gap: 14 }}>
          {signup ? <TextField label="Your name" value={name} onChangeText={setName} placeholder="e.g. Adeepa Kularathna" autoCapitalize="words" /> : null}
          <TextField label="Email" value={email} onChangeText={setEmail} placeholder="you@example.com" keyboardType="email-address" autoCapitalize="none" />
          <TextField
            label="Password"
            value={password}
            onChangeText={setPassword}
            placeholder={signup ? 'At least 8 characters' : 'Your password'}
            secure
            autoCapitalize="none"
          />
          {error ? <Banner>{error}</Banner> : null}
          <Button label={signup ? 'Create account' : 'Sign in'} onPress={submit} busy={busy} icon={signup ? 'person_add' : 'login'} />
        </Card>
        <Pressable onPress={() => setMode(signup ? 'signin' : 'signup')} style={{ alignItems: 'center', paddingVertical: 8 }}>
          <Text style={{ color: c.primaryDeep, fontWeight: '700' }}>{signup ? 'I already have an account' : 'New here? Create an account'}</Text>
        </Pressable>
        <View style={{ paddingHorizontal: 8 }}>
          <Text style={{ color: c.muted, fontSize: 12, textAlign: 'center', lineHeight: 18 }}>
            Your password is stored scrambled (hashed) on your Dr. Tax server. Bank SMS are read on your phone; only your own account can see your backups.
          </Text>
        </View>
      </Screen>
    </KeyboardAvoidingView>
  );
}
