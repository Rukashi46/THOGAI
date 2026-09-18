import React, { useState, useEffect, useCallback } from 'react'
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion'
import {
  X, ArrowLeft, Users, CheckCircle2, Copy, Check,
  ChevronRight, Clock, TrendingDown, Minus
} from 'lucide-react'
import { formatMoney, getOutstandingReceivables, currencies, type PersonReceivable, type DebtItem } from '../lib/finance'
import { type Transaction } from '../services/storage'
import {
  backdropVariants,
  desktopModalVariants,
  mobileSheetVariants,
  reducedMotionVariants,
  buttonTap,
  primaryButtonTap,
  iosSpring,
  snapSpring,
} from '../lib/motion'

// ─── Types ────────────────────────────────────────────────────────────────────

interface MoneyOwedModalProps {
  transactions: Transaction[]
  currency: string
  close: () => void
  onRecordRepayment: (details: {
    person: string
    amount: number
    splitId?: string
    originatingTxId?: string
  }) => void
  onMarkAsMyExpense: (txId: string, splitId: string, amountToConvert: number) => void
}

type View = 'list' | 'person' | 'settle' | 'cover'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function buildReminderText(person: string, totalOwed: number, items: DebtItem[], currency: string): string {
  const f = (n: number) => formatMoney(n, currency)
  if (items.length === 1) {
    const item = items[0]
    return `Hey ${person}, just a reminder — you owe me ${f(item.remainingAmount)} for ${item.description || item.category} on ${item.date}. Thanks!`
  }
  const breakdown = items.map(i => `• ${i.description || i.category}: ${f(i.remainingAmount)}`).join('\n')
  return `Hey ${person}, just a reminder — you owe me ${f(totalOwed)} in total:\n${breakdown}\nThanks!`
}

function ProgressBar({ used, total, color = 'var(--positive)' }: { used: number; total: number; color?: string }) {
  const pct = total > 0 ? Math.min(100, (used / total) * 100) : 0
  return (
    <div style={{ height: 4, background: 'var(--border)', borderRadius: 100, overflow: 'hidden' }}>
      <motion.div
        initial={{ width: 0 }}
        animate={{ width: `${pct}%` }}
        transition={{ type: 'spring', stiffness: 160, damping: 26 }}
        style={{ height: '100%', background: color, borderRadius: 100, willChange: 'width' }}
      />
    </div>
  )
}

function Avatar({ name, size = 40 }: { name: string; size?: number }) {
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%',
      background: 'color-mix(in srgb, var(--accent) 18%, var(--surface-soft))',
      display: 'grid', placeItems: 'center',
      fontSize: size * 0.38, fontWeight: 700, color: 'var(--accent)',
      flexShrink: 0, letterSpacing: '-0.02em',
    }}>
      {name.charAt(0).toUpperCase()}
    </div>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function MoneyOwedModal({
  transactions, currency, close, onRecordRepayment, onMarkAsMyExpense
}: MoneyOwedModalProps) {
  const reduced = useReducedMotion()
  const isMobile = typeof window !== 'undefined' && window.innerWidth <= 768
  const modalVariants = isMobile ? mobileSheetVariants : desktopModalVariants
  const f = (n: number) => formatMoney(n, currency)

  const receivables = getOutstandingReceivables(transactions)
  const totalReceivables = receivables.reduce((sum, r) => sum + r.totalOwed, 0)

  // ── State ──────────────────────────────────────────────────────────────────
  const [view, setView] = useState<View>('list')
  const [selectedPerson, setSelectedPerson] = useState<PersonReceivable | null>(null)
  const [settleItem, setSettleItem] = useState<DebtItem | null>(null)
  const [coverItem, setCoverItem] = useState<DebtItem | null>(null)
  const [settleAmount, setSettleAmount] = useState('')
  const [coverAmount, setCoverAmount] = useState('')
  const [copied, setCopied] = useState(false)

  // Re-sync selected person when transactions change (after recording repayment)
  useEffect(() => {
    if (selectedPerson) {
      const updated = receivables.find(
        r => r.person.toLowerCase() === selectedPerson.person.toLowerCase()
      )
      if (updated) {
        setSelectedPerson(updated)
      } else {
        // Person fully settled — go back to list
        setView('list')
        setSelectedPerson(null)
      }
    }
  }, [transactions])

  // Keyboard nav
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      if (view === 'settle' || view === 'cover') setView('person')
      else if (view === 'person') { setView('list'); setSelectedPerson(null) }
      else close()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [view, close])

  // ── Actions ────────────────────────────────────────────────────────────────

  const openPerson = (rec: PersonReceivable) => {
    setSelectedPerson(rec)
    setView('person')
  }

  const openSettle = (item: DebtItem) => {
    setSettleItem(item)
    setSettleAmount(String(item.remainingAmount))
    setView('settle')
  }

  const openCover = (item: DebtItem) => {
    setCoverItem(item)
    setCoverAmount(String(item.remainingAmount))
    setView('cover')
  }

  const confirmSettle = () => {
    if (!settleItem || !selectedPerson) return
    const amt = parseFloat(settleAmount)
    if (!amt || amt <= 0) return
    const capped = Math.min(amt, settleItem.remainingAmount)
    onRecordRepayment({
      person: selectedPerson.person,
      amount: capped,
      splitId: settleItem.splitId,
      originatingTxId: settleItem.txId,
    })
    setView('person')
    setSettleItem(null)
  }

  const confirmCover = () => {
    if (!coverItem) return
    const amt = parseFloat(coverAmount)
    if (!amt || amt <= 0) return
    const capped = Math.min(amt, coverItem.remainingAmount)
    onMarkAsMyExpense(coverItem.txId, coverItem.splitId, capped)
    setView('person')
    setCoverItem(null)
  }

  const copyReminder = useCallback(() => {
    if (!selectedPerson) return
    const text = buildReminderText(
      selectedPerson.person,
      selectedPerson.totalOwed,
      selectedPerson.items,
      currency
    )
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2200)
    })
  }, [selectedPerson, currency])

  const settleAll = () => {
    if (!selectedPerson) return
    onRecordRepayment({
      person: selectedPerson.person,
      amount: selectedPerson.totalOwed,
    })
    close()
  }

  // ── Back button logic ──────────────────────────────────────────────────────
  const handleBack = () => {
    if (view === 'settle' || view === 'cover') {
      setView('person')
    } else if (view === 'person') {
      setView('list')
      setSelectedPerson(null)
    }
  }

  // ── Header title ───────────────────────────────────────────────────────────
  const headerTitle =
    view === 'list' ? 'Money Owed to You'
    : view === 'person' ? selectedPerson?.person ?? ''
    : view === 'settle' ? 'Record Payment'
    : 'Absorb as My Expense'

  const headerSub =
    view === 'list' ? `${f(totalReceivables)} · ${receivables.length} ${receivables.length === 1 ? 'person' : 'people'}`
    : view === 'person' ? `${f(selectedPerson?.totalOwed ?? 0)} outstanding`
    : view === 'settle' ? `${settleItem?.description || settleItem?.category}`
    : `${coverItem?.description || coverItem?.category}`

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <motion.div
      className="modal-layer"
      variants={backdropVariants}
      initial="initial"
      animate="animate"
      exit="exit"
      onClick={close}
    >
      <motion.div
        className="modal modal-money-owed"
        variants={reduced ? reducedMotionVariants : modalVariants}
        initial="initial"
        animate="animate"
        exit="exit"
        role="dialog"
        aria-modal="true"
        aria-label="Money Owed to You"
        onClick={e => e.stopPropagation()}
        style={{ display: 'flex', flexDirection: 'column', maxHeight: isMobile ? '90dvh' : '86vh' }}
      >
        {/* ── Header ─────────────────────────────────────────────────────── */}
        <div className="modal-header" style={{ flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {view !== 'list' && (
              <motion.button
                type="button"
                className="btn-icon"
                onClick={handleBack}
                aria-label="Back"
                whileTap={buttonTap}
                initial={{ opacity: 0, x: -6 }}
                animate={{ opacity: 1, x: 0 }}
                transition={snapSpring}
              >
                <ArrowLeft size={18} />
              </motion.button>
            )}
            <div>
              <h3 className="modal-title">{headerTitle}</h3>
              <span className="text-xs text-muted">{headerSub}</span>
            </div>
          </div>
          <motion.button
            type="button"
            className="modal-close"
            onClick={close}
            aria-label="Close"
            whileTap={buttonTap}
          >
            <X size={18} />
          </motion.button>
        </div>

        {/* ── Body ───────────────────────────────────────────────────────── */}
        <div className="modal-body" style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
          <AnimatePresence mode="wait" initial={false}>

            {/* ── VIEW: LIST ──────────────────────────────────────────────── */}
            {view === 'list' && (
              <motion.div
                key="list"
                initial={{ opacity: 0, x: -16 }}
                animate={{ opacity: 1, x: 0, transition: iosSpring }}
                exit={{ opacity: 0, x: -16, transition: { duration: 0.14 } }}
              >
                {receivables.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '48px 24px' }}>
                    <div style={{
                      width: 56, height: 56, borderRadius: '50%', background: 'var(--surface-soft)',
                      display: 'grid', placeItems: 'center', margin: '0 auto 14px', color: 'var(--muted)'
                    }}>
                      <Users size={24} />
                    </div>
                    <p style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)', marginBottom: 6 }}>
                      All settled up
                    </p>
                    <p style={{ fontSize: 13, color: 'var(--muted)' }}>
                      Nobody owes you anything right now.
                    </p>
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {receivables.map((rec, i) => {
                      const paidBack = rec.items.reduce((s, it) => s + it.repaidAmount, 0)
                      const originalTotal = rec.items.reduce((s, it) => s + it.originalAmount, 0)
                      return (
                        <motion.button
                          key={rec.person}
                          type="button"
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0, transition: { ...iosSpring, delay: i * 0.045 } }}
                          whileTap={buttonTap}
                          onClick={() => openPerson(rec)}
                          style={{
                            display: 'flex', alignItems: 'center', gap: 14,
                            width: '100%', textAlign: 'left',
                            padding: '14px 16px',
                            background: 'var(--surface)',
                            border: '1px solid var(--border)',
                            borderRadius: 'var(--radius-sm)',
                            cursor: 'pointer',
                            fontFamily: 'var(--font)',
                          }}
                        >
                          <Avatar name={rec.person} />
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                              <span style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)' }}>
                                {rec.person}
                              </span>
                              <span style={{ fontSize: 16, fontWeight: 700, color: 'var(--accent)', flexShrink: 0, marginLeft: 8 }}>
                                {f(rec.totalOwed)}
                              </span>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 }}>
                              <span style={{ fontSize: 11, color: 'var(--muted)' }}>
                                {rec.items.length} {rec.items.length === 1 ? 'item' : 'items'}
                                {paidBack > 0 && ` · ${f(paidBack)} received`}
                              </span>
                              <ChevronRight size={14} color="var(--muted)" />
                            </div>
                            {originalTotal > 0 && (
                              <div style={{ marginTop: 7 }}>
                                <ProgressBar
                                  used={paidBack}
                                  total={originalTotal}
                                  color="var(--positive)"
                                />
                              </div>
                            )}
                          </div>
                        </motion.button>
                      )
                    })}
                  </div>
                )}
              </motion.div>
            )}

            {/* ── VIEW: PERSON ────────────────────────────────────────────── */}
            {view === 'person' && selectedPerson && (
              <motion.div
                key={`person-${selectedPerson.person}`}
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0, transition: iosSpring }}
                exit={{ opacity: 0, x: 20, transition: { duration: 0.14 } }}
                style={{ display: 'flex', flexDirection: 'column', gap: 16 }}
              >
                {/* Summary card */}
                <div style={{
                  padding: '16px',
                  background: 'color-mix(in srgb, var(--accent) 8%, var(--surface))',
                  border: '1px solid color-mix(in srgb, var(--accent) 25%, var(--border))',
                  borderRadius: 'var(--radius-sm)',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
                    <Avatar name={selectedPerson.person} size={44} />
                    <div>
                      <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--text)', letterSpacing: '-0.02em' }}>
                        {f(selectedPerson.totalOwed)}
                      </div>
                      <div style={{ fontSize: 12, color: 'var(--muted)' }}>
                        outstanding from {selectedPerson.person}
                      </div>
                    </div>
                  </div>

                  {/* Action row */}
                  <div style={{ display: 'flex', gap: 8 }}>
                    <motion.button
                      type="button"
                      whileTap={primaryButtonTap}
                      onClick={settleAll}
                      style={{
                        flex: 1, padding: '10px 12px',
                        background: 'var(--accent)', color: '#fff',
                        border: 'none', borderRadius: 'var(--radius-sm)',
                        fontFamily: 'var(--font)', fontWeight: 600, fontSize: 13,
                        cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                      }}
                    >
                      <CheckCircle2 size={15} />
                      Settled in full
                    </motion.button>
                    <motion.button
                      type="button"
                      whileTap={buttonTap}
                      onClick={copyReminder}
                      title="Copy a reminder message"
                      style={{
                        padding: '10px 14px',
                        background: 'var(--surface-soft)',
                        border: '1px solid var(--border)',
                        borderRadius: 'var(--radius-sm)',
                        fontFamily: 'var(--font)', fontWeight: 500, fontSize: 13,
                        cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6,
                        color: copied ? 'var(--positive)' : 'var(--text-2)',
                        flexShrink: 0,
                      }}
                    >
                      <AnimatePresence mode="wait" initial={false}>
                        {copied ? (
                          <motion.span key="check"
                            initial={{ scale: 0.6, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1, transition: snapSpring }}
                            exit={{ scale: 0.6, opacity: 0 }}
                          >
                            <Check size={15} />
                          </motion.span>
                        ) : (
                          <motion.span key="copy"
                            initial={{ scale: 0.8, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0.8, opacity: 0 }}
                          >
                            <Copy size={15} />
                          </motion.span>
                        )}
                      </AnimatePresence>
                      {copied ? 'Copied!' : 'Remind'}
                    </motion.button>
                  </div>
                </div>

                {/* Per-item breakdown */}
                <div>
                  <p style={{ fontSize: 11, fontWeight: 600, color: 'var(--muted)', letterSpacing: '0.06em', marginBottom: 10 }}>
                    BREAKDOWN
                  </p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {selectedPerson.items.map((item) => {
                      const pctRepaid = item.originalAmount > 0 ? (item.repaidAmount / item.originalAmount) * 100 : 0
                      const pctCovered = item.originalAmount > 0 ? (item.convertedToMyExpense / item.originalAmount) * 100 : 0

                      return (
                        <div
                          key={item.splitId}
                          style={{
                            padding: '14px',
                            background: 'var(--surface)',
                            border: '1px solid var(--border)',
                            borderRadius: 'var(--radius-sm)',
                          }}
                        >
                          {/* Item header */}
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10, marginBottom: 10 }}>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', marginBottom: 2 }}>
                                {item.description || item.category}
                              </div>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                <Clock size={11} color="var(--muted)" />
                                <span style={{ fontSize: 11, color: 'var(--muted)' }}>{item.date}</span>
                                {item.category && item.description && (
                                  <>
                                    <span style={{ color: 'var(--muted)', fontSize: 10 }}>·</span>
                                    <span style={{ fontSize: 11, color: 'var(--muted)' }}>{item.category}</span>
                                  </>
                                )}
                              </div>
                            </div>
                            <div style={{ textAlign: 'right', flexShrink: 0 }}>
                              <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--accent)' }}>
                                {f(item.remainingAmount)}
                              </div>
                              {item.remainingAmount < item.originalAmount && (
                                <div style={{ fontSize: 10, color: 'var(--muted)' }}>
                                  of {f(item.originalAmount)}
                                </div>
                              )}
                            </div>
                          </div>

                          {/* Progress bar — repaid + covered */}
                          <div style={{ marginBottom: 12 }}>
                            <div style={{ height: 6, background: 'var(--border)', borderRadius: 100, overflow: 'hidden', position: 'relative' }}>
                              {/* Repaid portion */}
                              <motion.div
                                initial={{ width: 0 }}
                                animate={{ width: `${pctRepaid}%` }}
                                transition={{ type: 'spring', stiffness: 160, damping: 26 }}
                                style={{
                                  position: 'absolute', left: 0, top: 0, height: '100%',
                                  background: 'var(--positive)', borderRadius: 100,
                                  willChange: 'width',
                                }}
                              />
                              {/* Covered portion */}
                              <motion.div
                                initial={{ width: 0 }}
                                animate={{ width: `${pctCovered}%`, left: `${pctRepaid}%` }}
                                transition={{ type: 'spring', stiffness: 160, damping: 26 }}
                                style={{
                                  position: 'absolute', top: 0, height: '100%',
                                  background: 'var(--warning)', borderRadius: 100,
                                  willChange: 'width, left',
                                }}
                              />
                            </div>
                            {/* Legend */}
                            {(item.repaidAmount > 0 || item.convertedToMyExpense > 0) && (
                              <div style={{ display: 'flex', gap: 12, marginTop: 5 }}>
                                {item.repaidAmount > 0 && (
                                  <span style={{ fontSize: 10, color: 'var(--positive)', display: 'flex', alignItems: 'center', gap: 3 }}>
                                    <span style={{ width: 6, height: 6, borderRadius: 2, background: 'var(--positive)', display: 'inline-block' }} />
                                    {f(item.repaidAmount)} paid back
                                  </span>
                                )}
                                {item.convertedToMyExpense > 0 && (
                                  <span style={{ fontSize: 10, color: 'var(--warning)', display: 'flex', alignItems: 'center', gap: 3 }}>
                                    <span style={{ width: 6, height: 6, borderRadius: 2, background: 'var(--warning)', display: 'inline-block' }} />
                                    {f(item.convertedToMyExpense)} absorbed
                                  </span>
                                )}
                              </div>
                            )}
                          </div>

                          {/* Quick partial amounts */}
                          {item.remainingAmount > 0 && (
                            <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
                              {[25, 50, 100].map(pct => {
                                const amt = Math.round(item.remainingAmount * pct / 100 * 100) / 100
                                return (
                                  <motion.button
                                    key={pct}
                                    type="button"
                                    whileTap={buttonTap}
                                    onClick={() => {
                                      setSettleItem(item)
                                      setSettleAmount(String(amt))
                                      setView('settle')
                                    }}
                                    style={{
                                      flex: 1, padding: '7px 4px',
                                      fontSize: 12, fontWeight: 600,
                                      background: pct === 100 ? 'color-mix(in srgb, var(--positive) 14%, var(--surface-soft))' : 'var(--surface-soft)',
                                      color: pct === 100 ? 'var(--positive)' : 'var(--text-2)',
                                      border: `1px solid ${pct === 100 ? 'color-mix(in srgb, var(--positive) 30%, transparent)' : 'var(--border)'}`,
                                      borderRadius: 8, cursor: 'pointer',
                                      fontFamily: 'var(--font)',
                                    }}
                                  >
                                    {pct === 100 ? 'Full' : `${pct}%`}
                                    <div style={{ fontSize: 10, fontWeight: 400, color: 'inherit', opacity: 0.75, marginTop: 1 }}>
                                      {f(amt)}
                                    </div>
                                  </motion.button>
                                )
                              })}
                              <motion.button
                                type="button"
                                whileTap={buttonTap}
                                onClick={() => openSettle(item)}
                                style={{
                                  flex: 1, padding: '7px 4px',
                                  fontSize: 12, fontWeight: 600,
                                  background: 'var(--surface-soft)',
                                  color: 'var(--text-2)',
                                  border: '1px solid var(--border)',
                                  borderRadius: 8, cursor: 'pointer',
                                  fontFamily: 'var(--font)',
                                }}
                              >
                                Custom
                                <div style={{ fontSize: 10, fontWeight: 400, color: 'inherit', opacity: 0.75, marginTop: 1 }}>
                                  amount
                                </div>
                              </motion.button>
                            </div>
                          )}

                          {/* Absorb action */}
                          {item.remainingAmount > 0 && (
                            <motion.button
                              type="button"
                              whileTap={buttonTap}
                              onClick={() => openCover(item)}
                              style={{
                                width: '100%', padding: '8px',
                                fontSize: 12, fontWeight: 500,
                                background: 'transparent',
                                color: 'var(--muted)',
                                border: '1px dashed var(--border)',
                                borderRadius: 8, cursor: 'pointer',
                                fontFamily: 'var(--font)',
                                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
                              }}
                            >
                              <Minus size={12} />
                              I'll absorb this — remove from owed
                            </motion.button>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>
              </motion.div>
            )}

            {/* ── VIEW: SETTLE ────────────────────────────────────────────── */}
            {view === 'settle' && settleItem && selectedPerson && (
              <motion.div
                key="settle"
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0, transition: iosSpring }}
                exit={{ opacity: 0, y: 12, transition: { duration: 0.14 } }}
                style={{ display: 'flex', flexDirection: 'column', gap: 20 }}
              >
                {/* Item context */}
                <div style={{
                  padding: '14px',
                  background: 'var(--surface-soft)',
                  borderRadius: 'var(--radius-sm)',
                  border: '1px solid var(--border)',
                }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', marginBottom: 4 }}>
                    {settleItem.description || settleItem.category}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 10 }}>
                    {settleItem.date} · {f(settleItem.remainingAmount)} outstanding
                  </div>
                  <ProgressBar used={settleItem.repaidAmount} total={settleItem.originalAmount} />
                </div>

                {/* Amount input */}
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: 'var(--muted)', marginBottom: 6 }}>
                    Amount received
                  </label>
                  <div className="input-with-currency">
                    <span className="input-prefix">
                      {currencies.find(c => c.code === currency)?.symbol ?? '₹'}
                    </span>
                    <input
                      type="number"
                      inputMode="decimal"
                      className="form-input"
                      value={settleAmount}
                      min="0.01"
                      max={settleItem.remainingAmount}
                      step="any"
                      autoFocus
                      onChange={e => setSettleAmount(e.target.value)}
                    />
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 5 }}>
                    Maximum: {f(settleItem.remainingAmount)}
                  </div>
                </div>

                {/* Quick presets */}
                <div style={{ display: 'flex', gap: 8 }}>
                  {[25, 50, 100].map(pct => {
                    const amt = Math.round(settleItem.remainingAmount * pct / 100 * 100) / 100
                    return (
                      <motion.button
                        key={pct}
                        type="button"
                        whileTap={buttonTap}
                        onClick={() => setSettleAmount(String(amt))}
                        style={{
                          flex: 1, padding: '8px',
                          fontSize: 12, fontWeight: 600,
                          background: Number(settleAmount) === amt ? 'color-mix(in srgb, var(--accent) 14%, var(--surface))' : 'var(--surface-soft)',
                          color: Number(settleAmount) === amt ? 'var(--accent)' : 'var(--text-2)',
                          border: `1px solid ${Number(settleAmount) === amt ? 'var(--accent)' : 'var(--border)'}`,
                          borderRadius: 8, cursor: 'pointer', fontFamily: 'var(--font)',
                        }}
                      >
                        {pct === 100 ? 'Full' : `${pct}%`}
                      </motion.button>
                    )
                  })}
                </div>

                <p style={{ fontSize: 12, color: 'var(--muted)', lineHeight: 1.5, margin: 0 }}>
                  Recording a payment adds it as <strong>Friend Repayment</strong> income in your ledger and reduces the outstanding balance for {selectedPerson.person}.
                </p>

                <div style={{ display: 'flex', gap: 10 }}>
                  <motion.button
                    type="button"
                    className="btn btn-secondary"
                    style={{ flex: 1 }}
                    onClick={() => setView('person')}
                    whileTap={buttonTap}
                  >
                    Cancel
                  </motion.button>
                  <motion.button
                    type="button"
                    className="btn btn-primary"
                    style={{ flex: 2 }}
                    onClick={confirmSettle}
                    disabled={!settleAmount || Number(settleAmount) <= 0 || Number(settleAmount) > settleItem.remainingAmount}
                    whileTap={primaryButtonTap}
                  >
                    <CheckCircle2 size={15} style={{ marginRight: 5 }} />
                    Record {settleAmount ? f(Math.min(Number(settleAmount), settleItem.remainingAmount)) : ''}
                  </motion.button>
                </div>
              </motion.div>
            )}

            {/* ── VIEW: COVER ─────────────────────────────────────────────── */}
            {view === 'cover' && coverItem && (
              <motion.div
                key="cover"
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0, transition: iosSpring }}
                exit={{ opacity: 0, y: 12, transition: { duration: 0.14 } }}
                style={{ display: 'flex', flexDirection: 'column', gap: 20 }}
              >
                {/* Explanation card */}
                <div style={{
                  padding: '14px',
                  background: 'color-mix(in srgb, var(--warning) 10%, var(--surface))',
                  border: '1px solid color-mix(in srgb, var(--warning) 30%, var(--border))',
                  borderRadius: 'var(--radius-sm)',
                }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', marginBottom: 6 }}>
                    What does "absorb" mean?
                  </div>
                  <p style={{ fontSize: 12, color: 'var(--muted)', lineHeight: 1.6, margin: 0 }}>
                    Use this when you decide <em>not</em> to collect the money — e.g. you're gifting it, or you just don't want to track it anymore.
                    The amount moves from "money owed to you" into your own personal spending.
                    <br /><br />
                    <strong style={{ color: 'var(--warning)' }}>Your account balance is not affected</strong> — only your expense total changes.
                  </p>
                </div>

                {/* Item context */}
                <div style={{
                  padding: '14px',
                  background: 'var(--surface-soft)',
                  borderRadius: 'var(--radius-sm)',
                  border: '1px solid var(--border)',
                }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', marginBottom: 3 }}>
                    {coverItem.description || coverItem.category}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--muted)' }}>
                    {coverItem.date} · {f(coverItem.remainingAmount)} remaining
                  </div>
                </div>

                {/* Amount input */}
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: 'var(--muted)', marginBottom: 6 }}>
                    Amount to absorb
                  </label>
                  <div className="input-with-currency">
                    <span className="input-prefix">
                      {currencies.find(c => c.code === currency)?.symbol ?? '₹'}
                    </span>
                    <input
                      type="number"
                      inputMode="decimal"
                      className="form-input"
                      value={coverAmount}
                      min="0.01"
                      max={coverItem.remainingAmount}
                      step="any"
                      autoFocus
                      onChange={e => setCoverAmount(e.target.value)}
                    />
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 5 }}>
                    Maximum: {f(coverItem.remainingAmount)}
                  </div>
                </div>

                <div style={{ display: 'flex', gap: 10 }}>
                  <motion.button
                    type="button"
                    className="btn btn-secondary"
                    style={{ flex: 1 }}
                    onClick={() => setView('person')}
                    whileTap={buttonTap}
                  >
                    Cancel
                  </motion.button>
                  <motion.button
                    type="button"
                    className="btn btn-primary"
                    style={{
                      flex: 2,
                      background: 'color-mix(in srgb, var(--warning) 90%, var(--surface))',
                      boxShadow: 'none',
                    }}
                    onClick={confirmCover}
                    disabled={!coverAmount || Number(coverAmount) <= 0 || Number(coverAmount) > coverItem.remainingAmount}
                    whileTap={primaryButtonTap}
                  >
                    <TrendingDown size={15} style={{ marginRight: 5 }} />
                    Absorb {coverAmount ? f(Math.min(Number(coverAmount), coverItem.remainingAmount)) : ''}
                  </motion.button>
                </div>
              </motion.div>
            )}

          </AnimatePresence>
        </div>
      </motion.div>
    </motion.div>
  )
}
