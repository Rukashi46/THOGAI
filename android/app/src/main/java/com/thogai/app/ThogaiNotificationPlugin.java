package com.thogai.app;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Build;
import android.provider.Settings;
import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import org.json.JSONArray;
import org.json.JSONObject;

import java.util.Set;

@CapacitorPlugin(name = "ThogaiNotification")
public class ThogaiNotificationPlugin extends Plugin {

    @PluginMethod
    public void isNotificationListenerEnabled(PluginCall call) {
        Context context = getContext();
        Set<String> packageNames = NotificationManagerCompat.getEnabledListenerPackages(context);
        boolean enabled = packageNames.contains(context.getPackageName());

        JSObject ret = new JSObject();
        ret.put("enabled", enabled);
        call.resolve(ret);
    }

    @PluginMethod
    public void requestNotificationListenerAccess(PluginCall call) {
        try {
            Intent intent = new Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS);
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(intent);

            JSObject ret = new JSObject();
            ret.put("opened", true);
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("Could not open notification listener settings: " + e.getMessage());
        }
    }

    @PluginMethod
    public void getDetectedPayments(PluginCall call) {
        try {
            SharedPreferences prefs = getContext().getSharedPreferences(
                PaymentNotificationListener.PREFS_NAME,
                Context.MODE_PRIVATE
            );
            String jsonStr = prefs.getString(PaymentNotificationListener.KEY_DETECTED, "[]");
            JSONArray array = new JSONArray(jsonStr);

            JSArray result = new JSArray();
            for (int i = 0; i < array.length(); i++) {
                JSONObject obj = array.getJSONObject(i);
                JSObject item = new JSObject();
                item.put("id", obj.optString("id"));
                item.put("amount", obj.optDouble("amount"));
                item.put("merchant", obj.optString("merchant"));
                item.put("rawText", obj.optString("rawText"));
                item.put("sourceApp", obj.optString("sourceApp"));
                item.put("timestamp", obj.optLong("timestamp"));
                item.put("read", obj.optBoolean("read", false));
                result.put(item);
            }

            JSObject ret = new JSObject();
            ret.put("payments", result);
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("Failed to read detected payments", e);
        }
    }

    @PluginMethod
    public void clearDetectedPayment(PluginCall call) {
        String id = call.getString("id");
        if (id == null) {
            call.reject("Missing payment ID");
            return;
        }

        try {
            SharedPreferences prefs = getContext().getSharedPreferences(
                PaymentNotificationListener.PREFS_NAME,
                Context.MODE_PRIVATE
            );
            String jsonStr = prefs.getString(PaymentNotificationListener.KEY_DETECTED, "[]");
            JSONArray array = new JSONArray(jsonStr);
            JSONArray updated = new JSONArray();

            for (int i = 0; i < array.length(); i++) {
                JSONObject obj = array.getJSONObject(i);
                if (!id.equals(obj.optString("id"))) {
                    updated.put(obj);
                }
            }

            prefs.edit().putString(PaymentNotificationListener.KEY_DETECTED, updated.toString()).apply();
            JSObject ret = new JSObject();
            ret.put("success", true);
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("Failed to clear payment", e);
        }
    }

    @PluginMethod
    public void clearAllDetectedPayments(PluginCall call) {
        try {
            SharedPreferences prefs = getContext().getSharedPreferences(
                PaymentNotificationListener.PREFS_NAME,
                Context.MODE_PRIVATE
            );
            prefs.edit().putString(PaymentNotificationListener.KEY_DETECTED, "[]").apply();
            JSObject ret = new JSObject();
            ret.put("success", true);
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("Failed to clear all payments", e);
        }
    }

    @PluginMethod
    public void markDetectedPaymentRead(PluginCall call) {
        String id = call.getString("id");
        if (id == null) {
            call.reject("Missing payment ID");
            return;
        }

        try {
            SharedPreferences prefs = getContext().getSharedPreferences(
                PaymentNotificationListener.PREFS_NAME,
                Context.MODE_PRIVATE
            );
            String jsonStr = prefs.getString(PaymentNotificationListener.KEY_DETECTED, "[]");
            JSONArray array = new JSONArray(jsonStr);
            JSONArray updated = new JSONArray();

            for (int i = 0; i < array.length(); i++) {
                JSONObject obj = array.getJSONObject(i);
                if (id.equals(obj.optString("id"))) {
                    obj.put("read", true);
                }
                updated.put(obj);
            }

            prefs.edit().putString(PaymentNotificationListener.KEY_DETECTED, updated.toString()).apply();
            JSObject ret = new JSObject();
            ret.put("success", true);
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("Failed to mark payment read", e);
        }
    }

    @PluginMethod
    public void markAllDetectedPaymentsRead(PluginCall call) {
        try {
            SharedPreferences prefs = getContext().getSharedPreferences(
                PaymentNotificationListener.PREFS_NAME,
                Context.MODE_PRIVATE
            );
            String jsonStr = prefs.getString(PaymentNotificationListener.KEY_DETECTED, "[]");
            JSONArray array = new JSONArray(jsonStr);
            JSONArray updated = new JSONArray();

            for (int i = 0; i < array.length(); i++) {
                JSONObject obj = array.getJSONObject(i);
                obj.put("read", true);
                updated.put(obj);
            }

            prefs.edit().putString(PaymentNotificationListener.KEY_DETECTED, updated.toString()).apply();
            JSObject ret = new JSObject();
            ret.put("success", true);
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("Failed to mark all payments read", e);
        }
    }

    @PluginMethod
    public void scheduleTestDailyReminder(PluginCall call) {
        int seconds = call.getInt("seconds", 5);
        try {
            DailyReminderReceiver.scheduleTestAlarm(getContext(), seconds);
            JSObject ret = new JSObject();
            ret.put("success", true);
            ret.put("seconds", seconds);
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("Failed to schedule test daily reminder", e);
        }
    }

    @PluginMethod
    public void scheduleDailyReminder(PluginCall call) {
        boolean enabled = call.getBoolean("enabled", true);
        String timeStr = call.getString("time", "20:30");

        try {
            SharedPreferences prefs = getContext().getSharedPreferences(
                PaymentNotificationListener.PREFS_NAME,
                Context.MODE_PRIVATE
            );
            prefs.edit()
                .putBoolean("daily_reminder_enabled", enabled)
                .putString("daily_reminder_time", timeStr)
                .apply();

            if (enabled) {
                DailyReminderReceiver.scheduleAlarm(getContext(), timeStr);
            } else {
                DailyReminderReceiver.cancelAlarm(getContext());
            }

            JSObject ret = new JSObject();
            ret.put("success", true);
            ret.put("enabled", enabled);
            ret.put("time", timeStr);
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("Failed to configure daily reminder", e);
        }
    }

    @PluginMethod
    public void postLocalNotification(PluginCall call) {
        String title = call.getString("title", "THOGAI Notification");
        String body = call.getString("body", "");
        String channelId = call.getString("channelId", "thogai_custom");

        try {
            Context context = getContext();
            NotificationManager manager = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
            if (manager != null) {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                    NotificationChannel channel = new NotificationChannel(
                        channelId,
                        "THOGAI Alerts",
                        NotificationManager.IMPORTANCE_HIGH
                    );
                    channel.enableVibration(true);
                    manager.createNotificationChannel(channel);
                }

                Intent intent = new Intent(context, MainActivity.class);
                intent.setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);

                int flags = PendingIntent.FLAG_UPDATE_CURRENT;
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                    flags |= PendingIntent.FLAG_IMMUTABLE;
                }
                PendingIntent pendingIntent = PendingIntent.getActivity(
                    context,
                    (int) System.currentTimeMillis(),
                    intent,
                    flags
                );

                NotificationCompat.Builder builder = new NotificationCompat.Builder(context, channelId)
                    .setSmallIcon(R.mipmap.ic_launcher)
                    .setContentTitle(title)
                    .setContentText(body)
                    .setStyle(new NotificationCompat.BigTextStyle().bigText(body))
                    .setPriority(NotificationCompat.PRIORITY_HIGH)
                    .setAutoCancel(true)
                    .setContentIntent(pendingIntent);

                manager.notify((int) (System.currentTimeMillis() % 100000), builder.build());
            }

            JSObject ret = new JSObject();
            ret.put("success", true);
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("Failed to post notification", e);
        }
    }

    @PluginMethod
    public void getLaunchPayment(PluginCall call) {
        JSObject ret = new JSObject();
        try {
            Intent intent = getActivity().getIntent();
            if (intent != null && "record_payment".equals(intent.getStringExtra("action"))) {
                ret.put("hasLaunchPayment", true);
                ret.put("amount", intent.getDoubleExtra("amount", 0.0));
                ret.put("merchant", intent.getStringExtra("merchant"));
                // Clear action so it doesn't trigger again on config change
                intent.removeExtra("action");
            } else {
                ret.put("hasLaunchPayment", false);
            }
        } catch (Exception ignored) {
            ret.put("hasLaunchPayment", false);
        }
        call.resolve(ret);
    }

    @PluginMethod
    public void getAppInfo(PluginCall call) {
        JSObject ret = new JSObject();
        try {
            Context context = getContext();
            android.content.pm.PackageInfo pInfo = context.getPackageManager().getPackageInfo(context.getPackageName(), 0);
            long versionCode = Build.VERSION.SDK_INT >= Build.VERSION_CODES.P 
                ? pInfo.getLongVersionCode() 
                : (long) pInfo.versionCode;
            ret.put("versionCode", versionCode);
            ret.put("versionName", pInfo.versionName);
            ret.put("packageName", context.getPackageName());
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("Failed to get app info", e);
        }
    }

    @PluginMethod
    public void canRequestPackageInstalls(PluginCall call) {
        JSObject ret = new JSObject();
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            ret.put("canInstall", getContext().getPackageManager().canRequestPackageInstalls());
        } else {
            ret.put("canInstall", true);
        }
        call.resolve(ret);
    }

    @PluginMethod
    public void openInstallPermissionSettings(PluginCall call) {
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                Intent intent = new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES);
                intent.setData(android.net.Uri.parse("package:" + getContext().getPackageName()));
                intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                getContext().startActivity(intent);
            }
            JSObject ret = new JSObject();
            ret.put("opened", true);
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("Could not open install permission settings", e);
        }
    }

    @PluginMethod
    public void downloadAndInstallApk(PluginCall call) {
        String apkUrl = call.getString("apkUrl");
        if (apkUrl == null || apkUrl.isEmpty()) {
            call.reject("Missing apkUrl");
            return;
        }

        new Thread(() -> {
            try {
                Context context = getContext();
                java.net.URL url = new java.net.URL(apkUrl);
                java.net.HttpURLConnection conn = (java.net.HttpURLConnection) url.openConnection();
                conn.setConnectTimeout(15000);
                conn.setReadTimeout(60000);
                conn.connect();

                if (conn.getResponseCode() != java.net.HttpURLConnection.HTTP_OK) {
                    call.reject("HTTP error downloading APK: " + conn.getResponseCode());
                    return;
                }

                java.io.File cacheDir = context.getExternalCacheDir();
                if (cacheDir == null) cacheDir = context.getCacheDir();
                java.io.File apkFile = new java.io.File(cacheDir, "thogai_update.apk");

                if (apkFile.exists()) {
                    apkFile.delete();
                }

                java.io.InputStream in = conn.getInputStream();
                java.io.FileOutputStream out = new java.io.FileOutputStream(apkFile);

                byte[] buffer = new byte[8192];
                int len;
                while ((len = in.read(buffer)) != -1) {
                    out.write(buffer, 0, len);
                }

                out.flush();
                out.close();
                in.close();
                conn.disconnect();

                // Trigger package installer via FileProvider
                android.net.Uri apkUri = androidx.core.content.FileProvider.getUriForFile(
                    context,
                    context.getPackageName() + ".fileprovider",
                    apkFile
                );

                Intent installIntent = new Intent(Intent.ACTION_VIEW);
                installIntent.setDataAndType(apkUri, "application/vnd.android.package-archive");
                installIntent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                installIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                context.startActivity(installIntent);

                JSObject ret = new JSObject();
                ret.put("success", true);
                call.resolve(ret);
            } catch (Exception e) {
                call.reject("Failed to download or install update: " + e.getMessage(), e);
            }
        }).start();
    }
}
