package com.thogai.app;

import android.app.AlarmManager;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Build;
import android.util.Log;
import androidx.core.app.NotificationCompat;
import org.json.JSONArray;
import org.json.JSONObject;

import java.util.Calendar;

public class DailyReminderReceiver extends BroadcastReceiver {
    private static final String TAG = "THOGAI_DailyReminder";
    private static final String CHANNEL_REMINDERS = "thogai_daily_reminders_v3";
    public static final String ACTION_DAILY = "com.thogai.app.DAILY_REMINDER";

    @Override
    public void onReceive(Context context, Intent intent) {
        if (intent == null) return;
        String action = intent.getAction();
        Log.i(TAG, "DailyReminder onReceive triggered with action: " + action);

        SharedPreferences prefs = context.getSharedPreferences(PaymentNotificationListener.PREFS_NAME, Context.MODE_PRIVATE);
        boolean enabled = prefs.getBoolean("daily_reminder_enabled", true);
        String timeStr = prefs.getString("daily_reminder_time", "20:30");

        if (Intent.ACTION_BOOT_COMPLETED.equals(action)) {
            if (enabled) {
                scheduleAlarm(context, timeStr);
            }
            return;
        }

        if (ACTION_DAILY.equals(action)) {
            if (enabled) {
                showDailyNotification(context);
                // Reschedule for next day
                scheduleAlarm(context, timeStr);
            }
        }
    }

    public static void scheduleAlarm(Context context, String timeStr) {
        AlarmManager alarmManager = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
        if (alarmManager == null) return;

        int hour = 20;
        int minute = 30;
        try {
            String[] parts = timeStr.split(":");
            hour = Integer.parseInt(parts[0].trim());
            minute = Integer.parseInt(parts[1].trim());
        } catch (Exception e) {
            Log.e(TAG, "Error parsing timeStr: " + timeStr, e);
        }

        Calendar cal = Calendar.getInstance();
        cal.set(Calendar.HOUR_OF_DAY, hour);
        cal.set(Calendar.MINUTE, minute);
        cal.set(Calendar.SECOND, 0);
        cal.set(Calendar.MILLISECOND, 0);

        // If today's time has already passed (more than 10 seconds ago), schedule for tomorrow
        if (cal.getTimeInMillis() <= System.currentTimeMillis() - 10000) {
            cal.add(Calendar.DAY_OF_YEAR, 1);
        }

        Intent intent = new Intent(context, DailyReminderReceiver.class);
        intent.setAction(ACTION_DAILY);
        intent.addFlags(Intent.FLAG_RECEIVER_FOREGROUND);

        int flags = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            flags |= PendingIntent.FLAG_IMMUTABLE;
        }
        PendingIntent pendingIntent = PendingIntent.getBroadcast(context, 1001, intent, flags);

        long triggerAt = cal.getTimeInMillis();
        Log.i(TAG, "Scheduling exact daily reminder for: " + cal.getTime() + " (" + triggerAt + ")");

        // 1. Primary mechanism: AlarmManager.setAlarmClock (highest priority in Android, immune to Doze and battery saving)
        try {
            Intent showIntent = new Intent(context, MainActivity.class);
            int showFlags = PendingIntent.FLAG_UPDATE_CURRENT;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                showFlags |= PendingIntent.FLAG_IMMUTABLE;
            }
            PendingIntent showPendingIntent = PendingIntent.getActivity(context, 1005, showIntent, showFlags);

            AlarmManager.AlarmClockInfo info = new AlarmManager.AlarmClockInfo(triggerAt, showPendingIntent);
            alarmManager.setAlarmClock(info, pendingIntent);
            Log.i(TAG, "Successfully scheduled with setAlarmClock at " + cal.getTime());
            return;
        } catch (Exception e) {
            Log.w(TAG, "setAlarmClock not permitted or failed, trying exact allow while idle: " + e.getMessage());
        }

        // 2. Fallback: setExactAndAllowWhileIdle if exact alarm permission granted
        boolean scheduled = false;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            if (alarmManager.canScheduleExactAlarms()) {
                try {
                    alarmManager.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, triggerAt, pendingIntent);
                    scheduled = true;
                } catch (SecurityException ignored) {}
            }
        } else if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            try {
                alarmManager.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, triggerAt, pendingIntent);
                scheduled = true;
            } catch (Exception ignored) {}
        }

        // 3. Last-resort fallback
        if (!scheduled) {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                alarmManager.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, triggerAt, pendingIntent);
            } else {
                alarmManager.set(AlarmManager.RTC_WAKEUP, triggerAt, pendingIntent);
            }
        }
    }

    public static void cancelAlarm(Context context) {
        AlarmManager alarmManager = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
        if (alarmManager == null) return;

        Intent intent = new Intent(context, DailyReminderReceiver.class);
        intent.setAction(ACTION_DAILY);

        int flags = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            flags |= PendingIntent.FLAG_IMMUTABLE;
        }
        PendingIntent pendingIntent = PendingIntent.getBroadcast(context, 1001, intent, flags);
        alarmManager.cancel(pendingIntent);
        Log.i(TAG, "Daily reminder alarm cancelled");
    }

    private void showDailyNotification(Context context) {
        NotificationManager manager = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
        if (manager == null) return;

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(
                CHANNEL_REMINDERS,
                "Daily Reminders",
                NotificationManager.IMPORTANCE_HIGH
            );
            channel.setDescription("Daily evening reminder to review finances and budget");
            channel.enableVibration(true);
            channel.enableLights(true);
            manager.createNotificationChannel(channel);
        }

        Intent intent = new Intent(context, MainActivity.class);
        intent.setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);

        int flags = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            flags |= PendingIntent.FLAG_IMMUTABLE;
        }
        PendingIntent pendingIntent = PendingIntent.getActivity(context, 1002, intent, flags);

        NotificationCompat.Builder builder = new NotificationCompat.Builder(context, CHANNEL_REMINDERS)
            .setSmallIcon(R.mipmap.ic_launcher)
            .setContentTitle("THOGAI — Daily Check-in")
            .setContentText("Take a moment to record today's expenses and check your budget!")
            .setStyle(new NotificationCompat.BigTextStyle()
                .bigText("Keeping your finances up-to-date helps you stay in control of your budget. Tap to log today's transactions."))
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setDefaults(NotificationCompat.DEFAULT_ALL)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setAutoCancel(true)
            .setContentIntent(pendingIntent);

        manager.notify(2001, builder.build());
        Log.i(TAG, "Daily notification displayed to user");

        // Also add to in-app notification center
        try {
            SharedPreferences prefs = context.getSharedPreferences(PaymentNotificationListener.PREFS_NAME, Context.MODE_PRIVATE);
            String existingJson = prefs.getString(PaymentNotificationListener.KEY_DETECTED, "[]");
            JSONArray array = new JSONArray(existingJson);

            JSONObject item = new JSONObject();
            item.put("id", "daily_" + System.currentTimeMillis());
            item.put("amount", 0);
            item.put("merchant", "Daily Check-in");
            item.put("rawText", "Daily check-in reminder to log expenses.");
            item.put("sourceApp", context.getPackageName());
            item.put("timestamp", System.currentTimeMillis());
            item.put("read", false);

            JSONArray updated = new JSONArray();
            updated.put(item);
            for (int i = 0; i < Math.min(array.length(), 29); i++) {
                updated.put(array.get(i));
            }
            prefs.edit().putString(PaymentNotificationListener.KEY_DETECTED, updated.toString()).apply();
        } catch (Exception ignored) {}
    }
}
