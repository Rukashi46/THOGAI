import React, { useState, useEffect } from 'react'
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion'
import { X, ArrowLeft, Check, Users, ArrowUpRight, DollarSign, Wallet } from 'lucide-react'
import { formatMoney, getOutstandingReceivables, type PersonReceivable, type DebtItem } from '../lib/finance'
import { type Transaction } from '../services/storage'
import {
  backdropVariants,
  desktopModalVariants,
  mobileSheetVariants,
  reducedMotionVariants,
  buttonTap,
  primaryButtonTap
} from '../lib/motion'

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

export function MoneyOwedModal({
  transactions,
  currency,
  close,
  onRecordRepayment,
  onMarkAsMyExpense
}: MoneyOwedModalProps) {
  const reduced = useReducedMotion()
  const isMobile = typeof window !== 'undefined' && window.innerWidth <= 768
  const modalVariants = isMobile ? mobileSheetVariants : desktopModalVariants

  const receivables = getOutstandingReceivables(transactions)
  const totalReceivables = receivables.reduce((sum, r) => sum + r.totalOwed, 0)

  const [selectedPerson, setSelectedPerson] = useState<PersonReceivable | null>(null)
  const [convertingDebt, setConvertingDebt] = useState<DebtItem | null>(null)
  const [convertAmount, setConvertAmount] = useState<string>('')

  // Sync selected person if transactions change
  useEffect(() => {
    if (selectedPerson) {
      const updated = receivables.find(
        (r) => r.person.toLowerCase() === selectedPerson.person.toLowerCase()
      )
      setSelectedPerson(updated || null)
    }
  }, [transactions])

  // Close on Escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (convertingDebt) {
          setConvertingDebt(null)
        } else if (selectedPerson) {
          setSelectedPerson(null)
        } else {
          close()
        }
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [selectedPerson, convertingDebt, close])

  const handleStartConvert = (debt: DebtItem) => {
    setConvertingDebt(debt)
    setConvertAmount(String(debt.remainingAmount))
  }

  const handleConfirmConvert = () => {
    if (!convertingDebt) return
    const amt = Number(convertAmount)
    if (!amt || amt <= 0) return
    const capped = Math.min(amt, convertingDebt.remainingAmount)
    onMarkAsMyExpense(convertingDebt.txId, convertingDebt.splitId, capped)
    setConvertingDebt(null)
  }

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
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="modal-header">
          {selectedPerson ? (
            <div className="flex items-center gap-2">
              <motion.button
                type="button"
                className="btn-icon"
                onClick={() => setSelectedPerson(null)}
                aria-label="Back to all people"
                whileTap={buttonTap}
              >
                <ArrowLeft size={18} />
              </motion.button>
              <div>
                <h3 className="modal-title">{selectedPerson.person}</h3>
                <span className="text-xs text-muted">
                  {formatMoney(selectedPerson.totalOwed, currency)} outstanding
                </span>
              </div>
            </div>
          ) : (
            <div>
              <h3 className="modal-title">Money Owed to You</h3>
              <span className="text-xs text-muted">
                {formatMoney(totalReceivables, currency)} · {receivables.length}{' '}
                {receivables.length === 1 ? 'person' : 'people'}
              </span>
            </div>
          )}
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

        {/* Body */}
        <div className="modal-body">
          <AnimatePresence mode="wait">
            {convertingDebt ? (
              <motion.div
                key="convert-form"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="convert-expense-box"
              >
                <div className="convert-header">
                  <h4 className="text-sm font-semibold">Mark as My Expense</h4>
                  <p className="text-xs text-muted">
                    Converting this amount increases your personal spending without affecting your account balance.
                  </p>
                </div>

                <div className="convert-debt-summary">
                  <div className="text-xs text-muted">{convertingDebt.description} ({convertingDebt.date})</div>
                  <div className="text-sm font-medium">
                    Remaining: {formatMoney(convertingDebt.remainingAmount, currency)}
                  </div>
                </div>

                <div className="form-group mt-3">
                  <label className="form-label text-xs">Amount to convert</label>
                  <div className="input-with-currency">
                    <span className="input-prefix">{currency}</span>
                    <input
                      type="number"
                      inputMode="decimal"
                      className="form-input"
                      value={convertAmount}
                      max={convertingDebt.remainingAmount}
                      min="0.01"
                      step="any"
                      onChange={(e) => setConvertAmount(e.target.value)}
                      autoFocus
                    />
                  </div>
                  <div className="text-2xs text-muted mt-1">
                    Max: {formatMoney(convertingDebt.remainingAmount, currency)}
                  </div>
                </div>

                <div className="flex gap-2 mt-4">
                  <motion.button
                    type="button"
                    className="btn btn-secondary flex-1"
                    onClick={() => setConvertingDebt(null)}
                    whileTap={buttonTap}
                  >
                    Cancel
                  </motion.button>
                  <motion.button
                    type="button"
                    className="btn btn-primary flex-1"
                    onClick={handleConfirmConvert}
                    disabled={!convertAmount || Number(convertAmount) <= 0 || Number(convertAmount) > convertingDebt.remainingAmount}
                    whileTap={primaryButtonTap}
                  >
                    Confirm
                  </motion.button>
                </div>
              </motion.div>
            ) : selectedPerson ? (
              <motion.div
                key={`person-${selectedPerson.person}`}
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="person-receivable-details"
              >
                {/* Person action bar */}
                <div className="person-quick-actions mb-4 flex gap-2">
                  <motion.button
                    type="button"
                    className="btn btn-primary btn-sm flex-1 flex items-center justify-center gap-1"
                    onClick={() => {
                      onRecordRepayment({
                        person: selectedPerson.person,
                        amount: selectedPerson.totalOwed
                      })
                      close()
                    }}
                    whileTap={primaryButtonTap}
                  >
                    <Wallet size={14} />
                    Record Repayment
                  </motion.button>
                </div>

                <div className="debt-items-list space-y-3">
                  {selectedPerson.items.map((item) => (
                    <div key={item.splitId} className="debt-item-card">
                      <div className="flex justify-between items-start">
                        <div>
                          <div className="text-xs text-muted">{item.date}</div>
                          <div className="text-sm font-semibold">{item.description}</div>
                          {item.category && (
                            <span className="badge badge-muted text-2xs mt-0.5">{item.category}</span>
                          )}
                        </div>
                        <div className="text-right">
                          <div className="text-sm font-bold text-accent">
                            {formatMoney(item.remainingAmount, currency)}
                          </div>
                          <div className="text-2xs text-muted">
                            of {formatMoney(item.originalAmount, currency)} owed
                          </div>
                        </div>
                      </div>

                      {/* Repayment and Conversion badges */}
                      {(item.repaidAmount > 0 || item.convertedToMyExpense > 0) && (
                        <div className="flex flex-wrap gap-2 mt-2 pt-2 border-t border-border-subtle text-2xs text-muted">
                          {item.repaidAmount > 0 && (
                            <span>✓ {formatMoney(item.repaidAmount, currency)} repaid</span>
                          )}
                          {item.convertedToMyExpense > 0 && (
                            <span>• {formatMoney(item.convertedToMyExpense, currency)} marked personal</span>
                          )}
                        </div>
                      )}

                      {/* Item Actions */}
                      <div className="flex justify-end gap-2 mt-3 pt-2 border-t border-border-subtle">
                        <motion.button
                          type="button"
                          className="btn btn-ghost btn-xs text-muted hover:text-foreground"
                          onClick={() => handleStartConvert(item)}
                          whileTap={buttonTap}
                        >
                          Mark as my expense
                        </motion.button>
                        <motion.button
                          type="button"
                          className="btn btn-secondary btn-xs flex items-center gap-1"
                          onClick={() => {
                            onRecordRepayment({
                              person: selectedPerson.person,
                              amount: item.remainingAmount,
                              splitId: item.splitId,
                              originatingTxId: item.txId
                            })
                            close()
                          }}
                          whileTap={buttonTap}
                        >
                          <ArrowUpRight size={12} />
                          Repay this
                        </motion.button>
                      </div>
                    </div>
                  ))}
                </div>
              </motion.div>
            ) : (
              <motion.div
                key="people-list"
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
                className="receivables-list space-y-2"
              >
                {receivables.length === 0 ? (
                  <div className="empty-state py-8 text-center">
                    <Users size={32} className="mx-auto text-muted mb-2" />
                    <p className="text-sm text-muted">No money currently owed to you.</p>
                  </div>
                ) : (
                  receivables.map((rec) => (
                    <motion.div
                      key={rec.person}
                      className="receivable-person-row flex items-center justify-between p-3 rounded-lg cursor-pointer hover:bg-surface-hover transition-colors"
                      onClick={() => setSelectedPerson(rec)}
                      whileTap={buttonTap}
                    >
                      <div className="flex items-center gap-3">
                        <div className="avatar-circle">
                          {rec.person.slice(0, 1).toUpperCase()}
                        </div>
                        <div>
                          <div className="text-sm font-medium">{rec.person}</div>
                          <div className="text-2xs text-muted">
                            {rec.items.length} {rec.items.length === 1 ? 'item' : 'items'}
                          </div>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-sm font-bold text-accent">
                          {formatMoney(rec.totalOwed, currency)}
                        </div>
                        <div className="text-2xs text-muted">tap for details</div>
                      </div>
                    </motion.div>
                  ))
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.div>
    </motion.div>
  )
}
