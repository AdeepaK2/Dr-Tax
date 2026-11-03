import { DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as Notifications from 'expo-notifications';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { AppState } from 'react-native';

// Importing this also defines the background task, which must happen at startup.
import { registerBackgroundSync } from '@/lib/backgroundSync';
import { maybeNightlyBackup } from '@/lib/backup';
import { getDb } from '@/lib/db';
import { handleNotificationResponse, setupNotifications } from '@/lib/notify';
import { hasSmsPermission, syncSms } from '@/lib/sync';

SplashScreen.preventAutoHideAsync();

// Light glass look everywhere (navigation colours match the backdrop).
const LightGlassTheme = {
  ...DefaultTheme,
  colors: { ...DefaultTheme.colors, background: '#F3F5FC', card: '#EEF1FB', primary: '#0D9488', text: '#0F172A', border: 'transparent' },
};

async function syncIfAllowed() {
  await registerBackgroundSync();
  if (await hasSmsPermission()) await syncSms();
  // Catches up if last night's backup didn't run (phone off, no network…).
  await maybeNightlyBackup();
}

export default function RootLayout() {

  useEffect(() => {
    // Notification taps: while running, and the one that launched the app.
    const tapSub = Notifications.addNotificationResponseReceivedListener((r) => {
      handleNotificationResponse(r).catch((e) => console.warn('Notification action failed', e));
    });

    getDb()
      .then(() => SplashScreen.hideAsync())
      .then(setupNotifications)
      .then(async () => {
        const launch = await Notifications.getLastNotificationResponseAsync();
        if (launch) {
          await Notifications.clearLastNotificationResponseAsync();
          await handleNotificationResponse(launch);
        }
      })
      .then(syncIfAllowed)
      .catch((e) => console.warn('Startup sync failed', e));

    // Pick up new bank SMS whenever you come back to the app.
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') syncIfAllowed().catch((e) => console.warn('Sync failed', e));
    });
    return () => {
      sub.remove();
      tapSub.remove();
    };
  }, []);

  return (
    <ThemeProvider value={LightGlassTheme}>
      <StatusBar style="dark" />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: '#EEF1FB' },
          headerShadowVisible: false,
          headerTintColor: '#0F766E',
          headerTitleStyle: { color: '#0F172A', fontWeight: '800' },
          contentStyle: { backgroundColor: '#F3F5FC' },
        }}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="txn/[id]" options={{ title: 'Transaction' }} />
        <Stack.Screen name="add" options={{ title: 'Add transaction', presentation: 'modal' }} />
        <Stack.Screen name="messages" options={{ title: 'Bank messages' }} />
      </Stack>
    </ThemeProvider>
  );
}
