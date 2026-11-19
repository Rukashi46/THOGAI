package com.thogai.app;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Build;
import android.os.Bundle;
import android.service.notification.NotificationListenerService;
import android.service.notification.StatusBarNotification;
import android.util.Log;
import androidx.core.app.NotificationCompat;
import org.json.JSONArray;
import org.json.JSONObject;

import java.util.HashSet;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

public class PaymentNotificationListener extends NotificationListenerService {
    private static final String TAG = "ThogaiPaymentDetector";
    public static final String PREFS_NAME = "thogai_notifications";
    public static final String KEY_DETECTED = "detected_payments";
    public static final String CHANNEL_PAYMENTS = "thogai_payments";

    // Deduplication cache: hash -> timestamp
    private static final Set<String> recentHashes = new HashSet<>();

    // Known payment & banking app package names
    private static final Set<String> PAYMENT_PACKAGES = new HashSet<>();
    static {
        PAYMENT_PACKAGES.add("com.google.android.apps.nbu.paisa.user"); // Google Pay
        PAYMENT_PACKAGES.add("com.phonepe.app");                        // PhonePe
        PAYMENT_PACKAGES.add("net.one97.paytm");                        // Paytm
        PAYMENT_PACKAGES.add("com.dreamplug.androidapp");               // CRED
        PAYMENT_PACKAGES.add("in.org.npci.upiapp");                     // BHIM
        PAYMENT_PACKAGES.add("com.whatsapp");                          // WhatsApp Pay
        PAYMENT_PACKAGES.add("com.sbi.lotusintouch");                  // SBI Yono
        PAYMENT_PACKAGES.add("com.snapwork.hdfc");                      // HDFC Bank
        PAYMENT_PACKAGES.add("com.csam.icici.bank.imobile");           // iMobile
        PAYMENT_PACKAGES.add("com.axis.mobile");                       // Axis Mobile
        PAYMENT_PACKAGES.add("com.msf.kbank.mobile");                  // Kotak Bank
        PAYMENT_PACKAGES.add("com.fampay.in");                         // FamPay
        PAYMENT_PACKAGES.add("money.jupiter");                         // Jupiter
        PAYMENT_PACKAGES.add("co.fi.money");                           // Fi Money
        PAYMENT_PACKAGES.add("com.google.android.apps.messaging");      // SMS (Google Messages)
        PAYMENT_PACKAGES.add("com.samsung.android.messaging");         // SMS (Samsung)
        PAYMENT_PACKAGES.add("com.android.mms");                       // SMS (Default AOSP)
    }

    // Regex for payment debits
    private static final Pattern AMOUNT_PATTERN = Pattern.compile(
        "(?:(?:Rs\\.?|INR|₹)\\s*([0-9,]+(?:\\.[0-9]{1,2})?))|([0-9,]+(?:\\.[0-9]{1,2})?)\\s*(?:INR|Rs|rupees)",
        Pattern.CASE_INSENSITIVE
    );

    private static final Pattern DEBIT_KEYWORDS = Pattern.compile(
        "\\b(paid|debited|spent|sent|transferred|txn|payment of|vpa|autopay|purchase|withdrawn|dr)\\b",
        Pattern.CASE_INSENSITIVE
    );

    private static final Pattern OTP_EXCLUDE = Pattern.compile(
        "\\b(otp|verification code|secret code|one time password)\\b",
        Pattern.CASE_INSENSITIVE
    );

    private static final Pattern MERCHANT_PATTERN = Pattern.compile(
        "(?:to|at|info:?|towards|for)\\s+([A-Za-z0-9\\s&'.-]{2,28})",
        Pattern.CASE_INSENSITIVE
    );

    @Override
    public void onNotificationPosted(StatusBarNotification sbn) {
        if (sbn == null || sbn.getPackageName() == null) return;

        // Skip THOGAI's own notifications to prevent loop
        if (sbn.getPackageName().equals(getPackageName())) return;

        try {
            android.app.Notification notif = sbn.getNotification();
            if (notif == null) return;
            Bundle extras = notif.extras;
            if (extras == null) return;

            CharSequence titleCs = extras.getCharSequence(android.app.Notification.EXTRA_TITLE);
            CharSequence textCs = extras.getCharSequence(android.app.Notification.EXTRA_TEXT);
            CharSequence bigTextCs = extras.getCharSequence(android.app.Notification.EXTRA_BIG_TEXT);

            String title = titleCs != null ? titleCs.toString() : "";
            String text = textCs != null ? textCs.toString() : "";
            String bigText = bigTextCs != null ? bigTextCs.toString() : "";

            String fullText = (title + " " + text + " " + bigText).trim();
            if (fullText.isEmpty()) return;

            // Check if from known financial app or has clear debit keywords
            boolean isKnownPackage = PAYMENT_PACKAGES.contains(sbn.getPackageName());
            boolean hasDebitKeyword = DEBIT_KEYWORDS.matcher(fullText).find();

            if (!isKnownPackage && !hasDebitKeyword) {
                return;
            }

            // Exclude OTPs
            if (OTP_EXCLUDE.matcher(fullText).find()) {
                return;
            }

            // Check if amount is present
            Matcher amountMatcher = AMOUNT_PATTERN.matcher(fullText);
            if (!amountMatcher.find()) {
                return;
            }

            String amountRaw = amountMatcher.group(1);
            if (amountRaw == null) amountRaw = amountMatcher.group(2);
            if (amountRaw == null) return;

            double amount;
            try {
                amount = Double.parseDouble(amountRaw.replace(",", "").trim());
            } catch (NumberFormatException e) {
                return;
            }

            if (amount <= 0) return;

            // Extract merchant
            String merchant = "Payment";
            Matcher merchantMatcher = MERCHANT_PATTERN.matcher(fullText);
            if (merchantMatcher.find()) {
                String found = merchantMatcher.group(1);
                if (found != null && !found.trim().isEmpty()) {
                    merchant = found.trim();
                    // Clean up trailing punct
                    merchant = merchant.replaceAll("(?i)\\b(on|ref|upi|avl|bal|a/c|via)\\b.*$", "").trim();
                    if (merchant.length() > 25) merchant = merchant.substring(0, 25);
                }
            } else if (!title.isEmpty() && !title.equalsIgnoreCase("Notification")) {
                merchant = title.trim();
            }

            // Deduplicate
            String hash = amount + "_" + merchant + "_" + (System.currentTimeMillis() / 60000);
            synchronized (recentHashes) {
                if (recentHashes.contains(hash)) return;
                recentHashes.add(hash);
                if (recentHashes.size() > 50) recentHashes.clear();
            }

            Log.i(TAG, "Payment detected: " + amount + " to " + merchant);

            // Store in SharedPreferences
            saveDetectedPayment(amount, merchant, fullText, sbn.getPackageName());

            // Post reminder notification
            postReminderNotification(amount, merchant);

        } catch (Exception e) {
            Log.e(TAG, "Error processing notification", e);
        }
    }

    private void saveDetectedPayment(double amount, String merchant, String rawText, String sourceApp) {
        try {
            SharedPreferences prefs = getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
            String existingJson = prefs.getString(KEY_DETECTED, "[]");
            JSONArray array = new JSONArray(existingJson);

            JSONObject item = new JSONObject();
            item.put("id", "det_" + System.currentTimeMillis() + "_" + (int)(Math.random() * 1000));
            item.put("amount", amount);
            item.put("merchant", merchant);
            item.put("rawText", rawText);
            item.put("sourceApp", sourceApp);
            item.put("timestamp", System.currentTimeMillis());
            item.put("read", false);

            // Prepend new item
            JSONArray updated = new JSONArray();
            updated.put(item);
            for (int i = 0; i < Math.min(array.length(), 29); i++) {
                updated.put(array.get(i));
            }

            prefs.edit().putString(KEY_DETECTED, updated.toString()).apply();
        } catch (Exception e) {
            Log.e(TAG, "Failed to save detected payment", e);
        }
    }

    private void postReminderNotification(double amount, String merchant) {
        NotificationManager manager = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        if (manager == null) return;

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(
                CHANNEL_PAYMENTS,
                "Payment Reminders",
                NotificationManager.IMPORTANCE_HIGH
            );
            channel.setDescription("Reminders when a payment or UPI debit is detected");
            channel.enableVibration(true);
            manager.createNotificationChannel(channel);
        }

        String formattedAmount = String.format("%.2f", amount);
        if (formattedAmount.endsWith(".00")) {
            formattedAmount = String.format("%.0f", amount);
        }

        Intent intent = new Intent(this, MainActivity.class);
        intent.setAction("com.thogai.app.RECORD_PAYMENT");
        intent.putExtra("action", "record_payment");
        intent.putExtra("amount", amount);
        intent.putExtra("merchant", merchant);
        intent.setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);

        int flags = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            flags |= PendingIntent.FLAG_IMMUTABLE;
        }
        PendingIntent pendingIntent = PendingIntent.getActivity(this, (int) System.currentTimeMillis(), intent, flags);

        NotificationCompat.Builder builder = new NotificationCompat.Builder(this, CHANNEL_PAYMENTS)
            .setSmallIcon(R.mipmap.ic_launcher)
            .setContentTitle("Payment Detected: ₹" + formattedAmount)
            .setContentText("Paid to " + merchant + " · Tap to record in THOGAI")
            .setStyle(new NotificationCompat.BigTextStyle()
                .bigText("Payment of ₹" + formattedAmount + " to " + merchant + " was detected. Tap to categorize and log in your budget."))
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setAutoCancel(true)
            .setContentIntent(pendingIntent);

        manager.notify((int) (System.currentTimeMillis() % 100000), builder.build());
    }
}
