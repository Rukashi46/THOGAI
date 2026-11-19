import { Capacitor } from '@capacitor/core'
import { isNativePlatform } from '../lib/mobile'

export interface RemoteVersionInfo {
  version: string
  versionCode: number
  apkUrl: string
  releaseNotes: string
  publishedAt: string
}

export interface UpdateCheckResult {
  hasUpdate: boolean
  currentVersion: string
  currentVersionCode: number
  remoteInfo?: RemoteVersionInfo
}

class AppUpdaterService {
  private getPlugin() {
    if (Capacitor.isPluginAvailable('ThogaiNotification')) {
      return (Capacitor.Plugins as any).ThogaiNotification
    }
    return null
  }

  /**
   * Get currently installed app version
   */
  public async getCurrentAppInfo(): Promise<{ versionCode: number; versionName: string }> {
    const plugin = this.getPlugin()
    if (plugin && typeof plugin.getAppInfo === 'function') {
      try {
        const info = await plugin.getAppInfo()
        return {
          versionCode: Number(info?.versionCode || 2),
          versionName: String(info?.versionName || '1.1.0')
        }
      } catch {}
    }
    return { versionCode: 2, versionName: '1.1.0' }
  }

  /**
   * Fetch version.json from thogai.vercel.app and compare
   */
  public async checkForUpdate(): Promise<UpdateCheckResult> {
    const current = await this.getCurrentAppInfo()

    try {
      const res = await fetch(`https://thogai.vercel.app/version.json?_t=${Date.now()}`, {
        cache: 'no-cache'
      })
      if (!res.ok) {
        return {
          hasUpdate: false,
          currentVersion: current.versionName,
          currentVersionCode: current.versionCode
        }
      }

      const remote = (await res.json()) as RemoteVersionInfo
      const hasUpdate = Number(remote.versionCode) > Number(current.versionCode)

      return {
        hasUpdate,
        currentVersion: current.versionName,
        currentVersionCode: current.versionCode,
        remoteInfo: remote
      }
    } catch (e) {
      console.warn('Update check failed:', e)
      return {
        hasUpdate: false,
        currentVersion: current.versionName,
        currentVersionCode: current.versionCode
      }
    }
  }

  /**
   * Check if app has permission to install unknown packages
   */
  public async canRequestInstalls(): Promise<boolean> {
    const plugin = this.getPlugin()
    if (plugin && typeof plugin.canRequestPackageInstalls === 'function') {
      try {
        const res = await plugin.canRequestPackageInstalls()
        return !!res?.canInstall
      } catch {}
    }
    return true
  }

  /**
   * Open Android system settings to grant Install Unknown Apps permission
   */
  public async openInstallSettings(): Promise<void> {
    const plugin = this.getPlugin()
    if (plugin && typeof plugin.openInstallPermissionSettings === 'function') {
      try {
        await plugin.openInstallPermissionSettings()
      } catch (e) {
        console.warn('Could not open install settings:', e)
      }
    }
  }

  /**
   * Download APK in background and trigger native Android installer
   */
  public async downloadAndInstall(apkUrl: string): Promise<boolean> {
    const plugin = this.getPlugin()
    if (plugin && typeof plugin.downloadAndInstallApk === 'function') {
      try {
        const res = await plugin.downloadAndInstallApk({ apkUrl })
        return !!res?.success
      } catch (e) {
        console.error('In-app APK installation failed:', e)
        throw e
      }
    } else {
      // Fallback for browser testing
      window.open(apkUrl, '_blank')
      return true
    }
  }
}

export const updaterService = new AppUpdaterService()
