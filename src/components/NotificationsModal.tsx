import React, { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Bell, Check, Trash2, X, CreditCard, AlertTriangle,
  Users, Clock, ChevronRight, Sparkles, Plus, ExternalLink
} from 'lucide-react'
import { notificationService, type ThogaiNotification } from '../services/notifications'
import { backdropVariants, desktopModalVariants, mobileSheetVariants, buttonTap } from '../lib/motion'
import { isNativePlatform } from '../lib/mobile'

interface Props {
  close: () => void
  onRecordPayment?: (data: { amount: number; merchant?: string }) => void
  onOpenBudget?: () => void
  onOpenDues?: () => void
}

export function NotificationsModal({ close, onRecordPayment, onOpenBudget, onOpenDues }: Props) {
  const isMobile = typeof window !== 'undefined' && window.innerWidth <= 768
  const modalVariants = isMobile ? mobileSheetVariants : desktopModalVariants

  const [notifications, setNotifications] = useState<ThogaiNotification[]>([])
  const [filter, setFilter] = useState<'all' | 'payments' | 'alerts'>('all')
  const [listenerEnabled, setListenerEnabled] = useState<boolean>(true)
  const isNative = isNativePlatform()

  const refresh = async () => {
    const list = await notificationService.syncNativeDetectedPayments()
    setNotifications([...list])
    if (isNative) {
      const enabled = await notificationService.isListenerEnabled()
      setListenerEnabled(enabled)
    }
  }

  useEffect(() => {
    refresh()
  }, [])

  const handleMarkAllRead = () => {
    notificationService.markAllAsRead()
    setNotifications(prev => prev.map(n => ({ ...n, read: true })))
  }

  const handleClearAll = () => {
    notificationService.clearAll()
    setNotifications([])
  }

  const handleToggleRead = (id: string, e?: React.MouseEvent) => {
    e?.stopPropagation()
    const target = notifications.find(n => n.id === id)
    if (!target) return
    if (!target.read) {
      notificationService.markAsRead(id)
      setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n))
    }
  }

  const handleDelete = (id: string, e: React.MouseEvent) => {
    e.stopPropagation()
    notificationService.deleteNotification(id)
    setNotifications(prev => prev.filter(n => n.id !== id))
  }



  const filtered = notifications.filter(n => {
    if (filter === 'payments') return n.type === 'payment_detected'
    if (filter === 'alerts') return n.type === 'budget_alert' || n.type === 'due_reminder'
    return true
  })

  const unreadCount = notifications.filter(n => !n.read).length

  const formatTime = (ts: number) => {
    const diffMs = Date.now() - ts
    const mins = Math.floor(diffMs / 60000)
    if (mins < 1) return 'Just now'
    if (mins < 60) return `${mins}m ago`
    const hours = Math.floor(mins / 60)
    if (hours < 24) return `${hours}h ago`
    return new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
  }

  return (
    <motion.div className="modal-layer" variants={backdropVariants} initial="initial" animate="animate" exit="exit" onClick={close}>
      <motion.div
        className="modal notif-modal"
        variants={modalVariants}
        initial="initial"
        animate="animate"
        exit="exit"
        onClick={e => e.stopPropagation()}
        style={{ maxWidth: 540 }}
      >
        {/* Head */}
        <div className="notif-head">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div className="notif-icon-circle">
              <Bell size={18} />
            </div>
            <div>
              <h2 style={{ margin: 0, fontSize: 19, fontWeight: 700 }}>Notifications</h2>
              <p style={{ margin: 0, fontSize: 12, color: 'var(--muted)' }}>
                {unreadCount > 0 ? `${unreadCount} unread update${unreadCount > 1 ? 's' : ''}` : 'All caught up'}
              </p>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            {notifications.length > 0 && (
              <>
                <button
                  type="button"
                  className="text-button"
                  onClick={handleMarkAllRead}
                  style={{ fontSize: 12, padding: '4px 8px' }}
                >
                  <Check size={14} /> Read all
                </button>
                <button
                  type="button"
                  className="text-button danger-text"
                  onClick={handleClearAll}
                  style={{ fontSize: 12, padding: '4px 8px' }}
                >
                  <Trash2 size={14} /> Clear
                </button>
              </>
            )}
            <button type="button" className="icon-button" onClick={close} style={{ height: 32, width: 32 }}>
              <X size={17} />
            </button>
          </div>
        </div>

        {/* Setup Banner for Android Notification Listener */}
        {isNative && !listenerEnabled && (
          <div className="notif-setup-banner">
            <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
              <Sparkles size={18} className="text-accent" style={{ flexShrink: 0, marginTop: 2 }} />
              <div>
                <strong>Auto-detect UPI & Card Payments</strong>
                <p style={{ margin: '3px 0 8px', fontSize: 12, color: 'var(--text-2)', lineHeight: 1.4 }}>
                  Grant Notification Access to automatically intercept payments from Google Pay, PhonePe, Paytm & bank alerts.
                </p>
                <button
                  type="button"
                  className="button primary compact"
                  onClick={async () => {
                    await notificationService.requestListenerAccess()
                    setTimeout(refresh, 2000)
                  }}
                  style={{ fontSize: 11.5, padding: '0 12px', minHeight: 30 }}
                >
                  Enable Notification Access <ExternalLink size={12} />
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Filter Pills */}
        <div className="notif-filters">
          <button
            type="button"
            className={`notif-pill ${filter === 'all' ? 'active' : ''}`}
            onClick={() => setFilter('all')}
          >
            All ({notifications.length})
          </button>
          <button
            type="button"
            className={`notif-pill ${filter === 'payments' ? 'active' : ''}`}
            onClick={() => setFilter('payments')}
          >
            Payments ({notifications.filter(n => n.type === 'payment_detected').length})
          </button>
          <button
            type="button"
            className={`notif-pill ${filter === 'alerts' ? 'active' : ''}`}
            onClick={() => setFilter('alerts')}
          >
            Budget & Dues ({notifications.filter(n => n.type === 'budget_alert' || n.type === 'due_reminder').length})
          </button>
        </div>

        {/* Notifications List */}
        <div className="notif-list">
          {filtered.length > 0 ? (
            filtered.map(item => {
              const Icon =
                item.type === 'payment_detected' ? CreditCard :
                item.type === 'budget_alert' ? AlertTriangle :
                item.type === 'due_reminder' ? Users :
                item.type === 'daily_reminder' ? Clock : Bell

              return (
                <div
                  key={item.id}
                  className={`notif-item ${!item.read ? 'unread' : ''}`}
                  onClick={() => handleToggleRead(item.id)}
                >
                  <div className={`notif-type-icon ${item.type}`}>
                    <Icon size={16} />
                  </div>
                  <div className="notif-body">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 6 }}>
                      <strong className="notif-title">{item.title}</strong>
                      <span className="notif-time">{formatTime(item.timestamp)}</span>
                    </div>
                    <p className="notif-desc">{item.body}</p>

                    {/* Action buttons per notification type */}
                    {item.type === 'payment_detected' && item.data?.amount && onRecordPayment && (
                      <div style={{ marginTop: 8 }}>
                        <button
                          type="button"
                          className="button primary compact"
                          onClick={() => {
                            close()
                            onRecordPayment({
                              amount: Number(item.data?.amount),
                              merchant: String(item.data?.merchant || '')
                            })
                          }}
                          style={{ fontSize: 11.5, minHeight: 28, padding: '0 10px' }}
                        >
                          <Plus size={13} /> Record ₹{item.data.amount}
                        </button>
                      </div>
                    )}

                    {item.type === 'budget_alert' && onOpenBudget && (
                      <div style={{ marginTop: 8 }}>
                        <button
                          type="button"
                          className="button ghost compact"
                          onClick={() => { close(); onOpenBudget() }}
                          style={{ fontSize: 11.5, minHeight: 28, padding: '0 10px' }}
                        >
                          Review Budget <ChevronRight size={13} />
                        </button>
                      </div>
                    )}

                    {item.type === 'due_reminder' && onOpenDues && (
                      <div style={{ marginTop: 8 }}>
                        <button
                          type="button"
                          className="button ghost compact"
                          onClick={() => { close(); onOpenDues() }}
                          style={{ fontSize: 11.5, minHeight: 28, padding: '0 10px' }}
                        >
                          View Receivables <ChevronRight size={13} />
                        </button>
                      </div>
                    )}
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flexShrink: 0 }}>
                    {!item.read && (
                      <button
                        type="button"
                        className="notif-del-btn"
                        onClick={(e) => handleToggleRead(item.id, e)}
                        title="Mark as read"
                        style={{ color: 'var(--accent)' }}
                      >
                        <Check size={14} />
                      </button>
                    )}
                    <button
                      type="button"
                      className="notif-del-btn"
                      onClick={(e) => handleDelete(item.id, e)}
                      title="Dismiss"
                    >
                      <X size={14} />
                    </button>
                  </div>
                </div>
              )
            })
          ) : (
            <div className="notif-empty">
              <div className="notif-empty-icon">
                <Bell size={28} />
              </div>
              <p style={{ margin: '8px 0 3px', fontWeight: 600 }}>No notifications in this tab</p>
              <span style={{ fontSize: 12, color: 'var(--muted)' }}>
                When payments are detected or budgets reach limits, you'll see them here.
              </span>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="notif-footer" style={{ justifyContent: 'flex-end' }}>
          <button type="button" className="button ghost compact" onClick={close} style={{ minHeight: 32 }}>
            Done
          </button>
        </div>
      </motion.div>
    </motion.div>
  )
}
