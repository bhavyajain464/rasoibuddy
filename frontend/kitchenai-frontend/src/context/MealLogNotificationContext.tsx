import React, { useEffect, useRef } from 'react';
import { NavigationContainerRef } from '@react-navigation/native';
import {
  addMealLogNotificationResponseListener,
  getLastNotificationResponse,
  isMealLogNotificationResponse,
  isMealLogNotificationSupported,
  syncMealLogRemindersIfEnabled,
} from '../services/mealLogNotifications';

type RootParamList = {
  Meals: { openLog?: boolean } | undefined;
  [key: string]: object | undefined;
};

type Props = {
  navigationRef: React.RefObject<NavigationContainerRef<RootParamList> | null>;
  children: React.ReactNode;
};

export function MealLogNotificationProvider({ navigationRef, children }: Props) {
  const handledIds = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!isMealLogNotificationSupported()) return;

    void syncMealLogRemindersIfEnabled();

    const openMealLog = () => {
      const nav = navigationRef.current;
      if (!nav?.isReady()) return;
      nav.navigate('Meals', { openLog: true });
    };

    const handleResponse = (response: import('expo-notifications').NotificationResponse) => {
      const id = response.notification.request.identifier;
      if (handledIds.current.has(id)) return;
      handledIds.current.add(id);

      const data = response.notification.request.content.data as Record<string, unknown> | undefined;
      if (isMealLogNotificationResponse(data)) {
        openMealLog();
      }
    };

    let sub: { remove: () => void } | null = null;
    let cancelled = false;

    void (async () => {
      sub = await addMealLogNotificationResponseListener(handleResponse);
      if (cancelled) {
        sub?.remove();
        return;
      }
      const last = await getLastNotificationResponse();
      if (last) handleResponse(last);
    })();

    return () => {
      cancelled = true;
      sub?.remove();
    };
  }, [navigationRef]);

  return <>{children}</>;
}
