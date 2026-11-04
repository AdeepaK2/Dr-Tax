import { NativeTabs } from 'expo-router/native-tabs';

import { reviewCount } from '@/lib/db';
import { useLoader } from '@/lib/store';
import { useColors } from '@/ui/theme';

export default function TabsLayout() {
  const c = useColors();
  const { data: toReview } = useLoader(reviewCount, []);

  return (
    <NativeTabs
      backgroundColor="#F7F8FE"
      indicatorColor="#CCF2EC"
      iconColor={{ default: c.muted, selected: c.primaryDeep }}
      labelStyle={{ default: { color: c.muted }, selected: { color: c.primaryDeep, fontWeight: '700' } }}>
      <NativeTabs.Trigger name="index">
        <NativeTabs.Trigger.Label>Home</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="house" md="home" />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="transactions">
        <NativeTabs.Trigger.Label>Payments</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="list.bullet.rectangle" md="receipt_long" />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="review">
        <NativeTabs.Trigger.Label>Review</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="checkmark.seal" md="fact_check" />
        <NativeTabs.Trigger.Badge hidden={!toReview}>{toReview ? String(toReview) : undefined}</NativeTabs.Trigger.Badge>
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="reports">
        <NativeTabs.Trigger.Label>Overview</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="chart.bar" md="bar_chart" />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="settings">
        <NativeTabs.Trigger.Label>Settings</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="gearshape" md="settings" />
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
