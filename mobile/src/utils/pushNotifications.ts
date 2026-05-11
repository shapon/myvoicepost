import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import * as SecureStore from 'expo-secure-store';
import { pushNotificationApi } from '../lib/api';

const PUSH_TOKEN_STORAGE_KEY = 'mvp_push_token';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

export async function registerForPushNotifications(): Promise<string | null> {
  try {
    console.log('[PushNotif] Requesting notification permissions...');

    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;

    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }

    if (finalStatus !== 'granted') {
      console.log('[PushNotif] Permission not granted');
      return null;
    }

    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'Default',
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#FF231F7C',
      });

      await Notifications.setNotificationChannelAsync('subscription', {
        name: 'Subscription Alerts',
        importance: Notifications.AndroidImportance.HIGH,
        description: 'Notifications about your subscription status',
      });
    }

    const tokenData = await Notifications.getExpoPushTokenAsync({
      projectId: undefined,
    });
    const pushToken = tokenData.data;

    console.log('[PushNotif] Got push token:', pushToken.substring(0, 20) + '...');

    await SecureStore.setItemAsync(PUSH_TOKEN_STORAGE_KEY, pushToken);

    return pushToken;
  } catch (error: any) {
    console.error('[PushNotif] Error registering for push notifications:', error.message);
    return null;
  }
}

export async function registerPushTokenWithServer(): Promise<void> {
  try {
    const pushToken = await registerForPushNotifications();
    if (!pushToken) {
      console.log('[PushNotif] No push token available, skipping server registration');
      return;
    }

    await pushNotificationApi.registerToken(
      pushToken,
      Platform.OS === 'ios' ? 'ios' : 'android',
    );

    console.log('[PushNotif] Push token registered with server');
  } catch (error: any) {
    console.error('[PushNotif] Failed to register push token with server:', error.message);
  }
}

export async function unregisterPushTokenFromServer(): Promise<void> {
  try {
    const pushToken = await SecureStore.getItemAsync(PUSH_TOKEN_STORAGE_KEY);
    if (!pushToken) {
      console.log('[PushNotif] No stored push token to unregister');
      return;
    }

    await pushNotificationApi.unregisterToken(pushToken);
    await SecureStore.deleteItemAsync(PUSH_TOKEN_STORAGE_KEY);

    console.log('[PushNotif] Push token unregistered from server');
  } catch (error: any) {
    console.error('[PushNotif] Failed to unregister push token:', error.message);
  }
}

export function addNotificationReceivedListener(
  callback: (notification: Notifications.Notification) => void
) {
  return Notifications.addNotificationReceivedListener(callback);
}

export function addNotificationResponseListener(
  callback: (response: Notifications.NotificationResponse) => void
) {
  return Notifications.addNotificationResponseReceivedListener(callback);
}
