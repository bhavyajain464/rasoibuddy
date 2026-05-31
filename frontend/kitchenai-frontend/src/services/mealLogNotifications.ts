import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { requireOptionalNativeModule } from 'expo-modules-core';

const STORAGE_KEY = 'meal_log_reminders_enabled';
const ANDROID_CHANNEL_ID = 'meal-log-reminders';

const MEAL_LOG_LUNCH_ID = 'meal-log-lunch';
const MEAL_LOG_DINNER_ID = 'meal-log-dinner';

const LUNCH_HOUR = 13;
const LUNCH_MINUTE = 30;
const DINNER_HOUR = 20;
const DINNER_MINUTE = 0;

export type MealLogNotificationData = {
  screen: 'Meals';
  openLog: boolean;
};

export type MealLogReminderToggleResult =
  | { ok: true }
  | { ok: false; reason: 'unsupported' | 'native_module' | 'permission_denied' | 'schedule_failed'; message: string };

type NotificationsModule = typeof import('expo-notifications');

let notificationsLoad: Promise<NotificationsModule | null> | null = null;

function resetNotificationsLoad(): void {
  notificationsLoad = null;
}

/** True when this build includes local notification scheduling (expo-notifications native). */
export function isMealLogNotificationSupported(): boolean {
  if (Platform.OS !== 'ios' && Platform.OS !== 'android') return false;
  return requireOptionalNativeModule('ExpoNotificationScheduler') != null;
}

async function loadNotifications(): Promise<NotificationsModule | null> {
  if (!isMealLogNotificationSupported()) return null;
  if (!notificationsLoad) {
    notificationsLoad = import('expo-notifications')
      .then((Notifications) => {
        Notifications.setNotificationHandler({
          handleNotification: async () => ({
            shouldShowAlert: true,
            shouldPlaySound: true,
            shouldSetBadge: false,
            shouldShowBanner: true,
            shouldShowList: true,
          }),
        });
        return Notifications;
      })
      .catch((err) => {
        console.warn('[meal-log-notifications] native module load failed:', err);
        resetNotificationsLoad();
        return null;
      });
  }
  return notificationsLoad;
}

export async function getMealLogRemindersEnabled(): Promise<boolean> {
  const v = await AsyncStorage.getItem(STORAGE_KEY);
  return v === 'true';
}

export async function setMealLogRemindersEnabled(
  enabled: boolean,
): Promise<MealLogReminderToggleResult> {
  if (!isMealLogNotificationSupported()) {
    return {
      ok: false,
      reason: 'unsupported',
      message: 'Meal log reminders are only available on the iOS and Android app.',
    };
  }

  if (!enabled) {
    await AsyncStorage.setItem(STORAGE_KEY, 'false');
    await cancelMealLogReminders();
    return { ok: true };
  }

  const Notifications = await loadNotifications();
  if (!Notifications) {
    return {
      ok: false,
      reason: 'native_module',
      message:
        'Notifications are not available in this app build. Run: npx expo run:android (or run:ios), then try again.',
    };
  }

  const perm = await ensureNotificationPermission();
  if (!perm.granted) {
    await AsyncStorage.setItem(STORAGE_KEY, 'false');
    return { ok: false, reason: 'permission_denied', message: perm.message };
  }

  try {
    await scheduleMealLogReminders(Notifications);
    await sendEnabledConfirmationPing(Notifications);
    await AsyncStorage.setItem(STORAGE_KEY, 'true');
    return { ok: true };
  } catch (err) {
    console.warn('[meal-log-notifications] schedule failed:', err);
    await AsyncStorage.setItem(STORAGE_KEY, 'false');
    return {
      ok: false,
      reason: 'schedule_failed',
      message: 'Could not schedule reminders. Try again or reinstall the dev build.',
    };
  }
}

type PermissionResult = { granted: boolean; message: string };

export async function ensureNotificationPermission(): Promise<PermissionResult> {
  const Notifications = await loadNotifications();
  if (!Notifications) {
    return { granted: false, message: 'Notifications module is not available in this build.' };
  }

  const existing = await Notifications.getPermissionsAsync();
  if (existing.granted) {
    return { granted: true, message: '' };
  }

  if (Platform.OS === 'android' && existing.status === 'denied' && existing.canAskAgain === false) {
    return {
      granted: false,
      message: 'Notifications are blocked. Open Settings → Kitchmate → Notifications and allow them.',
    };
  }

  const requested = await Notifications.requestPermissionsAsync({
    ios: {
      allowAlert: true,
      allowBadge: false,
      allowSound: true,
    },
    android: {},
  });

  if (requested.granted) {
    return { granted: true, message: '' };
  }

  if (Platform.OS === 'android') {
    return {
      granted: false,
      message:
        'Allow notifications when Android asks, or enable them in Settings → Kitchmate → Notifications.',
    };
  }

  return {
    granted: false,
    message: 'Allow notifications in the iOS prompt to turn on meal log reminders.',
  };
}

async function ensureAndroidChannel(Notifications: NotificationsModule): Promise<void> {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync(ANDROID_CHANNEL_ID, {
    name: 'Meal log reminders',
    importance: Notifications.AndroidImportance.HIGH,
    vibrationPattern: [0, 250, 250, 250],
    lightColor: '#2E7D32',
    lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
    bypassDnd: false,
    description: 'Reminders to log what you ate',
    sound: 'default',
    enableVibrate: true,
    showBadge: true,
  });
}

function mealLogContent(
  Notifications: NotificationsModule,
  mealLabel: string,
): import('expo-notifications').NotificationContentInput {
  return {
    title: 'Log what you ate',
    body: `Tap to log your ${mealLabel} — better suggestions and nutrition tracking.`,
    data: { screen: 'Meals', openLog: true } satisfies MealLogNotificationData,
    ...(Platform.OS === 'android' ? { channelId: ANDROID_CHANNEL_ID } : {}),
  };
}

async function scheduleMealLogReminders(Notifications: NotificationsModule): Promise<void> {
  await ensureAndroidChannel(Notifications);
  await cancelMealLogReminders();

  await Notifications.scheduleNotificationAsync({
    identifier: MEAL_LOG_LUNCH_ID,
    content: mealLogContent(Notifications, 'lunch'),
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DAILY,
      hour: LUNCH_HOUR,
      minute: LUNCH_MINUTE,
      ...(Platform.OS === 'android' ? { channelId: ANDROID_CHANNEL_ID } : {}),
    },
  });

  await Notifications.scheduleNotificationAsync({
    identifier: MEAL_LOG_DINNER_ID,
    content: mealLogContent(Notifications, 'dinner'),
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DAILY,
      hour: DINNER_HOUR,
      minute: DINNER_MINUTE,
      ...(Platform.OS === 'android' ? { channelId: ANDROID_CHANNEL_ID } : {}),
    },
  });
}

/** One-time ping so the user knows reminders are active (not a meal suggestion). */
async function sendEnabledConfirmationPing(Notifications: NotificationsModule): Promise<void> {
  await Notifications.scheduleNotificationAsync({
    identifier: 'meal-log-enabled-ping',
    content: {
      title: 'Meal log reminders on',
      body: 'You will get a nudge at 1:30 PM and 8:00 PM to log what you ate.',
      ...(Platform.OS === 'android' ? { channelId: ANDROID_CHANNEL_ID } : {}),
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
      seconds: 4,
      repeats: false,
    },
  });
}

export async function cancelMealLogReminders(): Promise<void> {
  const Notifications = await loadNotifications();
  if (!Notifications) return;
  const ids = [
    MEAL_LOG_LUNCH_ID,
    MEAL_LOG_DINNER_ID,
    'meal-log-enabled-ping',
    'meal-log-test-320',
    'meal-log-test-320-daily',
    'meal-log-test-soon',
  ];
  await Promise.all(ids.map((id) => Notifications.cancelScheduledNotificationAsync(id)));
}

export async function syncMealLogRemindersIfEnabled(): Promise<void> {
  if (!isMealLogNotificationSupported()) return;
  if (!(await getMealLogRemindersEnabled())) return;
  const Notifications = await loadNotifications();
  if (!Notifications) return;
  const perm = await ensureNotificationPermission();
  if (!perm.granted) return;
  try {
    await scheduleMealLogReminders(Notifications);
  } catch (err) {
    console.warn('[meal-log-notifications] sync schedule failed:', err);
  }
}

export function isMealLogNotificationResponse(
  data: Record<string, unknown> | undefined,
): data is MealLogNotificationData {
  return data?.screen === 'Meals' && data?.openLog === true;
}

export type NotificationResponseListener = (
  response: import('expo-notifications').NotificationResponse,
) => void;

export async function addMealLogNotificationResponseListener(
  listener: NotificationResponseListener,
): Promise<{ remove: () => void } | null> {
  const Notifications = await loadNotifications();
  if (!Notifications) return null;
  return Notifications.addNotificationResponseReceivedListener(listener);
}

export async function getLastNotificationResponse(): Promise<
  import('expo-notifications').NotificationResponse | null
> {
  const Notifications = await loadNotifications();
  if (!Notifications) return null;
  return Notifications.getLastNotificationResponseAsync();
}
