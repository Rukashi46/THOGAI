import type { Budget, FinanceData, Settings, Transaction } from './storage'

export interface QueuedSync {
  operationId: string
  entityType: 'transaction' | 'budget' | 'settings'
  entityId: string
  operation: 'CREATE' | 'UPDATE' | 'DELETE'
  payload: any
  createdAt: string
}

const DB_NAME = 'thogai_idb'
const DB_VERSION = 1
const STORE_NAME = 'user_data'

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || !window.indexedDB) {
      return reject(new Error('IndexedDB not supported'))
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME)
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

async function idbGet<T>(key: string): Promise<T | null> {
  try {
    const db = await openDB()
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readonly')
      const store = tx.objectStore(STORE_NAME)
      const request = store.get(key)
      request.onsuccess = () => resolve(request.result ?? null)
      request.onerror = () => resolve(null)
    })
  } catch {
    // Fallback to localStorage
    const item = localStorage.getItem(`idb_fallback_${key}`)
    return item ? JSON.parse(item) : null
  }
}

async function idbSet(key: string, value: any): Promise<void> {
  try {
    const db = await openDB()
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite')
      const store = tx.objectStore(STORE_NAME)
      const request = store.put(value, key)
      request.onsuccess = () => resolve()
      request.onerror = () => reject(request.error)
    })
  } catch {
    localStorage.setItem(`idb_fallback_${key}`, JSON.stringify(value))
  }
}

async function idbRemove(key: string): Promise<void> {
  try {
    const db = await openDB()
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readwrite')
      const store = tx.objectStore(STORE_NAME)
      const request = store.delete(key)
      request.onsuccess = () => resolve()
      request.onerror = () => resolve()
    })
  } catch {
    localStorage.removeItem(`idb_fallback_${key}`)
  }
}

export const idbStorage = {
  getScopedKey(userId: string | null, key: string) {
    return userId ? `user_${userId}_${key}` : `guest_${key}`
  },

  async loadUserData(userId: string | null): Promise<FinanceData | null> {
    const key = this.getScopedKey(userId, 'finance_data')
    return await idbGet<FinanceData>(key)
  },

  async saveUserData(userId: string | null, data: FinanceData): Promise<void> {
    const key = this.getScopedKey(userId, 'finance_data')
    await idbSet(key, data)
  },

  async clearUserData(userId: string | null): Promise<void> {
    const key = this.getScopedKey(userId, 'finance_data')
    await idbRemove(key)
    await idbRemove(this.getScopedKey(userId, 'queued_syncs'))
  },

  async getQueuedSyncs(userId: string | null): Promise<QueuedSync[]> {
    const key = this.getScopedKey(userId, 'queued_syncs')
    const queue = await idbGet<QueuedSync[]>(key)
    return queue || []
  },

  async saveQueuedSyncs(userId: string | null, queue: QueuedSync[]): Promise<void> {
    const key = this.getScopedKey(userId, 'queued_syncs')
    await idbSet(key, queue)
  },

  async isDataMigrated(userId: string): Promise<boolean> {
    const flag = await idbGet<boolean>(`migrated_${userId}`)
    return Boolean(flag)
  },

  async markDataMigrated(userId: string): Promise<void> {
    await idbSet(`migrated_${userId}`, true)
  },

  async getReconciliationHistory(userId: string | null): Promise<any[]> {
    const key = this.getScopedKey(userId, 'reconciliation_history')
    return (await idbGet<any[]>(key)) || []
  },

  async saveReconciliationRecord(userId: string | null, record: any): Promise<void> {
    const history = await this.getReconciliationHistory(userId)
    const updated = [record, ...history.filter((r: any) => r.id !== record.id)]
    const key = this.getScopedKey(userId, 'reconciliation_history')
    await idbSet(key, updated)
  },

  async getReconciliationSession(userId: string | null): Promise<any | null> {
    const key = this.getScopedKey(userId, 'active_reconciliation')
    return await idbGet<any>(key)
  },

  async saveReconciliationSession(userId: string | null, session: any | null): Promise<void> {
    const key = this.getScopedKey(userId, 'active_reconciliation')
    if (session) {
      await idbSet(key, session)
    } else {
      await idbRemove(key)
    }
  }
}
