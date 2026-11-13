import { Capacitor } from '@capacitor/core'
import { StatusBar, Style } from '@capacitor/status-bar'
import { App as CapApp } from '@capacitor/app'

/**
 * Checks whether the application is running inside a native mobile container (e.g. Android APK).
 */
export function isNativePlatform(): boolean {
  return Capacitor.isNativePlatform()
}

/**
 * Checks if the current platform is Android.
 */
export function isAndroid(): boolean {
  return Capacitor.getPlatform() === 'android'
}

/**
 * Initialize native mobile features (Status Bar, Back Button, Safe Area handling).
 * Safely no-ops when running in standard web browsers.
 */
export function initMobileFeatures(onBackPress?: () => boolean): () => void {
  if (!isNativePlatform()) {
    return () => {}
  }

  // Configure Status Bar for full-screen immersive experience
  try {
    StatusBar.setOverlaysWebView({ overlay: true }).catch(() => {})
    StatusBar.hide().catch(() => {})
  } catch (err) {
    console.debug('StatusBar configuration not available:', err)
  }

  // Configure Android hardware back button handler
  let removeListener: (() => void) | undefined

  if (isAndroid()) {
    CapApp.addListener('backButton', ({ canGoBack }) => {
      // If consumer custom handler returns true, event was consumed
      if (onBackPress && onBackPress()) {
        return
      }

      if (canGoBack) {
        window.history.back()
      } else {
        // At root screen: minimize or exit app gracefully
        CapApp.exitApp()
      }
    }).then(handle => {
      removeListener = () => handle.remove()
    }).catch(() => {})
  }

  return () => {
    if (removeListener) removeListener()
  }
}
