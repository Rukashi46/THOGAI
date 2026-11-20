package com.thogai.app;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
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
    public static final String CHANNEL_PAYMENTS = "thogai_payments_v2";

    // Deduplication cache: hash -> timestamp
    private static final Set<String> recentHashes = new HashSet<>();

    // Known payment, banking and SMS app package names in India
    private static final Set<String> PAYMENT_PACKAGES = new HashSet<>();
    static {
        // UPI & Wallets
        PAYMENT_PACKAGES.add("com.google.android.apps.nbu.paisa.user"); // Google Pay
        PAYMENT_PACKAGES.add("com.phonepe.app");                        // PhonePe
        PAYMENT_PACKAGES.add("net.one97.paytm");                        // Paytm
        PAYMENT_PACKAGES.add("com.dreamplug.androidapp");               // CRED
        PAYMENT_PACKAGES.add("in.org.npci.upiapp");                     // BHIM
        PAYMENT_PACKAGES.add("com.whatsapp");                          // WhatsApp Pay
        PAYMENT_PACKAGES.add("in.amazon.mShop.android.shopping");       // Amazon Pay
        PAYMENT_PACKAGES.add("com.amazon.mShop.android.shopping");
        PAYMENT_PACKAGES.add("com.mobikwik_new");                       // MobiKwik
        PAYMENT_PACKAGES.add("org.altruist.BajajExperia");              // Bajaj Finserv
        PAYMENT_PACKAGES.add("com.myairtelapp");                        // Airtel Thanks / Payments Bank
        PAYMENT_PACKAGES.add("com.jio.myjio");                          // MyJio / JioPay
        PAYMENT_PACKAGES.add("com.tatadigital.tcp");                    // Tata Neu
        PAYMENT_PACKAGES.add("indwin.c3.shareapp");                     // Slice
        PAYMENT_PACKAGES.add("org.npci.upi.security.pinactivityprovider");
        PAYMENT_PACKAGES.add("com.naviapp");                           // Navi
        PAYMENT_PACKAGES.add("com.fampay.in");                         // FamPay
        PAYMENT_PACKAGES.add("money.jupiter");                         // Jupiter
        PAYMENT_PACKAGES.add("co.fi.money");                           // Fi Money

        // Major Banks
        PAYMENT_PACKAGES.add("com.sbi.lotusintouch");                  // SBI Yono
        PAYMENT_PACKAGES.add("com.sbi.SBIFreedomPlus");
        PAYMENT_PACKAGES.add("com.snapwork.hdfc");                      // HDFC Bank Mobile
        PAYMENT_PACKAGES.add("com.csam.icici.bank.imobile");           // ICICI iMobile
        PAYMENT_PACKAGES.add("com.axis.mobile");                       // Axis Mobile
        PAYMENT_PACKAGES.add("com.msf.kbank.mobile");                  // Kotak 811
        PAYMENT_PACKAGES.add("com.pnb.pnbone");                        // PNB ONE
        PAYMENT_PACKAGES.add("com.canarabank.mobility");               // Canara ai1
        PAYMENT_PACKAGES.add("com.bankofbaroda.mconnect");             // BOB World
        PAYMENT_PACKAGES.add("com.infrasofttech.uboi");                // Union Bank
        PAYMENT_PACKAGES.add("com.infrasoft.indianbank");              // IndOASIS
        PAYMENT_PACKAGES.add("com.idfcfirstbank.optimus");             // IDFC FIRST Bank
        PAYMENT_PACKAGES.add("com.federalbank.fedmobile");             // Federal FedMobile
        PAYMENT_PACKAGES.add("com.indusind.indusmobile");              // IndusMobile
        PAYMENT_PACKAGES.add("com.yesbank");                           // YES Mobile

        // SMS & Messengers across various OEMs
        PAYMENT_PACKAGES.add("com.google.android.apps.messaging");      // Google Messages
        PAYMENT_PACKAGES.add("com.samsung.android.messaging");         // Samsung Messages
        PAYMENT_PACKAGES.add("com.android.mms");                       // AOSP Messages / Xiaomi default
        PAYMENT_PACKAGES.add("com.oneplus.mms");                       // OnePlus Messages
        PAYMENT_PACKAGES.add("com.coloros.mms");                       // Oppo ColorOS Messages
        PAYMENT_PACKAGES.add("com.heytap.mms");                        // Realme / Oppo HeyTap Messages
        PAYMENT_PACKAGES.add("com.miui.sms");                          // Xiaomi MIUI SMS
        PAYMENT_PACKAGES.add("com.miui.mms");
        PAYMENT_PACKAGES.add("com.vivo.mms");                          // Vivo Messages
        PAYMENT_PACKAGES.add("com.bbk.mms");
        PAYMENT_PACKAGES.add("com.motorola.messaging");                // Moto Messages
        PAYMENT_PACKAGES.add("com.truecaller");                        // Truecaller SMS
    }

    // Regex for payment debits
    private static final Pattern AMOUNT_PATTERN = Pattern.compile(
        "(?:(?:Rs\\.?|INR|₹)\\s*([0-9,]+(?:\\.[0-9]{1,2})?))|" +
        "(?:([0-9,]+(?:\\.[0-9]{1,2})?)\\s*(?:INR|Rs\\.?|rupees|₹))|" +
        "(?:(?:paid|debited|spent|sent|payment of|txn of)\\s+(?:for|by|with|of)?\\s*(?:Rs\\.?|INR|₹)?\\s*([0-9,]+(?:\\.[0-9]{1,2})?))",
        Pattern.CASE_INSENSITIVE
    );

    private static final Pattern DEBIT_KEYWORDS = Pattern.compile(
        "\\b(paid|debited|spent|sent|transferred|txn|transaction|payment|vpa|autopay|purchase|withdrawn|dr|cleared|remitted|deducted)\\b",
        Pattern.CASE_INSENSITIVE
    );

    private static final Pattern OTP_EXCLUDE = Pattern.compile(
        "\\b(otp|one time password|verification code|secret code|login code|do not share|don't share)\\b",
        Pattern.CASE_INSENSITIVE
    );

    private static final Pattern MERCHANT_PATTERN = Pattern.compile(
        "(?:to|at|towards|info:?|for)\\s+([A-Za-z0-9\\s&'.-]{2,30})",
        Pattern.CASE_INSENSITIVE
    );

    @Override
    public void onListenerConnected() {
        super.onListenerConnected();
        Log.i(TAG, "NotificationListenerService connected and actively monitoring notifications.");
    }

    @Override
    public void onListenerDisconnected() {
        super.onListenerDisconnected();
        Log.w(TAG, "NotificationListenerService disconnected! Requesting rebind...");
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
            requestRebind(new ComponentName(this, PaymentNotificationListener.class));
        }
    }

    public static void rebindService(Context context) {
        try {
            ComponentName componentName = new ComponentName(context, PaymentNotificationListener.class);
            PackageManager pm = context.getPackageManager();
            pm.setComponentEnabledSetting(componentName, PackageManager.COMPONENT_ENABLED_STATE_DISABLED, PackageManager.DONT_KILL_APP);
            pm.setComponentEnabledSetting(componentName, PackageManager.COMPONENT_ENABLED_STATE_ENABLED, PackageManager.DONT_KILL_APP);
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
                requestRebind(componentName);
            }
            Log.i(TAG, "Explicitly requested listener rebind");
        } catch (Exception e) {
            Log.w(TAG, "Could not rebind service: " + e.getMessage());
        }
    }

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

            // Extract comprehensive text from all possible notification extra fields
            StringBuilder sb = new StringBuilder();

            CharSequence titleCs = extras.getCharSequence(android.app.Notification.EXTRA_TITLE);
            if (titleCs != null) sb.append(titleCs).append(" ");

            CharSequence textCs = extras.getCharSequence(android.app.Notification.EXTRA_TEXT);
            if (textCs != null) sb.append(textCs).append(" ");

            CharSequence bigTextCs = extras.getCharSequence(android.app.Notification.EXTRA_BIG_TEXT);
            if (bigTextCs != null) sb.append(bigTextCs).append(" ");

            CharSequence subText = extras.getCharSequence(android.app.Notification.EXTRA_SUB_TEXT);
            if (subText != null) sb.append(subText).append(" ");

            CharSequence bigTitle = extras.getCharSequence(android.app.Notification.EXTRA_TITLE_BIG);
            if (bigTitle != null) sb.append(bigTitle).append(" ");

            CharSequence summaryText = extras.getCharSequence(android.app.Notification.EXTRA_SUMMARY_TEXT);
            if (summaryText != null) sb.append(summaryText).append(" ");

            if (notif.tickerText != null) sb.append(notif.tickerText).append(" ");

            CharSequence[] textLines = extras.getCharSequenceArray(android.app.Notification.EXTRA_TEXT_LINES);
            if (textLines != null) {
                for (CharSequence line : textLines) {
                    if (line != null) sb.append(line).append(" ");
                }
            }

            String fullText = sb.toString().trim();
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
            if (amountRaw == null) amountRaw = amountMatcher.group(3);
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
                    merchant = merchant.replaceAll("(?i)\\b(on|ref|upi|avl|bal|a/c|via)\\b.*$", "").trim();
                    if (merchant.length() > 25) merchant = merchant.substring(0, 25);
                }
            } else if (titleCs != null && !titleCs.toString().trim().isEmpty()) {
                String cleanTitle = titleCs.toString().trim();
                if (!cleanTitle.equalsIgnoreCase("Notification") &&
                    !cleanTitle.equalsIgnoreCase("Messages") &&
                    !cleanTitle.equalsIgnoreCase("Google Pay") &&
                    !cleanTitle.equalsIgnoreCase("PhonePe") &&
                    !cleanTitle.equalsIgnoreCase("Paytm")) {
                    merchant = cleanTitle;
                }
            }

            // Deduplicate
            String hash = amount + "_" + merchant + "_" + (System.currentTimeMillis() / 60000);
            synchronized (recentHashes) {
                if (recentHashes.contains(hash)) return;
                recentHashes.add(hash);
                if (recentHashes.size() > 50) recentHashes.clear();
            }

            Log.i(TAG, "Debit payment detected: ₹" + amount + " to " + merchant + " from package: " + sbn.getPackageName());

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

            JSONArray updated = new JSONArray();
            updated.put(item);
            for (int i = 0; i < Math.min(array.length(), 29); i++) {
                updated.put(array.get(i));
            }

            prefs.edit().putString(KEY_DETECTED, updated.toString()).apply();
            Log.i(TAG, "Saved detected payment to SharedPreferences");
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
            channel.setDescription("Instant alerts when UPI or Card payments are detected");
            channel.enableVibration(true);
            channel.enableLights(true);
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
        intent.addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_NEW_TASK);

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
            .setDefaults(NotificationCompat.DEFAULT_ALL)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setAutoCancel(true)
            .setContentIntent(pendingIntent);

        manager.notify((int) (System.currentTimeMillis() % 100000), builder.build());
        Log.i(TAG, "Posted payment reminder notification to system tray");
    }
}
