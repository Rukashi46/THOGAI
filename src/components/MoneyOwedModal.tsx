import React, { useState, useEffect, useCallback } from 'react'
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion'
import {
  X, ArrowLeft, Users, CheckCircle2, Copy, Check,
  ChevronRight, Clock, TrendingDown, Minus, SplitSquareHorizontal
} from 'lucide-react'
import {
  formatMoney, getOutstandingReceivables, currencies,
  type PersonReceivable, type DebtItem
} from '../lib/finance'
import { type Transaction } from '../services/storage'
import {
  backdropVariants, desktopModalVariants, mobileSheetVariants,
  reducedMotionVariants, buttonTap, primaryButtonTap, iosSpring, snapSpring,
} from '../lib/motion'

interface Props {
  transactions: Transaction[]
  currency: string
  close: () => void
  onRecordRepayment: (d: {
    person: string; amount: number
    splitId?: string; originatingTxId?: string
  }) => void
  onMarkAsMyExpense: (txId: string, splitId: string, amount: number) => void
}

type View = 'list' | 'person' | 'settle' | 'absorb'

function remind(person: string, total: number, items: DebtItem[], cur: string) {
  const f = (n: number) => formatMoney(n, cur)
  if (items.length === 1)
    return `Hey ${person}, just a reminder — you owe me ${f(items[0].remainingAmount)} for ${items[0].description || items[0].category} on ${items[0].date}. Thanks!`
  return `Hey ${person}, just a reminder — you owe me ${f(total)} total:\n${items.map(i => `• ${i.description || i.category}: ${f(i.remainingAmount)}`).join('\n')}\nThanks!`
}

function Ring({ pct }: { pct: number }) {
  const R = 17, circ = 2 * Math.PI * R
  return (
    <svg width="42" height="42" viewBox="0 0 42 42" style={{ transform: 'rotate(-90deg)', flexShrink: 0 }}>
      <circle cx="21" cy="21" r={R} fill="none" stroke="var(--border)" strokeWidth="4" />
      <motion.circle cx="21" cy="21" r={R} fill="none" stroke="var(--positive)" strokeWidth="4"
        strokeLinecap="round" strokeDasharray={circ}
        initial={{ strokeDashoffset: circ }}
        animate={{ strokeDashoffset: circ - (Math.min(100, pct) / 100) * circ }}
        transition={{ type: 'spring', stiffness: 120, damping: 24 }}
        style={{ willChange: 'stroke-dashoffset' }} />
    </svg>
  )
}

export function MoneyOwedModal({ transactions, currency, close, onRecordRepayment, onMarkAsMyExpense }: Props) {
  const reduced = useReducedMotion()
  const isMobile = typeof window !== 'undefined' && window.innerWidth <= 768
  const f = (n: number) => formatMoney(n, currency)
  const sym = currencies.find(c => c.code === currency)?.symbol ?? '₹'

  const rec = getOutstandingReceivables(transactions)
  const totalAll = rec.reduce((s, r) => s + r.totalOwed, 0)

  const [view, setView] = useState<View>('list')
  const [person, setPerson] = useState<PersonReceivable | null>(null)
  const [item, setItem] = useState<DebtItem | null>(null)
  const [mode, setMode] = useState<'full' | 'partial'>('full')
  const [partialAmt, setPartialAmt] = useState('')
  const [copied, setCopied] = useState(false)
  const [absorbItem, setAbsorbItem] = useState<DebtItem | null>(null)
  const [absorbAmt, setAbsorbAmt] = useState('')

  // Re-sync person after any repayment
  useEffect(() => {
    if (!person) return
    const updated = rec.find(r => r.person.toLowerCase() === person.person.toLowerCase())
    if (updated) setPerson(updated)
    else { setView('list'); setPerson(null) }
  }, [transactions])

  // Keyboard: Escape to go back
  useEffect(() => {
    const fn = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      if (view === 'settle' || view === 'absorb') setView('person')
      else if (view === 'person') { setView('list'); setPerson(null) }
      else close()
    }
    window.addEventListener('keydown', fn)
    return () => window.removeEventListener('keydown', fn)
  }, [view, close])

  const back = () => {
    if (view === 'settle' || view === 'absorb') setView('person')
    else { setView('list'); setPerson(null) }
  }

  const openSettle = (d: DebtItem, m: 'full' | 'partial') => {
    setItem(d); setMode(m)
    setPartialAmt(m === 'full' ? String(d.remainingAmount) : '')
    setView('settle')
  }

  const confirmSettle = () => {
    if (!item || !person) return
    const amt = mode === 'full'
      ? item.remainingAmount
      : Math.min(parseFloat(partialAmt) || 0, item.remainingAmount)
    if (amt <= 0) return
    onRecordRepayment({ person: person.person, amount: amt, splitId: item.splitId, originatingTxId: item.txId })
    setView('person')
  }

  const confirmAbsorb = () => {
    if (!absorbItem) return
    const amt = Math.min(parseFloat(absorbAmt) || 0, absorbItem.remainingAmount)
    if (amt <= 0) return
    onMarkAsMyExpense(absorbItem.txId, absorbItem.splitId, amt)
    setView('person')
  }

  const settleAll = () => {
    if (!person) return
    onRecordRepayment({ person: person.person, amount: person.totalOwed })
    close()
  }

  const copyReminder = useCallback(() => {
    if (!person) return
    navigator.clipboard.writeText(remind(person.person, person.totalOwed, person.items, currency))
      .then(() => { setCopied(true); setTimeout(() => setCopied(false), 2200) })
  }, [person, currency])

  const title =
    view === 'list'   ? 'Money Owed to You'
    : view === 'person' ? (person?.person ?? '')
    : view === 'settle' ? (mode === 'full' ? 'Record Full Payment' : 'Record Partial Payment')
    : 'Cover as My Expense'

  const sub =
    view === 'list'   ? `${f(totalAll)} · ${rec.length} ${rec.length === 1 ? 'person' : 'people'}`
    : view === 'person' ? `${f(person?.totalOwed ?? 0)} outstanding`
    : view === 'settle' ? (item?.description || item?.category || '')
    : (absorbItem?.description || absorbItem?.category || '')

  const MV = isMobile ? mobileSheetVariants : desktopModalVariants

  return (
    <motion.div className="modal-layer" variants={backdropVariants}
      initial="initial" animate="animate" exit="exit" onClick={close}>
      <motion.div className="modal"
        variants={reduced ? reducedMotionVariants : MV}
        initial="initial" animate="animate" exit="exit"
        role="dialog" aria-modal="true" aria-label="Money Owed to You"
        onClick={e => e.stopPropagation()}
        style={{ display: 'flex', flexDirection: 'column',
          maxHeight: isMobile ? '90dvh' : '88vh', padding: 0 }}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
          gap: 10, padding: '20px 20px 14px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {view !== 'list' && (
              <motion.button type="button" className="icon-button" onClick={back}
                aria-label="Back" whileTap={buttonTap}
                initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} transition={snapSpring}>
                <ArrowLeft size={18} />
              </motion.button>
            )}
            <div>
              <h3 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: 'var(--text)' }}>{title}</h3>
              <span style={{ fontSize: 11, color: 'var(--muted)' }}>{sub}</span>
            </div>
          </div>
          <motion.button type="button" className="icon-button" onClick={close}
            aria-label="Close" whileTap={buttonTap}>
            <X size={18} />
          </motion.button>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: 'auto', minHeight: 0, padding: 20 }}>
          <AnimatePresence mode="wait" initial={false}>

            {/* ── LIST ── */}
            {view === 'list' && (
              <motion.div key="list"
                initial={{ opacity: 0, x: -16 }} animate={{ opacity: 1, x: 0, transition: iosSpring }}
                exit={{ opacity: 0, x: -16, transition: { duration: 0.14 } }}>
                {rec.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '48px 20px' }}>
                    <div style={{ width: 56, height: 56, borderRadius: '50%', background: 'var(--surface-soft)',
                      display: 'grid', placeItems: 'center', margin: '0 auto 14px', color: 'var(--muted)' }}>
                      <Users size={24} />
                    </div>
                    <p style={{ fontSize: 15, fontWeight: 600, margin: '0 0 6px', color: 'var(--text)' }}>All settled up</p>
                    <p style={{ fontSize: 13, color: 'var(--muted)', margin: 0 }}>Nobody owes you anything right now.</p>
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {rec.map((r, i) => {
                      const paidBack = r.items.reduce((s, it) => s + it.repaidAmount, 0)
                      const origTotal = r.items.reduce((s, it) => s + it.originalAmount, 0)
                      return (
                        <motion.button key={r.person} type="button"
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0, transition: { ...iosSpring, delay: i * 0.045 } }}
                          whileTap={buttonTap}
                          onClick={() => { setPerson(r); setView('person') }}
                          style={{ display: 'flex', alignItems: 'center', gap: 14, width: '100%',
                            textAlign: 'left', padding: '14px 16px', background: 'var(--surface)',
                            border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)',
                            cursor: 'pointer', fontFamily: 'var(--font)' }}>
                          <div style={{ position: 'relative', flexShrink: 0 }}>
                            <Ring pct={origTotal > 0 ? (paidBack / origTotal) * 100 : 0} />
                            <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center' }}>
                              <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--accent)' }}>
                                {r.person.charAt(0).toUpperCase()}
                              </span>
                            </div>
                          </div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                              <span style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)' }}>{r.person}</span>
                              <span style={{ fontSize: 16, fontWeight: 700, color: 'var(--accent)', marginLeft: 8, flexShrink: 0 }}>
                                {f(r.totalOwed)}
                              </span>
                            </div>
                            <span style={{ fontSize: 11, color: 'var(--muted)' }}>
                              {r.items.length} item{r.items.length !== 1 ? 's' : ''}
                              {paidBack > 0 ? ` · ${f(paidBack)} received` : ''}
                            </span>
                          </div>
                          <ChevronRight size={14} color="var(--muted)" />
                        </motion.button>
                      )
                    })}
                  </div>
                )}
              </motion.div>
            )}

            {/* ── PERSON ── */}
            {view === 'person' && person && (
              <motion.div key={`p-${person.person}`}
                initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0, transition: iosSpring }}
                exit={{ opacity: 0, x: 20, transition: { duration: 0.14 } }}
                style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                {/* Summary card */}
                <div style={{ padding: 16,
                  background: 'color-mix(in srgb, var(--accent) 8%, var(--surface))',
                  border: '1px solid color-mix(in srgb, var(--accent) 25%, var(--border))',
                  borderRadius: 'var(--radius-sm)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
                    <div style={{ width: 44, height: 44, borderRadius: '50%', flexShrink: 0,
                      background: 'color-mix(in srgb, var(--accent) 18%, var(--surface-soft))',
                      display: 'grid', placeItems: 'center',
                      fontSize: 18, fontWeight: 700, color: 'var(--accent)' }}>
                      {person.person.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.02em', color: 'var(--text)' }}>
                        {f(person.totalOwed)}
                      </div>
                      <div style={{ fontSize: 12, color: 'var(--muted)' }}>outstanding from {person.person}</div>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <motion.button type="button" whileTap={primaryButtonTap} onClick={settleAll}
                      style={{ flex: 1, padding: '10px 12px', background: 'var(--accent)', color: '#fff',
                        border: 'none', borderRadius: 'var(--radius-sm)', fontFamily: 'var(--font)',
                        fontWeight: 600, fontSize: 13, cursor: 'pointer',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                      <CheckCircle2 size={15} /> Settled in full
                    </motion.button>
                    <motion.button type="button" whileTap={buttonTap} onClick={copyReminder}
                      style={{ padding: '10px 14px', background: 'var(--surface-soft)',
                        border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)',
                        fontFamily: 'var(--font)', fontWeight: 500, fontSize: 13, cursor: 'pointer',
                        display: 'flex', alignItems: 'center', gap: 6,
                        color: copied ? 'var(--positive)' : 'var(--text-2)', flexShrink: 0 }}>
                      <AnimatePresence mode="wait" initial={false}>
                        {copied
                          ? <motion.span key="c" initial={{ scale: 0.6, opacity: 0 }}
                              animate={{ scale: 1, opacity: 1, transition: snapSpring }}
                              exit={{ scale: 0.6, opacity: 0 }}><Check size={15} /></motion.span>
                          : <motion.span key="r" initial={{ scale: 0.8, opacity: 0 }}
                              animate={{ scale: 1, opacity: 1 }}
                              exit={{ scale: 0.8, opacity: 0 }}><Copy size={15} /></motion.span>}
                      </AnimatePresence>
                      {copied ? 'Copied!' : 'Remind'}
                    </motion.button>
                  </div>
                </div>

                {/* Per-item breakdown */}
                <div>
                  <p style={{ fontSize: 11, fontWeight: 600, color: 'var(--muted)',
                    letterSpacing: '0.06em', marginBottom: 10 }}>BREAKDOWN</p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {person.items.map(d => {
                      const pctRepaid = d.originalAmount > 0 ? (d.repaidAmount / d.originalAmount) * 100 : 0
                      return (
                        <div key={d.splitId} style={{ padding: 14, background: 'var(--surface)',
                          border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)' }}>
                          {/* Item header */}
                          <div style={{ display: 'flex', justifyContent: 'space-between',
                            alignItems: 'flex-start', gap: 10, marginBottom: 10 }}>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', marginBottom: 3 }}>
                                {d.description || d.category}
                              </div>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: 'var(--muted)' }}>
                                <Clock size={10} /> {d.date} · {d.category}
                              </div>
                            </div>
                            <div style={{ textAlign: 'right', flexShrink: 0 }}>
                              <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--accent)' }}>
                                {f(d.remainingAmount)}
                              </div>
                              {d.remainingAmount < d.originalAmount && (
                                <div style={{ fontSize: 10, color: 'var(--muted)' }}>of {f(d.originalAmount)}</div>
                              )}
                            </div>
                          </div>

                          {/* Progress bar */}
                          <div style={{ height: 4, background: 'var(--border)', borderRadius: 100,
                            overflow: 'hidden', marginBottom: d.repaidAmount > 0 ? 6 : 10 }}>
                            <motion.div initial={{ width: 0 }} animate={{ width: `${pctRepaid}%` }}
                              transition={{ type: 'spring', stiffness: 160, damping: 26 }}
                              style={{ height: '100%', background: 'var(--positive)',
                                borderRadius: 100, willChange: 'width' }} />
                          </div>
                          {d.repaidAmount > 0 && (
                            <p style={{ fontSize: 10, color: 'var(--positive)', margin: '0 0 10px' }}>
                              {f(d.repaidAmount)} already paid back
                            </p>
                          )}

                          {/* Actions */}
                          {d.remainingAmount > 0 && (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                              {/* Primary: full / partial */}
                              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                                <motion.button type="button" whileTap={buttonTap}
                                  onClick={() => openSettle(d, 'full')}
                                  style={{ padding: '9px 8px',
                                    background: 'color-mix(in srgb, var(--positive) 12%, var(--surface-soft))',
                                    color: 'var(--positive)',
                                    border: '1px solid color-mix(in srgb, var(--positive) 28%, transparent)',
                                    borderRadius: 8, cursor: 'pointer', fontFamily: 'var(--font)',
                                    fontWeight: 600, fontSize: 12, lineHeight: 1.3,
                                    display: 'flex', flexDirection: 'column',
                                    alignItems: 'center', justifyContent: 'center', gap: 3 }}>
                                  <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                    <CheckCircle2 size={12} /> Paid in full
                                  </span>
                                  <span style={{ fontSize: 10, fontWeight: 400, opacity: 0.85 }}>
                                    {f(d.remainingAmount)}
                                  </span>
                                </motion.button>
                                <motion.button type="button" whileTap={buttonTap}
                                  onClick={() => openSettle(d, 'partial')}
                                  style={{ padding: '9px 8px',
                                    background: 'color-mix(in srgb, var(--accent) 10%, var(--surface-soft))',
                                    color: 'var(--accent)',
                                    border: '1px solid color-mix(in srgb, var(--accent) 25%, transparent)',
                                    borderRadius: 8, cursor: 'pointer', fontFamily: 'var(--font)',
                                    fontWeight: 600, fontSize: 12, lineHeight: 1.3,
                                    display: 'flex', flexDirection: 'column',
                                    alignItems: 'center', justifyContent: 'center', gap: 3 }}>
                                  <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                    <SplitSquareHorizontal size={12} /> Paid partially
                                  </span>
                                  <span style={{ fontSize: 10, fontWeight: 400, opacity: 0.85 }}>
                                    enter amount →
                                  </span>
                                </motion.button>
                              </div>
                              {/* Secondary: absorb */}
                              <motion.button type="button" whileTap={buttonTap}
                                onClick={() => { setAbsorbItem(d); setAbsorbAmt(String(d.remainingAmount)); setView('absorb') }}
                                style={{ padding: '7px 10px', background: 'transparent',
                                  color: 'var(--muted)', border: '1px dashed var(--border)',
                                  borderRadius: 8, cursor: 'pointer', fontFamily: 'var(--font)',
                                  fontWeight: 500, fontSize: 11,
                                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5 }}>
                                <Minus size={11} /> I'll cover this — not collecting it
                              </motion.button>
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>
              </motion.div>
            )}

            {/* ── SETTLE ── */}
            {view === 'settle' && item && person && (
              <motion.div key="settle"
                initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0, transition: iosSpring }}
                exit={{ opacity: 0, y: 12, transition: { duration: 0.14 } }}
                style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                {/* Context */}
                <div style={{ padding: 14, background: 'var(--surface-soft)',
                  borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)' }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', marginBottom: 4 }}>
                    {item.description || item.category}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--muted)' }}>
                    {item.date} · {f(item.remainingAmount)} outstanding
                  </div>
                </div>

                {/* Full / Partial toggle */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  {(['full', 'partial'] as const).map(m => (
                    <motion.button key={m} type="button" whileTap={buttonTap}
                      onClick={() => {
                        setMode(m)
                        if (m === 'full') setPartialAmt(String(item.remainingAmount))
                        else setPartialAmt('')
                      }}
                      style={{ padding: '10px 8px', borderRadius: 8,
                        border: `1.5px solid ${mode === m ? 'var(--accent)' : 'var(--border)'}`,
                        background: mode === m ? 'color-mix(in srgb, var(--accent) 12%, var(--surface))' : 'var(--surface-soft)',
                        color: mode === m ? 'var(--accent)' : 'var(--text-2)',
                        fontFamily: 'var(--font)', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>
                      {m === 'full' ? `Full — ${f(item.remainingAmount)}` : 'Partial — custom'}
                    </motion.button>
                  ))}
                </div>

                {/* Partial amount input */}
                {mode === 'partial' && (
                  <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0, transition: iosSpring }}>
                    <label style={{ display: 'block', fontSize: 12, fontWeight: 500,
                      color: 'var(--muted)', marginBottom: 6 }}>Amount received now</label>
                    <div className="input-with-currency">
                      <span className="input-prefix">{sym}</span>
                      <input type="number" inputMode="decimal" step="any" min="0.01"
                        max={item.remainingAmount} placeholder="0" value={partialAmt} autoFocus
                        onChange={e => setPartialAmt(e.target.value)} className="form-input" />
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 5 }}>
                      Max {f(item.remainingAmount)}
                      {partialAmt && parseFloat(partialAmt) > 0 && parseFloat(partialAmt) < item.remainingAmount
                        ? ` · ${f(item.remainingAmount - parseFloat(partialAmt))} still outstanding`
                        : ''}
                    </div>
                    {/* Quick presets */}
                    <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
                      {[25, 50, 75].map(pct => {
                        const a = Math.round(item.remainingAmount * pct / 100 * 100) / 100
                        const active = Math.abs((parseFloat(partialAmt) || 0) - a) < 0.01
                        return (
                          <motion.button key={pct} type="button" whileTap={buttonTap}
                            onClick={() => setPartialAmt(String(a))}
                            style={{ flex: 1, padding: '7px 4px', fontSize: 12, fontWeight: 600, borderRadius: 8,
                              border: `1px solid ${active ? 'var(--accent)' : 'var(--border)'}`,
                              background: active ? 'color-mix(in srgb, var(--accent) 14%, var(--surface))' : 'var(--surface-soft)',
                              color: active ? 'var(--accent)' : 'var(--text-2)',
                              cursor: 'pointer', fontFamily: 'var(--font)' }}>
                            {pct}%
                          </motion.button>
                        )
                      })}
                    </div>
                  </motion.div>
                )}

                <p style={{ fontSize: 12, color: 'var(--muted)', lineHeight: 1.55, margin: 0 }}>
                  {mode === 'full'
                    ? `Records ${f(item.remainingAmount)} as income from ${person.person} and clears this item.`
                    : `Records the entered amount as income from ${person.person}. The remaining balance stays outstanding.`}
                </p>

                <div style={{ display: 'flex', gap: 10 }}>
                  <motion.button type="button" whileTap={buttonTap} onClick={() => setView('person')}
                    style={{ flex: 1, padding: '11px 18px', background: 'var(--surface-soft)',
                      color: 'var(--text-2)', border: '1px solid var(--border)',
                      borderRadius: 'var(--radius-sm)', fontFamily: 'var(--font)',
                      fontWeight: 600, fontSize: 14, cursor: 'pointer' }}>
                    Cancel
                  </motion.button>
                  <motion.button type="button" whileTap={primaryButtonTap} onClick={confirmSettle}
                    disabled={mode === 'partial' && (!partialAmt || parseFloat(partialAmt) <= 0 || parseFloat(partialAmt) > item.remainingAmount)}
                    style={{ flex: 2, padding: '11px 18px', background: 'var(--accent)', color: '#fff',
                      border: 'none', borderRadius: 'var(--radius-sm)', fontFamily: 'var(--font)',
                      fontWeight: 600, fontSize: 14, cursor: 'pointer',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                      opacity: (mode === 'partial' && (!partialAmt || parseFloat(partialAmt) <= 0 || parseFloat(partialAmt) > item.remainingAmount)) ? 0.4 : 1 }}>
                    <CheckCircle2 size={15} />
                    Record {mode === 'full' ? f(item.remainingAmount) : (partialAmt ? f(Math.min(parseFloat(partialAmt), item.remainingAmount)) : '')}
                  </motion.button>
                </div>
              </motion.div>
            )}

            {/* ── ABSORB ── */}
            {view === 'absorb' && absorbItem && (
              <motion.div key="absorb"
                initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0, transition: iosSpring }}
                exit={{ opacity: 0, y: 12, transition: { duration: 0.14 } }}
                style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                <div style={{ padding: 14,
                  background: 'color-mix(in srgb, var(--warning) 10%, var(--surface))',
                  border: '1px solid color-mix(in srgb, var(--warning) 30%, var(--border))',
                  borderRadius: 'var(--radius-sm)' }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', marginBottom: 6 }}>
                    What does "cover" mean?
                  </div>
                  <p style={{ fontSize: 12, color: 'var(--muted)', lineHeight: 1.6, margin: 0 }}>
                    Use when you're <em>not</em> collecting the money — gifting it or writing it off.
                    The amount moves from "owed to you" into your personal spending.{' '}
                    <strong style={{ color: 'var(--warning)' }}>Your balance is not affected.</strong>
                  </p>
                </div>
                <div style={{ padding: 14, background: 'var(--surface-soft)',
                  borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)' }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', marginBottom: 3 }}>
                    {absorbItem.description || absorbItem.category}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--muted)' }}>
                    {absorbItem.date} · {f(absorbItem.remainingAmount)} remaining
                  </div>
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 500,
                    color: 'var(--muted)', marginBottom: 6 }}>Amount to cover</label>
                  <div className="input-with-currency">
                    <span className="input-prefix">{sym}</span>
                    <input type="number" inputMode="decimal" step="any" min="0.01"
                      max={absorbItem.remainingAmount} placeholder="0" value={absorbAmt} autoFocus
                      onChange={e => setAbsorbAmt(e.target.value)} className="form-input" />
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 10 }}>
                  <motion.button type="button" whileTap={buttonTap} onClick={() => setView('person')}
                    style={{ flex: 1, padding: '11px 18px', background: 'var(--surface-soft)',
                      color: 'var(--text-2)', border: '1px solid var(--border)',
                      borderRadius: 'var(--radius-sm)', fontFamily: 'var(--font)',
                      fontWeight: 600, fontSize: 14, cursor: 'pointer' }}>
                    Cancel
                  </motion.button>
                  <motion.button type="button" whileTap={primaryButtonTap} onClick={confirmAbsorb}
                    disabled={!absorbAmt || parseFloat(absorbAmt) <= 0 || parseFloat(absorbAmt) > absorbItem.remainingAmount}
                    style={{ flex: 2, padding: '11px 18px', background: 'var(--warning)',
                      color: '#172016', border: 'none', borderRadius: 'var(--radius-sm)',
                      fontFamily: 'var(--font)', fontWeight: 600, fontSize: 14, cursor: 'pointer',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                      opacity: (!absorbAmt || parseFloat(absorbAmt) <= 0 || parseFloat(absorbAmt) > absorbItem.remainingAmount) ? 0.4 : 1 }}>
                    <TrendingDown size={15} />
                    Cover {absorbAmt ? f(Math.min(parseFloat(absorbAmt), absorbItem.remainingAmount)) : ''}
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
