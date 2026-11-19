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
import androidx.core.app.NotificationCompat;

import java.util.Calendar;

public class DailyReminderReceiver extends BroadcastReceiver {
    private static final String CHANNEL_REMINDERS = "thogai_reminders";
    public static final String ACTION_DAILY = "com.thogai.app.DAILY_REMINDER";

    @Override
    public void onReceive(Context context, Intent intent) {
        if (intent == null) return;
        String action = intent.getAction();

        SharedPreferences prefs = context.getSharedPreferences(PaymentNotificationListener.PREFS_NAME, Context.MODE_PRIVATE);
        boolean enabled = prefs.getBoolean("daily_reminder_enabled", true);
        String timeStr = prefs.getString("daily_reminder_time", "20:30");

        if (Intent.ACTION_BOOT_COMPLETED.equals(action)) {
            // Restore scheduled alarm on reboot
            if (enabled) {
                scheduleAlarm(context, timeStr);
            }
            return;
        }

        if (ACTION_DAILY.equals(action)) {
            if (enabled) {
                showDailyNotification(context);
                // Schedule next day's alarm
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
        } catch (Exception ignored) {}

        Calendar cal = Calendar.getInstance();
        cal.set(Calendar.HOUR_OF_DAY, hour);
        cal.set(Calendar.MINUTE, minute);
        cal.set(Calendar.SECOND, 0);
        cal.set(Calendar.MILLISECOND, 0);

        // If today's time has already passed, schedule for tomorrow
        if (cal.getTimeInMillis() <= System.currentTimeMillis()) {
            cal.add(Calendar.DAY_OF_YEAR, 1);
        }

        Intent intent = new Intent(context, DailyReminderReceiver.class);
        intent.setAction(ACTION_DAILY);

        int flags = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            flags |= PendingIntent.FLAG_IMMUTABLE;
        }
        PendingIntent pendingIntent = PendingIntent.getBroadcast(context, 1001, intent, flags);

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            alarmManager.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, cal.getTimeInMillis(), pendingIntent);
        } else {
            alarmManager.set(AlarmManager.RTC_WAKEUP, cal.getTimeInMillis(), pendingIntent);
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
    }

    private void showDailyNotification(Context context) {
        NotificationManager manager = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
        if (manager == null) return;

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(
                CHANNEL_REMINDERS,
                "Daily Reminders",
                NotificationManager.IMPORTANCE_DEFAULT
            );
            channel.setDescription("Daily evening reminder to review finances and budget");
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
            .setPriority(NotificationCompat.PRIORITY_DEFAULT)
            .setAutoCancel(true)
            .setContentIntent(pendingIntent);

        manager.notify(2001, builder.build());
    }
}
