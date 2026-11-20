package com.thogai.app;

import android.content.Intent;
import android.os.Build;
import android.os.Bundle;
import android.view.Window;
import android.view.WindowManager;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(ThogaiNotificationPlugin.class);
        super.onCreate(savedInstanceState);
        enableFullScreen();
        optimizeDisplayAndHardware();
        PaymentNotificationListener.rebindService(this);
    }

    @Override
    public void onResume() {
        super.onResume();
        PaymentNotificationListener.rebindService(this);
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) {
            enableFullScreen();
            optimizeDisplayAndHardware();
        }
    }

    private void optimizeDisplayAndHardware() {
        Window window = getWindow();
        if (window == null) return;

        // Force hardware acceleration on window level
        window.setFlags(
            WindowManager.LayoutParams.FLAG_HARDWARE_ACCELERATED,
            WindowManager.LayoutParams.FLAG_HARDWARE_ACCELERATED
        );

        // Unlock high refresh rate (90Hz / 120Hz / 144Hz) on Android R (API 30+)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            try {
                android.view.Display display = getDisplay();
                if (display != null) {
                    android.view.Display.Mode[] modes = display.getSupportedModes();
                    android.view.Display.Mode bestMode = null;
                    for (android.view.Display.Mode mode : modes) {
                        if (bestMode == null || mode.getRefreshRate() > bestMode.getRefreshRate()) {
                            bestMode = mode;
                        }
                    }
                    if (bestMode != null && bestMode.getRefreshRate() > 60.0f) {
                        WindowManager.LayoutParams params = window.getAttributes();
                        params.preferredDisplayModeId = bestMode.getModeId();
                        window.setAttributes(params);
                    }
                }
            } catch (Exception ignored) {}
        }

        // Optimize WebView hardware layer and render settings
        try {
            if (this.bridge != null && this.bridge.getWebView() != null) {
                android.webkit.WebView webView = this.bridge.getWebView();
                webView.setLayerType(android.view.View.LAYER_TYPE_HARDWARE, null);
                webView.setOverScrollMode(android.view.View.OVER_SCROLL_NEVER);

                android.webkit.WebSettings settings = webView.getSettings();
                settings.setRenderPriority(android.webkit.WebSettings.RenderPriority.HIGH);
                settings.setCacheMode(android.webkit.WebSettings.LOAD_DEFAULT);
                settings.setDomStorageEnabled(true);
                settings.setDatabaseEnabled(true);
            }
        } catch (Exception ignored) {}
    }

    private void enableFullScreen() {
        Window window = getWindow();
        if (window == null) return;

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            window.getAttributes().layoutInDisplayCutoutMode =
                WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES;
        }

        WindowCompat.setDecorFitsSystemWindows(window, false);
        WindowInsetsControllerCompat controller = new WindowInsetsControllerCompat(window, window.getDecorView());
        controller.hide(WindowInsetsCompat.Type.systemBars());
        controller.setSystemBarsBehavior(WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
    }
}
