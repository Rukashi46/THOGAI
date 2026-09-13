import React from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { Calendar, CheckCircle2, History, Landmark, Scale, X, AlertCircle } from 'lucide-react'
import { formatMoney } from '../lib/finance'
import { type ReconciliationRecord } from '../services/storage'
import {
  backdropVariants, desktopModalVariants, mobileSheetVariants,
  reducedMotionVariants
} from '../lib/motion'

interface ReconciliationHistoryModalProps {
  history: ReconciliationRecord[]
  currency: string
  close: () => void
}

export function ReconciliationHistoryModal({
  history,
  currency,
  close
}: ReconciliationHistoryModalProps) {
  const reduced = useReducedMotion()
  const isMobile = typeof window !== 'undefined' && window.innerWidth <= 768
  const modalVariants = isMobile ? mobileSheetVariants : desktopModalVariants

  const f = (n: number) => formatMoney(n, currency)

  return (
    <motion.div
      className="modal-layer"
      variants={backdropVariants}
      initial="initial"
      animate="animate"
      exit="exit"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) close()
      }}
    >
      <motion.div
        className="modal modal-reconcile-history"
        variants={reduced ? reducedMotionVariants : modalVariants}
        initial="initial"
        animate="animate"
        exit="exit"
        role="dialog"
        aria-modal="true"
        aria-label="Reconciliation History"
      >
        <div className="modal-head">
          <div className="reconcile-head-title">
            <span className="eyebrow">Audit Trail</span>
            <h2>Reconciliation History</h2>
          </div>
          <button
            type="button"
            className="icon-button"
            onClick={close}
            aria-label="Close history"
          >
            <X size={19} />
          </button>
        </div>

        <div className="history-content">
          {history.length === 0 ? (
            <div className="history-empty">
              <Scale size={40} className="empty-icon" />
              <h3>No reconciliation records yet</h3>
              <p>
                When you reconcile your accounts against bank statements, audit snapshots
                will be preserved here.
              </p>
            </div>
          ) : (
            <div className="history-cards-list">
              {history.map((record) => {
                const isZeroDiff = Math.abs(record.difference || 0) < 0.01
                return (
                  <article key={record.id} className="history-record-card">
                    <div className="record-header">
                      <div className="record-account">
                        <Landmark size={16} />
                        <strong>{record.account}</strong>
                      </div>
                      <span className={`status-pill ${isZeroDiff ? 'balanced' : 'discrepancy'}`}>
                        {isZeroDiff ? (
                          <>
                            <CheckCircle2 size={13} /> Reconciled
                          </>
                        ) : (
                          <>
                            <AlertCircle size={13} /> Diff {f(Math.abs(record.difference))}
                          </>
                        )}
                      </span>
                    </div>

                    <div className="record-meta-row">
                      <span className="record-period">
                        <Calendar size={13} />
                        {record.startDate} to {record.endDate}
                      </span>
                      <span className="record-date">Reconciled on {record.reconciliationDate}</span>
                    </div>

                    <div className="record-balances-grid">
                      <div className="balance-col">
                        <span>Statement Closing</span>
                        <strong>{f(record.statementClosingBalance)}</strong>
                      </div>
                      <div className="balance-col">
                        <span>THOGAI Reconciled</span>
                        <strong>{f(record.thogaiReconciledBalance)}</strong>
                      </div>
                      <div className="balance-col">
                        <span>Matches</span>
                        <strong>
                          {record.transactionsMatched} / {record.transactionsChecked}
                        </strong>
                      </div>
                    </div>
                  </article>
                )
              })}
            </div>
          )}
        </div>
      </motion.div>
    </motion.div>
  )
}
