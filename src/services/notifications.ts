import { Capacitor } from '@capacitor/core'
import { type Budget, type Transaction } from './storage'
import { categorySpend, getOutstandingReceivables } from '../lib/finance'

export interface ThogaiNotification {
  id: string
  title: string
  body: string
  type: 'payment_detected' | 'budget_alert' | 'due_reminder' | 'daily_reminder' | 'system'
  timestamp: number
  read: boolean
  data?: {
    amount?: number
    merchant?: string
    category?: string
    alertKey?: string
    nativeId?: string
    [key: string]: unknown
  }
}

const STORAGE_KEY = 'thogai.notifications.v1'
const DISMISSED_KEYS_STORAGE = 'thogai.dismissed_notifs.v1'

class NotificationManager {
  private getPlugin() {
    if (Capacitor.isPluginAvailable('ThogaiNotification')) {
      return (Capacitor.Plugins as any).ThogaiNotification
    }
    return null
  }

  public getDismissedKeys(): Set<string> {
    try {
      const raw = localStorage.getItem(DISMISSED_KEYS_STORAGE)
      if (!raw) return new Set()
      const arr = JSON.parse(raw)
      return new Set(Array.isArray(arr) ? arr : [])
    } catch {
      return new Set()
    }
  }

  public addDismissedKey(key: string): void {
    if (!key) return
    const set = this.getDismissedKeys()
    set.add(key)
    try {
      const arr = Array.from(set).slice(-250)
      localStorage.setItem(DISMISSED_KEYS_STORAGE, JSON.stringify(arr))
    } catch {}
  }

  public addDismissedKeys(keys: string[]): void {
    const set = this.getDismissedKeys()
    for (const k of keys) {
      if (k) set.add(k)
    }
    try {
      const arr = Array.from(set).slice(-250)
      localStorage.setItem(DISMISSED_KEYS_STORAGE, JSON.stringify(arr))
    } catch {}
  }

  public getStoredNotifications(): ThogaiNotification[] {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (!raw) return []
      return JSON.parse(raw) as ThogaiNotification[]
    } catch {
      return []
    }
  }

  public saveNotifications(list: ThogaiNotification[]): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(list.slice(0, 50)))
    } catch {}
  }

  public addNotification(notif: Omit<ThogaiNotification, 'id' | 'timestamp' | 'read'>): ThogaiNotification {
    const list = this.getStoredNotifications()
    const item: ThogaiNotification = {
      ...notif,
      id: 'notif_' + Date.now() + '_' + Math.floor(Math.random() * 1000),
      timestamp: Date.now(),
      read: false
    }
    const updated = [item, ...list].slice(0, 50)
    this.saveNotifications(updated)
    return item
  }

  public markAsRead(id: string): void {
    const list = this.getStoredNotifications().map(n => {
      if (n.id === id) {
        if (n.data?.nativeId) {
          const plugin = this.getPlugin()
          if (plugin && typeof plugin.markDetectedPaymentRead === 'function') {
            plugin.markDetectedPaymentRead({ id: n.data.nativeId }).catch(() => {})
          }
        }
        return { ...n, read: true }
      }
      return n
    })
    this.saveNotifications(list)
  }

  public markAllAsRead(): void {
    const list = this.getStoredNotifications().map(n => ({ ...n, read: true }))
    this.saveNotifications(list)
    const plugin = this.getPlugin()
    if (plugin && typeof plugin.markAllDetectedPaymentsRead === 'function') {
      plugin.markAllDetectedPaymentsRead().catch(() => {})
    }
  }

  public deleteNotification(id: string): void {
    const current = this.getStoredNotifications()
    const target = current.find(n => n.id === id)
    if (target) {
      if (target.data?.alertKey) {
        this.addDismissedKey(String(target.data.alertKey))
      }
      if (target.data?.nativeId) {
        const nativeId = String(target.data.nativeId)
        this.addDismissedKey(nativeId)
        const plugin = this.getPlugin()
        if (plugin && typeof plugin.clearDetectedPayment === 'function') {
          plugin.clearDetectedPayment({ id: nativeId }).catch(() => {})
        }
      }
      this.addDismissedKey(id)
    }
    const list = current.filter(n => n.id !== id)
    this.saveNotifications(list)
  }

  public clearAll(): void {
    const current = this.getStoredNotifications()
    const keysToDismiss: string[] = []
    for (const n of current) {
      keysToDismiss.push(n.id)
      if (n.data?.alertKey) keysToDismiss.push(String(n.data.alertKey))
      if (n.data?.nativeId) keysToDismiss.push(String(n.data.nativeId))
    }
    this.addDismissedKeys(keysToDismiss)
    this.saveNotifications([])

    const plugin = this.getPlugin()
    if (plugin && typeof plugin.clearAllDetectedPayments === 'function') {
      plugin.clearAllDetectedPayments().catch(() => {})
    }
  }

  /**
   * Check if native Android Notification Access is granted
   */
  public async isListenerEnabled(): Promise<boolean> {
    const plugin = this.getPlugin()
    if (plugin && typeof plugin.isNotificationListenerEnabled === 'function') {
      try {
        const res = await plugin.isNotificationListenerEnabled()
        return !!res?.enabled
      } catch {
        return false
      }
    }
    return false
  }

  /**
   * Deep-link user to Android Notification Access settings
   */
  public async requestListenerAccess(): Promise<void> {
    const plugin = this.getPlugin()
    if (plugin && typeof plugin.requestNotificationListenerAccess === 'function') {
      try {
        await plugin.requestNotificationListenerAccess()
      } catch (e) {
        console.warn('Could not open listener settings:', e)
      }
    }
  }

  /**
   * Sync intercepted payments from Android native SharedPreferences into in-app store
   */
  public async syncNativeDetectedPayments(): Promise<ThogaiNotification[]> {
    const plugin = this.getPlugin()
    if (!plugin || typeof plugin.getDetectedPayments !== 'function') {
      return this.getStoredNotifications()
    }

    try {
      const res = await plugin.getDetectedPayments()
      const payments = res?.payments || []
      const currentList = this.getStoredNotifications()
      const dismissed = this.getDismissedKeys()
      let hasNew = false

      for (const p of payments) {
        const rawId = String(p.id)
        const finalId = rawId.startsWith('det_') ? rawId : ('det_' + rawId)

        // If user already dismissed or cleared this payment, purge from native and skip
        if (dismissed.has(rawId) || dismissed.has(finalId)) {
          if (typeof plugin.clearDetectedPayment === 'function') {
            plugin.clearDetectedPayment({ id: rawId }).catch(() => {})
          }
          continue
        }

        const existing = currentList.find(
          n => n.id === rawId ||
               n.id === finalId ||
               n.data?.nativeId === rawId ||
               (n.data?.amount === p.amount && Math.abs(n.timestamp - p.timestamp) < 60000)
        )

        if (existing) {
          // Reconcile read states bidirectionally
          if (p.read && !existing.read) {
            existing.read = true
            hasNew = true
          } else if (existing.read && !p.read) {
            if (typeof plugin.markDetectedPaymentRead === 'function') {
              plugin.markDetectedPaymentRead({ id: rawId }).catch(() => {})
            }
          }
        } else {
          const formatted = Number(p.amount).toFixed(2).replace(/\.00$/, '')
          const item: ThogaiNotification = {
            id: finalId,
            title: `Payment Detected: ₹${formatted}`,
            body: `Paid to ${p.merchant}. Tap to categorize & record.`,
            type: 'payment_detected',
            timestamp: p.timestamp || Date.now(),
            read: !!p.read,
            data: {
              nativeId: rawId,
              amount: p.amount,
              merchant: p.merchant,
              rawText: p.rawText
            }
          }
          currentList.unshift(item)
          hasNew = true
        }
      }

      if (hasNew) {
        this.saveNotifications(currentList)
      }
      return currentList
    } catch {
      return this.getStoredNotifications()
    }
  }

  /**
   * Check launch intent for clicked notification
   */
  public async checkLaunchPayment(): Promise<{ amount?: number; merchant?: string } | null> {
    const plugin = this.getPlugin()
    if (!plugin || typeof plugin.getLaunchPayment !== 'function') return null

    try {
      const res = await plugin.getLaunchPayment()
      if (res?.hasLaunchPayment) {
        return {
          amount: res.amount,
          merchant: res.merchant
        }
      }
    } catch {}
    return null
  }

  /**
   * Schedule the daily expense review reminder
   */
  public async scheduleDailyReminder(enabled: boolean, timeStr = '20:30'): Promise<void> {
    const plugin = this.getPlugin()
    if (plugin && typeof plugin.scheduleDailyReminder === 'function') {
      try {
        await plugin.scheduleDailyReminder({ enabled, time: timeStr })
      } catch (err) {
        console.warn('Error scheduling native daily reminder:', err)
      }
    }
  }

  /**
   * Schedule a test daily reminder in N seconds (allows testing when closing app)
   */
  public async scheduleTestDailyReminder(seconds = 5): Promise<void> {
    const plugin = this.getPlugin()
    if (plugin && typeof plugin.scheduleTestDailyReminder === 'function') {
      try {
        await plugin.scheduleTestDailyReminder({ seconds })
      } catch (err) {
        console.warn('Error scheduling test daily reminder:', err)
      }
    }
  }

  /**
   * Post a custom notification (fires system notification on Android/Web + stores in-app)
   */
  public async postNotification(
    title: string,
    body: string,
    type: ThogaiNotification['type'] = 'system',
    data?: any
  ): Promise<ThogaiNotification> {
    // 1. In-app storage
    const item = this.addNotification({ title, body, type, data })

    // 2. Android native notification
    const plugin = this.getPlugin()
    if (plugin && typeof plugin.postLocalNotification === 'function') {
      try {
        await plugin.postLocalNotification({ title, body, channelId: 'thogai_' + type })
        return item
      } catch (e) {
        console.warn('Native notification post failed:', e)
      }
    }

    // 3. Web Notification API fallback
    if (typeof window !== 'undefined' && 'Notification' in window) {
      if (Notification.permission === 'granted') {
        try {
          new Notification(title, { body, icon: '/icon-192.png' })
        } catch {}
      } else if (Notification.permission !== 'denied') {
        Notification.requestPermission().then(perm => {
          if (perm === 'granted') {
            try {
              new Notification(title, { body, icon: '/icon-192.png' })
            } catch {}
          }
        }).catch(() => {})
      }
    }

    return item
  }

  /**
   * Evaluate budgets & dues to generate in-app alert notifications safely
   */
  public evaluateBudgetAndDueAlerts(
    budgets: Budget[],
    transactions: Transaction[],
    currencySymbol: string,
    enabledBudgetAlerts: boolean,
    enabledDueAlerts: boolean
  ): void {
    const todayKey = new Date().toISOString().slice(0, 10)
    const stored = this.getStoredNotifications()
    const dismissed = this.getDismissedKeys()

    // 1. Budget Alerts
    if (enabledBudgetAlerts && budgets.length > 0) {
      for (const b of budgets) {
        if (!b.limit || b.limit <= 0) continue
        const spent = categorySpend(transactions, b.category)
        const pct = (spent / b.limit) * 100

        if (pct >= 100) {
          const alertId = `budget_over_${b.category}_${todayKey}`
          if (!dismissed.has(alertId) && !stored.some(n => n.data?.alertKey === alertId)) {
            this.addNotification({
              title: `Budget Limit Exceeded: ${b.category}`,
              body: `You've spent ${currencySymbol}${spent.toFixed(2)} (${Math.round(pct)}%) of your ${currencySymbol}${b.limit} limit.`,
              type: 'budget_alert',
              data: { alertKey: alertId, category: b.category, spent, limit: b.limit }
            })
          }
        } else if (pct >= 85) {
          const alertId = `budget_near_${b.category}_${todayKey}`
          if (!dismissed.has(alertId) && !stored.some(n => n.data?.alertKey === alertId)) {
            this.addNotification({
              title: `Budget Alert: ${b.category}`,
              body: `You've used ${Math.round(pct)}% of your monthly budget (${currencySymbol}${Math.max(0, b.limit - spent).toFixed(2)} remaining).`,
              type: 'budget_alert',
              data: { alertKey: alertId, category: b.category, spent, limit: b.limit }
            })
          }
        }
      }
    }

    // 2. Due Reminders
    if (enabledDueAlerts) {
      const rec = getOutstandingReceivables(transactions)
      for (const r of rec) {
        if (r.totalOwed > 0) {
          const alertId = `due_${r.person.toLowerCase()}_${todayKey}`
          if (!dismissed.has(alertId) && !stored.some(n => n.data?.alertKey === alertId)) {
            this.addNotification({
              title: `Pending Due: ${r.person}`,
              body: `${r.person} owes you ${currencySymbol}${r.totalOwed.toFixed(2)}. Tap to copy a friendly reminder or settle.`,
              type: 'due_reminder',
              data: { alertKey: alertId, person: r.person, totalOwed: r.totalOwed }
            })
          }
        }
      }
    }
  }
}

export const notificationService = new NotificationManager()
