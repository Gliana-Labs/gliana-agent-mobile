/**
 * The daily nudge: "today's quest is X, the round ends in Y".
 *
 * LOCAL notifications, scheduled on the device — no push service, no token, no
 * server holding a list of who installed the app. It works because the app
 * already knows everything the reminder needs: a round is a UTC day, its id IS
 * the day number, and the theme comes from a fixed list indexed by that number
 * (see arena/config.ts). A phone in aeroplane mode can still tell you what
 * today's quest is.
 *
 * That also means there is nothing to opt into beyond the OS permission, and
 * nothing to leak: we never learn that the notification fired.
 */
import * as Notifications from 'expo-notifications';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { roundIdFor, themeFor } from '../arena/config';

const ASKED_KEY = 'gliana-agent:quest-reminder-asked:v1';
/** How many days ahead to schedule. Beyond a week the themes are still right, but so is a re-open. */
const DAYS = 7;
/** Local hour to fire. Evening: the round ends at UTC midnight, which is early morning in WIB. */
const HOUR = 19;

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

/**
 * Ask once, ever. A permission prompt on first launch, before anyone has seen
 * what the app does, is the fastest way to get a permanent "no" — so this is
 * called after the player has actually entered a round.
 */
export async function offerQuestReminder(): Promise<void> {
  try {
    if (await AsyncStorage.getItem(ASKED_KEY)) return;
    await AsyncStorage.setItem(ASKED_KEY, '1');
    const { status } = await Notifications.requestPermissionsAsync();
    if (status !== 'granted') return;
    await rescheduleQuestReminders();
  } catch {
    // Notifications are a nicety; never let them break a round.
  }
}

/**
 * Rewrite the schedule for the next week.
 *
 * Cancel-then-schedule rather than adding: a player who opens the app daily
 * would otherwise accumulate duplicates for the same day, and there is no way
 * to ask the OS "do you already have this one".
 */
export async function rescheduleQuestReminders(): Promise<void> {
  try {
    const { status } = await Notifications.getPermissionsAsync();
    if (status !== 'granted') return;
    await Notifications.cancelAllScheduledNotificationsAsync();

    for (let i = 0; i < DAYS; i++) {
      const when = new Date();
      when.setDate(when.getDate() + i);
      when.setHours(HOUR, 0, 0, 0);
      if (when.getTime() <= Date.now()) continue; // today's slot has passed
      const theme = themeFor(roundIdFor(when));
      await Notifications.scheduleNotificationAsync({
        content: {
          title: "Today's quest",
          // The theme IS the hook. "Open the app" is not a reason to open an app.
          body: `${theme} — shoot it, restyle it, enter the arena.`,
        },
        trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: when },
      });
    }
  } catch {
    /* scheduling is best-effort */
  }
}
