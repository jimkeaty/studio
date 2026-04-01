'use client';

import { useEffect, useState, useCallback } from 'react';
import { getMessaging, getToken, onMessage, MessagePayload } from 'firebase/messaging';
import { getFirestore, doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { useUser } from '@/firebase';
import { getFirebaseApp } from '@/lib/firebase';

// IMPORTANT: Replace this with your actual VAPID key from Firebase Console
// Firebase Console → Project Settings → Cloud Messaging → Web Push certificates → Key pair
const VAPID_KEY = process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY || '';

export type PushPermissionState = 'default' | 'granted' | 'denied' | 'unsupported';

export interface InAppNotification {
  id: string;
  title: string;
  body: string;
  url?: string;
  type?: 'deal' | 'tier' | 'goal' | 'system';
  timestamp: number;
}

export function usePushNotifications() {
  const { user } = useUser();
  const [permission, setPermission] = useState<PushPermissionState>('default');
  const [fcmToken, setFcmToken] = useState<string | null>(null);
  const [inAppNotifications, setInAppNotifications] = useState<InAppNotification[]>([]);
  const [isRegistering, setIsRegistering] = useState(false);

  // Check current permission state on mount
  useEffect(() => {
    if (typeof window === 'undefined' || !('Notification' in window)) {
      setPermission('unsupported');
      return;
    }
    setPermission(Notification.permission as PushPermissionState);
  }, []);

  // Register FCM token with Firestore so server can send targeted notifications
  const saveFcmToken = useCallback(async (token: string, userId: string) => {
    try {
      const app = getFirebaseApp();
      const db = getFirestore(app);
      await setDoc(
        doc(db, 'fcmTokens', userId),
        {
          token,
          userId,
          updatedAt: serverTimestamp(),
          platform: 'web',
          userAgent: navigator.userAgent,
        },
        { merge: true }
      );
      console.log('[FCM] Token saved to Firestore');
    } catch (err) {
      console.error('[FCM] Failed to save token:', err);
    }
  }, []);

  // Request permission and get FCM token
  const requestPermission = useCallback(async (): Promise<boolean> => {
    if (typeof window === 'undefined' || !('Notification' in window)) return false;
    if (!user?.uid) return false;

    setIsRegistering(true);
    try {
      const result = await Notification.requestPermission();
      setPermission(result as PushPermissionState);

      if (result !== 'granted') {
        setIsRegistering(false);
        return false;
      }

      // Register the FCM service worker
      const registration = await navigator.serviceWorker.register('/firebase-messaging-sw.js', {
        scope: '/',
      });

      const app = getFirebaseApp();
      const messaging = getMessaging(app);

      const token = await getToken(messaging, {
        vapidKey: VAPID_KEY,
        serviceWorkerRegistration: registration,
      });

      if (token) {
        setFcmToken(token);
        await saveFcmToken(token, user.uid);
      }

      setIsRegistering(false);
      return true;
    } catch (err) {
      console.error('[FCM] Permission/token error:', err);
      setIsRegistering(false);
      return false;
    }
  }, [user, saveFcmToken]);

  // Listen for foreground messages (app is open)
  useEffect(() => {
    if (typeof window === 'undefined' || !user?.uid || permission !== 'granted') return;

    let unsubscribe: (() => void) | undefined;

    const setupForegroundListener = async () => {
      try {
        const app = getFirebaseApp();
        const messaging = getMessaging(app);

        unsubscribe = onMessage(messaging, (payload: MessagePayload) => {
          console.log('[FCM] Foreground message:', payload);
          const { title, body } = payload.notification || {};
          if (!title) return;

          const notification: InAppNotification = {
            id: Date.now().toString(),
            title,
            body: body || '',
            url: payload.data?.url,
            type: (payload.data?.type as InAppNotification['type']) || 'system',
            timestamp: Date.now(),
          };

          setInAppNotifications((prev) => [notification, ...prev.slice(0, 19)]);
        });
      } catch (err) {
        console.error('[FCM] Foreground listener error:', err);
      }
    };

    setupForegroundListener();
    return () => { if (unsubscribe) unsubscribe(); };
  }, [user, permission]);

  const dismissNotification = useCallback((id: string) => {
    setInAppNotifications((prev) => prev.filter((n) => n.id !== id));
  }, []);

  const clearAll = useCallback(() => {
    setInAppNotifications([]);
  }, []);

  return {
    permission,
    fcmToken,
    inAppNotifications,
    isRegistering,
    requestPermission,
    dismissNotification,
    clearAll,
  };
}
