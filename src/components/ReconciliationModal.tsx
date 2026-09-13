import React, { useCallback, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import {
  AlertCircle, ArrowDownLeft, ArrowLeft, ArrowRight, ArrowUpRight, Check, CheckCircle2,
  ChevronDown, ChevronRight, FileSpreadsheet, FileText, History, Landmark,
  MinusCircle, Pencil, Plus, RefreshCw, Scale, Trash2, Upload, X
} from 'lucide-react'
import { formatMoney, newId } from '../lib/finance'
import {
  type ReconciliationMatch,
  type ReconciliationMatchType,
  type ReconciliationRecord,
  type StatementTransaction,
  type Transaction,
  type TransactionType
} from '../services/storage'
import { ThemedDatePicker } from './ThemedDatePicker'
import { ThemedSelect } from './ThemedSelect'
import {
  backdropVariants, desktopModalVariants, mobileSheetVariants,
  reducedMotionVariants, verifyVariants, buttonTap, primaryButtonTap
} from '../lib/motion'
import {
  calculateReconciliation,
  filterTransactionsForReconciliation,
  matchTransactions,
  buildReconciliationRecord
} from '../services/reconciliation'
import { parseStatement } from '../services/statementParser'

interface ReconciliationModalProps {
  accounts: string[]
  defaultAccount: string
  transactions: Transaction[]
  currency: string
  close: () => void
  onAddTransaction: (draft: Partial<Transaction>) => void
  onEditTransaction: (tx: Transaction) => void
  onDeleteTransaction: (id: string) => void
  onOpenHistory: () => void
  onSaveRecord: (record: ReconciliationRecord) => Promise<void>
  toast?: (msg: string) => void
  askConfirm: (opts: {
    title: string
    message: string
    confirmText?: string
    cancelText?: string
    danger?: boolean
    icon?: 'trash' | 'logout' | 'reset' | 'alert'
    onConfirm: () => void | Promise<void>
  }) => void
}

type Step = 'period' | 'upload' | 'review' | 'result'

export function ReconciliationModal({
  accounts,
  defaultAccount,
  transactions,
  currency,
  close,
  onAddTransaction,
  onEditTransaction,
  onDeleteTransaction,
  onOpenHistory,
  onSaveRecord,
  toast,
  askConfirm
}: ReconciliationModalProps) {
  const reduced = useReducedMotion()
  const isMobile = typeof window !== 'undefined' && window.innerWidth <= 768
  const modalVariants = isMobile ? mobileSheetVariants : desktopModalVariants

  // Step state
  const [step, setStep] = useState<Step>('period')

  // Step 1: Account & Period
  const [selectedAccount, setSelectedAccount] = useState<string>(defaultAccount || accounts[0] || 'Cash')
  const [startDate, setStartDate] = useState<string>(() => {
    const d = new Date()
    d.setDate(1)
    return d.toISOString().slice(0, 10)
  })
  const [endDate, setEndDate] = useState<string>(() => new Date().toISOString().slice(0, 10))

  // Step 2: Upload state
  const [file, setFile] = useState<File | null>(null)
  const [isParsing, setIsParsing] = useState(false)
  const [parseError, setParseError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Step 3: Review state
  const [statementTxs, setStatementTxs] = useState<StatementTransaction[]>([])
  const [matches, setMatches] = useState<ReconciliationMatch[]>([])
  const [statementOpening, setStatementOpening] = useState<number | undefined>(undefined)
  const [statementClosing, setStatementClosing] = useState<number | undefined>(undefined)
  const [activeTab, setActiveTab] = useState<'all' | 'needs_review' | 'matched' | 'missing'>('all')
  const [isSaving, setIsSaving] = useState(false)

  // Relevant THOGAI transactions for this account and period
  const relevantThogaiTxs = useMemo(() => {
    return filterTransactionsForReconciliation(transactions, selectedAccount, startDate, endDate)
  }, [transactions, selectedAccount, startDate, endDate])

  // Recalculate summary metrics
  const reconciliationSummary = useMemo(() => {
    return calculateReconciliation(matches, statementOpening, statementClosing, relevantThogaiTxs)
  }, [matches, statementOpening, statementClosing, relevantThogaiTxs])

  // Handle statement file processing
  const processFile = async (selectedFile: File) => {
    setFile(selectedFile)
    setIsParsing(true)
    setParseError(null)

    try {
      const result = await parseStatement(selectedFile, selectedAccount, startDate, endDate)
      if (result.transactions.length === 0) {
        throw new Error("No transactions could be identified in this statement.")
      }

      setStatementTxs(result.transactions)
      if (result.openingBalance !== undefined) setStatementOpening(result.openingBalance)
      if (result.closingBalance !== undefined) setStatementClosing(result.closingBalance)

      // Run matching engine
      const initialMatches = matchTransactions(result.transactions, relevantThogaiTxs)
      setMatches(initialMatches)
      setStep('review')
    } catch (err: any) {
      console.error('Reconciliation parsing error:', err)
      setParseError(
        "THOGAI couldn't read this statement. Please check the file format and try again."
      )
    } finally {
      setIsParsing(false)
    }
  }

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      processFile(e.dataTransfer.files[0])
    }
  }

  // Toggle match verification status
  const toggleVerify = (matchId: string) => {
    setMatches((prev) =>
      prev.map((m) => (m.id === matchId ? { ...m, verified: !m.verified } : m))
    )
  }

  // Quick add missing statement transaction to THOGAI
  const handleQuickAdd = (stx: StatementTransaction) => {
    const txType: TransactionType = stx.direction === 'credit' ? 'income' : 'expense'
    onAddTransaction({
      amount: stx.amount,
      type: txType,
      date: stx.date,
      description: stx.description,
      account: selectedAccount,
      category: txType === 'income' ? 'Salary' : 'General'
    })
    toast?.('Added to THOGAI')
  }

  // Save record and complete
  const handleSaveRecord = async () => {
    setIsSaving(true)
    try {
      const closing = statementClosing ?? reconciliationSummary.thogaiBalance
      const record = buildReconciliationRecord(
        {
          account: selectedAccount,
          startDate,
          endDate,
          matches
        },
        closing,
        reconciliationSummary.thogaiBalance
      )
      await onSaveRecord(record)
      toast?.('Reconciliation record saved')
      close()
    } catch (err) {
      console.error('Save error:', err)
      toast?.('Failed to save reconciliation record')
    } finally {
      setIsSaving(false)
    }
  }

  // Filtered matches for display
  const filteredMatches = useMemo(() => {
    if (activeTab === 'all') return matches
    if (activeTab === 'needs_review') {
      return matches.filter(
        (m) =>
          !m.verified &&
          (m.matchType === 'needs_review' ||
            m.matchType === 'amount_mismatch' ||
            m.matchType === 'date_mismatch' ||
            m.matchType === 'possible_duplicate')
      )
    }
    if (activeTab === 'matched') {
      return matches.filter((m) => m.matchType === 'matched' || m.verified)
    }
    if (activeTab === 'missing') {
      return matches.filter(
        (m) => m.matchType === 'missing_in_thogai' || m.matchType === 'missing_from_statement'
      )
    }
    return matches
  }, [matches, activeTab])

  const needsReviewCount = useMemo(() => {
    return matches.filter(
      (m) =>
        !m.verified &&
        (m.matchType === 'needs_review' ||
          m.matchType === 'amount_mismatch' ||
          m.matchType === 'date_mismatch' ||
          m.matchType === 'possible_duplicate')
    ).length
  }, [matches])

  const matchedCount = useMemo(() => {
    return matches.filter((m) => m.matchType === 'matched' || m.verified).length
  }, [matches])

  const missingCount = useMemo(() => {
    return matches.filter(
      (m) => m.matchType === 'missing_in_thogai' || m.matchType === 'missing_from_statement'
    ).length
  }, [matches])

  const f = (n: number) => formatMoney(n, currency)

  return (
    <motion.div
      className="modal-layer"
      variants={backdropVariants}
      initial="initial"
      animate="animate"
      exit="exit"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !isParsing) close()
      }}
    >
      <motion.div
        className="modal modal-reconcile"
        variants={reduced ? reducedMotionVariants : modalVariants}
        initial="initial"
        animate="animate"
        exit="exit"
        role="dialog"
        aria-modal="true"
        aria-label="Account Reconciliation"
      >
        {/* Modal Header */}
        <div className="modal-head">
          <div className="reconcile-head-title">
            <span className="eyebrow">Universal Reconciliation</span>
            <h2>Account Reconciliation</h2>
          </div>
          <div className="reconcile-head-actions">
            <button
              type="button"
              className="text-button history-btn"
              onClick={onOpenHistory}
              title="View past reconciliation records"
            >
              <History size={16} /> Past records
            </button>
            <button
              type="button"
              className="icon-button"
              onClick={close}
              aria-label="Close reconciliation"
            >
              <X size={19} />
            </button>
          </div>
        </div>

        {/* Stepper Progress */}
        <div className="reconcile-stepper">
          <div className={`step-node ${step === 'period' ? 'active' : 'done'}`}>
            <span>1</span> Period & Account
          </div>
          <ChevronRight size={14} className="stepper-arrow" />
          <div className={`step-node ${step === 'upload' ? 'active' : step === 'review' || step === 'result' ? 'done' : ''}`}>
            <span>2</span> Statement
          </div>
          <ChevronRight size={14} className="stepper-arrow" />
          <div className={`step-node ${step === 'review' ? 'active' : step === 'result' ? 'done' : ''}`}>
            <span>3</span> Review & Verify
          </div>
          <ChevronRight size={14} className="stepper-arrow" />
          <div className={`step-node ${step === 'result' ? 'active' : ''}`}>
            <span>4</span> Reconcile
          </div>
        </div>

        {/* ─── STEP 1: Select Account & Period ─── */}
        {step === 'period' && (
          <div className="reconcile-step-content">
            <div className="reconcile-intro">
              <p>
                Verify your THOGAI records against your bank or credit card statement.
                Select which account and date range you want to reconcile.
              </p>
            </div>

            <div className="reconcile-form-grid">
              <div className="field-group">
                <label className="field-label">Account to Reconcile</label>
                <ThemedSelect
                  value={selectedAccount}
                  onChange={(v) => setSelectedAccount(v)}
                  options={accounts.map((acc) => ({
                    value: acc,
                    label: acc,
                    icon: <Landmark size={15} />
                  }))}
                  ariaLabel="Select account"
                />
              </div>

              <div className="field-group">
                <label className="field-label">Statement Start Date</label>
                <ThemedDatePicker
                  value={startDate}
                  onChange={setStartDate}
                  ariaLabel="Statement start date"
                />
              </div>

              <div className="field-group">
                <label className="field-label">Statement End Date</label>
                <ThemedDatePicker
                  value={endDate}
                  onChange={setEndDate}
                  ariaLabel="Statement end date"
                />
              </div>
            </div>

            <div className="reconcile-period-meta">
              <span>
                Found <strong>{relevantThogaiTxs.length}</strong> transactions in THOGAI for {selectedAccount} during this period.
              </span>
            </div>

            <div className="reconcile-actions">
              <button className="button secondary" onClick={close}>
                Cancel
              </button>
              <button
                className="button primary"
                disabled={!selectedAccount || startDate > endDate}
                onClick={() => setStep('upload')}
              >
                Upload statement <ArrowRight size={16} />
              </button>
            </div>
          </div>
        )}

        {/* ─── STEP 2: Upload Statement ─── */}
        {step === 'upload' && (
          <div className="reconcile-step-content">
            <div className="reconcile-intro">
              <p>
                Upload your bank or card statement for <strong>{selectedAccount}</strong> ({startDate} to {endDate}).
                Supported formats: <strong>PDF, CSV, Excel (.xlsx, .xls)</strong>.
              </p>
            </div>

            <input
              type="file"
              ref={fileInputRef}
              hidden
              accept=".pdf,.csv,.xlsx,.xls,application/pdf,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
              onChange={(e) => {
                if (e.target.files && e.target.files[0]) {
                  processFile(e.target.files[0])
                }
              }}
            />

            <div
              className={`reconcile-dropzone ${isParsing ? 'parsing' : ''}`}
              onDragOver={(e) => e.preventDefault()}
              onDrop={handleDrop}
              onClick={() => {
                if (!isParsing) fileInputRef.current?.click()
              }}
              role="button"
              tabIndex={0}
            >
              {isParsing ? (
                <div className="parsing-indicator">
                  <RefreshCw className="spin-icon" size={32} />
                  <h3>Analyzing statement with AI...</h3>
                  <p>Interpreting layout, extracting transactions and running deterministic matching.</p>
                </div>
              ) : (
                <div className="dropzone-inner">
                  <div className="dropzone-icon">
                    <Upload size={32} />
                  </div>
                  <h3>Drop statement here or browse</h3>
                  <p>PDF, CSV, or Excel statement from your bank</p>
                  <div className="format-badges">
                    <span className="badge">PDF</span>
                    <span className="badge">CSV</span>
                    <span className="badge">XLSX</span>
                    <span className="badge">XLS</span>
                  </div>
                </div>
              )}
            </div>

            {parseError && (
              <div className="reconcile-error-banner">
                <AlertCircle size={18} />
                <p>{parseError}</p>
                <button
                  className="button compact secondary"
                  onClick={() => fileInputRef.current?.click()}
                >
                  Try another file
                </button>
              </div>
            )}

            <div className="reconcile-actions">
              <button className="button secondary" onClick={() => setStep('period')} disabled={isParsing}>
                <ArrowLeft size={16} /> Back
              </button>
            </div>
          </div>
        )}

        {/* ─── STEP 3: Review & Verify ─── */}
        {step === 'review' && (
          <div className="reconcile-step-content review-mode">
            {/* Balance Summary Header Bar */}
            <div className="reconcile-summary-bar">
              <div className="summary-item">
                <span className="summary-label">Statement Closing</span>
                <div className="summary-input-wrap">
                  <span className="currency-prefix">{currency === 'INR' ? '₹' : currency}</span>
                  <input
                    type="number"
                    step="0.01"
                    className="balance-input"
                    value={statementClosing ?? ''}
                    placeholder="Enter closing"
                    onChange={(e) => setStatementClosing(e.target.value ? Number(e.target.value) : undefined)}
                  />
                </div>
              </div>

              <div className="summary-item">
                <span className="summary-label">THOGAI Reconciled</span>
                <strong className="summary-val">{f(reconciliationSummary.thogaiBalance)}</strong>
              </div>

              <div className="summary-item">
                <span className="summary-label">Difference</span>
                <strong
                  className={`summary-val diff-val ${
                    reconciliationSummary.difference === 0 || Math.abs(reconciliationSummary.difference || 0) < 0.01
                      ? 'zero'
                      : 'diff'
                  }`}
                >
                  {reconciliationSummary.difference !== null
                    ? f(Math.abs(reconciliationSummary.difference))
                    : '—'}
                  {reconciliationSummary.difference !== null && Math.abs(reconciliationSummary.difference) < 0.01 && (
                    <Check size={14} className="diff-check" />
                  )}
                </strong>
              </div>

              <div className="summary-item">
                <span className="summary-label">Verified</span>
                <strong className="summary-val">
                  {reconciliationSummary.transactionsVerified} / {matches.length}
                </strong>
              </div>
            </div>

            {/* Filter Tabs */}
            <div className="reconcile-tabs">
              <button
                className={`reconcile-tab ${activeTab === 'all' ? 'active' : ''}`}
                onClick={() => setActiveTab('all')}
              >
                All ({matches.length})
              </button>
              <button
                className={`reconcile-tab ${activeTab === 'needs_review' ? 'active' : ''}`}
                onClick={() => setActiveTab('needs_review')}
              >
                Needs Review ({needsReviewCount})
              </button>
              <button
                className={`reconcile-tab ${activeTab === 'matched' ? 'active' : ''}`}
                onClick={() => setActiveTab('matched')}
              >
                Matched ({matchedCount})
              </button>
              <button
                className={`reconcile-tab ${activeTab === 'missing' ? 'active' : ''}`}
                onClick={() => setActiveTab('missing')}
              >
                Missing ({missingCount})
              </button>
            </div>

            {/* Match List */}
            <div className="reconcile-match-list">
              {filteredMatches.length === 0 ? (
                <div className="empty-matches">
                  <CheckCircle2 size={24} />
                  <p>No transactions in this filter.</p>
                </div>
              ) : (
                filteredMatches.map((match) => {
                  const stx = match.statementTx
                  const ttx = match.thogaiTx
                  const isVerified = match.verified

                  return (
                    <article
                      key={match.id}
                      className={`match-card ${match.matchType} ${isVerified ? 'verified' : ''}`}
                    >
                      {/* Match Type Badge */}
                      <div className="match-card-top">
                        <span className={`match-badge ${match.matchType}`}>
                          {match.matchType === 'matched' && <Check size={12} />}
                          {match.matchType === 'needs_review' && <AlertCircle size={12} />}
                          {match.matchType === 'amount_mismatch' && <AlertCircle size={12} />}
                          {match.matchType === 'date_mismatch' && <AlertCircle size={12} />}
                          {match.matchType === 'missing_in_thogai' && <Plus size={12} />}
                          {match.matchType === 'missing_from_statement' && <MinusCircle size={12} />}
                          {match.matchType === 'possible_duplicate' && <AlertCircle size={12} />}
                          <span className="badge-text">
                            {match.matchType === 'matched' && 'Matched'}
                            {match.matchType === 'needs_review' && 'Needs review'}
                            {match.matchType === 'amount_mismatch' && 'Amount mismatch'}
                            {match.matchType === 'date_mismatch' && 'Date mismatch'}
                            {match.matchType === 'missing_in_thogai' && 'Missing in THOGAI'}
                            {match.matchType === 'missing_from_statement' && 'Missing from statement'}
                            {match.matchType === 'possible_duplicate' && 'Possible duplicate'}
                          </span>
                        </span>

                        <div className="match-card-actions">
                          {match.matchType === 'missing_in_thogai' && stx && (
                            <button
                              type="button"
                              className="button compact primary add-missing-btn"
                              onClick={() => handleQuickAdd(stx)}
                            >
                              <Plus size={13} /> Add to THOGAI
                            </button>
                          )}

                          {ttx && (
                            <>
                              <button
                                type="button"
                                className="icon-button compact"
                                onClick={() => onEditTransaction(ttx)}
                                title="Edit in THOGAI"
                              >
                                <Pencil size={14} />
                              </button>
                              <button
                                type="button"
                                className="icon-button compact danger"
                                onClick={() => {
                                  askConfirm({
                                    title: 'Delete transaction?',
                                    message: 'Remove this transaction from THOGAI?',
                                    danger: true,
                                    onConfirm: () => onDeleteTransaction(ttx.id)
                                  })
                                }}
                                title="Delete from THOGAI"
                              >
                                <Trash2 size={14} />
                              </button>
                            </>
                          )}

                          <button
                            type="button"
                            className={`button compact verify-btn ${isVerified ? 'verified' : ''}`}
                            onClick={() => toggleVerify(match.id)}
                          >
                            {isVerified ? (
                              <>
                                <Check size={14} /> Verified
                              </>
                            ) : (
                              'Verify'
                            )}
                          </button>
                        </div>
                      </div>

                      {/* Two Column Comparison */}
                      <div className="match-comparison">
                        {/* Statement Side */}
                        <div className="comparison-col statement-col">
                          <span className="col-label">Statement</span>
                          {stx ? (
                            <div className="col-content">
                              <div className="col-header-row">
                                <span className="tx-date">{stx.date}</span>
                                <strong className={`tx-amount ${stx.direction}`}>
                                  {stx.direction === 'credit' ? '+' : '−'} {f(stx.amount)}
                                </strong>
                              </div>
                              <p className="tx-desc">{stx.description}</p>
                              {stx.reference && (
                                <small className="tx-ref">Ref: {stx.reference}</small>
                              )}
                            </div>
                          ) : (
                            <div className="col-empty">Not in statement</div>
                          )}
                        </div>

                        {/* THOGAI Side */}
                        <div className="comparison-col thogai-col">
                          <span className="col-label">THOGAI</span>
                          {ttx ? (
                            <div className="col-content">
                              <div className="col-header-row">
                                <span className="tx-date">{ttx.date}</span>
                                <strong className={`tx-amount ${ttx.type}`}>
                                  {ttx.type === 'income' ? '+' : '−'} {f(ttx.amount)}
                                </strong>
                              </div>
                              <p className="tx-desc">{ttx.description || ttx.category}</p>
                              <small className="tx-cat">
                                {ttx.category} · {ttx.account}
                              </small>
                            </div>
                          ) : (
                            <div className="col-empty">Not recorded in THOGAI</div>
                          )}
                        </div>
                      </div>
                    </article>
                  )
                })
              )}
            </div>

            {/* Bottom Actions */}
            <div className="reconcile-actions review-actions">
              <button className="button secondary" onClick={() => setStep('upload')}>
                <ArrowLeft size={16} /> Re-upload
              </button>
              <button className="button primary" onClick={() => setStep('result')}>
                Final summary <ArrowRight size={16} />
              </button>
            </div>
          </div>
        )}

        {/* ─── STEP 4: Result & Complete ─── */}
        {step === 'result' && (
          <div className="reconcile-step-content result-mode">
            {reconciliationSummary.isReconciled ? (
              <div className="reconciled-success-banner">
                <motion.div
                  className="success-check-circle"
                  variants={verifyVariants}
                  initial="initial"
                  animate="animate"
                >
                  <CheckCircle2 size={54} />
                </motion.div>
                <h3>Account Reconciled</h3>
                <p>
                  Zero difference found. Every statement item corresponds with your records in THOGAI.
                </p>
              </div>
            ) : (
              <div className="reconciled-warning-banner">
                <AlertCircle size={48} />
                <h3>Reconciliation Discrepancy</h3>
                <p>
                  Difference of{' '}
                  <strong>
                    {reconciliationSummary.difference !== null
                      ? f(Math.abs(reconciliationSummary.difference))
                      : '—'}
                  </strong>{' '}
                  remains. You can return to review or save this session in progress.
                </p>
              </div>
            )}

            <div className="result-stats-card">
              <div className="stat-row">
                <span>Account</span>
                <strong>{selectedAccount}</strong>
              </div>
              <div className="stat-row">
                <span>Period</span>
                <strong>
                  {startDate} to {endDate}
                </strong>
              </div>
              <div className="stat-row">
                <span>Statement Closing Balance</span>
                <strong>{statementClosing !== undefined ? f(statementClosing) : '—'}</strong>
              </div>
              <div className="stat-row">
                <span>THOGAI Calculated Balance</span>
                <strong>{f(reconciliationSummary.thogaiBalance)}</strong>
              </div>
              <div className="stat-row">
                <span>Difference</span>
                <strong
                  className={
                    reconciliationSummary.difference === 0 ||
                    Math.abs(reconciliationSummary.difference || 0) < 0.01
                      ? 'positive-text'
                      : 'warning-text'
                  }
                >
                  {reconciliationSummary.difference !== null
                    ? f(Math.abs(reconciliationSummary.difference))
                    : '—'}
                </strong>
              </div>
              <div className="stat-row">
                <span>Transactions Checked / Matched</span>
                <strong>
                  {reconciliationSummary.transactionsMatched} of {matches.length}
                </strong>
              </div>
            </div>

            <div className="reconcile-actions result-actions">
              <button className="button secondary" onClick={() => setStep('review')}>
                <ArrowLeft size={16} /> Return to review
              </button>
              <button
                className="button primary"
                disabled={isSaving}
                onClick={handleSaveRecord}
              >
                <Check size={16} /> Save reconciliation record
              </button>
            </div>
          </div>
        )}
      </motion.div>
    </motion.div>
  )
}
