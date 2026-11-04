import * as Notifications from 'expo-notifications';
import { AndroidImportance } from 'expo-notifications';
import { router } from 'expo-router';
import { Platform } from 'react-native';

import { getCategory, GROUPS_NEEDING_DETAILS } from './categories';
import { getTxn, updateTxn } from './db';
import { formatCents } from './money';
import { loadSettings } from './settings';
import { notifyDataChanged } from './store';
import type { Txn } from './types';

const CHANNEL = 'sort-payments';
const CAT_IN = 'ask-money-in';
const CAT_OUT = 'ask-money-out';
const OPEN = 'open';
const PICK = 'pick:';

/** At most this many separate "what was this?" notifications per sync; the rest are summarised. */
const MAX_INDIVIDUAL = 3;
/** Only ask about recent payments individually (an old inbox import gets one summary). */
const RECENT_MS = 3 * 24 * 60 * 60 * 1000;

let setUp = false;
// The launch response can also arrive through the listener; handle each once.
const handled = new Set<string>();

/** Registers the channel and the quick-answer buttons. Safe to call many times. */
export async function setupNotifications(): Promise<void> {
  if (setUp || Platform.OS === 'web') return;
  setUp = true;
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: false,
      shouldSetBadge: false,
    }),
  });
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync(CHANNEL, {
      name: 'Payments to sort',
      description: 'Asks what a bank payment was for when Dr. Tax can’t tell',
      importance: AndroidImportance.DEFAULT,
    });
  }
  // Android shows up to three buttons.
  await Notifications.setNotificationCategoryAsync(CAT_IN, [
    { identifier: `${PICK}freelance_income`, buttonTitle: 'Freelance' },
    { identifier: `${PICK}gift_received`, buttonTitle: 'Gift' },
    { identifier: OPEN, buttonTitle: 'Other…' },
  ]);
  await Notifications.setNotificationCategoryAsync(CAT_OUT, [
    { identifier: `${PICK}personal_other`, buttonTitle: 'Personal' },
    { identifier: `${PICK}business_expense`, buttonTitle: 'Work' },
    { identifier: OPEN, buttonTitle: 'Other…' },
  ]);
}

export async function notificationsAllowed(): Promise<boolean> {
  const p = await Notifications.getPermissionsAsync();
  return p.granted;
}

export async function requestNotificationPermission(): Promise<boolean> {
  await setupNotifications();
  const current = await Notifications.getPermissionsAsync();
  if (current.granted) return true;
  if (!current.canAskAgain) return false;
  return (await Notifications.requestPermissionsAsync()).granted;
}

async function send(content: Notifications.NotificationContentInput) {
  await Notifications.scheduleNotificationAsync({
    content,
    trigger: Platform.OS === 'android' ? { channelId: CHANNEL } : null,
  });
}

/**
 * Called after a sync. Asks about payments Dr. Tax couldn't identify, and about possible holds.
 */
export async function askAboutNewPayments(unsorted: Txn[], possibleHolds: number): Promise<void> {
  const settings = await loadSettings();
  if (!settings.askWithNotifications) return;
  if (unsorted.length === 0 && possibleHolds === 0) return;
  await setupNotifications();
  if (!(await notificationsAllowed())) return;

  const recent = unsorted.filter((t) => t.occurred_at > Date.now() - RECENT_MS);
  const individual = recent.length <= MAX_INDIVIDUAL ? recent : [];
  const rest = unsorted.length - individual.length;

  for (const t of individual) {
    const credit = t.direction === 'credit';
    await send({
      title: credit ? `${formatCents(t.amount_cents)} received — what was it?` : `${formatCents(t.amount_cents)} paid — what was it for?`,
      body: `${credit ? 'From' : 'To'} ${t.merchant}. Tap a button, or “Other…” for gift, scholarship, loan and more.`,
      data: { txnId: t.id },
      categoryIdentifier: credit ? CAT_IN : CAT_OUT,
    });
  }

  if (rest > 0) {
    await send({
      title: `${rest} payment${rest === 1 ? '' : 's'} to sort`,
      body: 'Dr. Tax couldn’t tell what these were for. Sort them so your tax records are right.',
      data: { screen: 'review' },
    });
  }

  if (possibleHolds > 0) {
    await send({
      title: possibleHolds === 1 ? 'Possible double charge' : `${possibleHolds} possible double charges`,
      body: 'Charged twice at the same place within minutes (often Uber). One may be a temporary hold. Tap to check.',
      data: { screen: 'review' },
    });
  }
}

/** Handles a tap on a notification or one of its buttons. */
export async function handleNotificationResponse(response: Notifications.NotificationResponse): Promise<void> {
  const data = response.notification.request.content.data as { txnId?: number; screen?: string } | undefined;
  const action = response.actionIdentifier;
  const key = `${response.notification.request.identifier}|${action}`;
  if (handled.has(key)) return;
  handled.add(key);
  // Android leaves the notification up after a button tap.
  await Notifications.dismissNotificationAsync(response.notification.request.identifier).catch(() => {});

  if (data?.txnId != null) {
    const txn = await getTxn(Number(data.txnId));
    if (!txn) return;
    if (action.startsWith(PICK)) {
      const category = action.slice(PICK.length);
      await updateTxn(txn.id, { category, category_locked: 1 });
      notifyDataChanged();
      // Taxable income / work expenses: open it so you can add who and what for.
      if (!GROUPS_NEEDING_DETAILS.includes(getCategory(category).group)) return;
    }
    router.push(`/txn/${txn.id}`);
    return;
  }
  if (data?.screen === 'review') router.navigate('/review');
}
