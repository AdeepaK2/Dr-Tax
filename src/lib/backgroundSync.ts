import * as BackgroundTask from 'expo-background-task';
import * as TaskManager from 'expo-task-manager';

import { maybeNightlyBackup } from './backup';
import { syncSms } from './sync';

export const SYNC_TASK = 'dr-tax-sms-sync';

// Must be defined at module load (imported from the root layout) so Android can run it
// while the app is closed.
TaskManager.defineTask(SYNC_TASK, async () => {
  try {
    await syncSms().catch((e) => console.warn('Background SMS sync failed', e));
    // Once a night, send everything to your backup server.
    await maybeNightlyBackup();
    return BackgroundTask.BackgroundTaskResult.Success;
  } catch (e) {
    console.warn('Background SMS sync failed', e);
    return BackgroundTask.BackgroundTaskResult.Failed;
  }
});

/** Asks Android to run roughly every hour (it decides the exact timing): SMS sync + nightly backup. */
export async function registerBackgroundSync(): Promise<void> {
  try {
    const status = await BackgroundTask.getStatusAsync();
    if (status !== BackgroundTask.BackgroundTaskStatus.Available) return;
    if (await TaskManager.isTaskRegisteredAsync(SYNC_TASK)) return;
    await BackgroundTask.registerTaskAsync(SYNC_TASK, { minimumInterval: 60 });
  } catch (e) {
    console.warn('Could not register background sync', e);
  }
}
