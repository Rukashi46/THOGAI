import React, { useState, useMemo } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import {
  X, Trash2, Calendar, Filter, ReceiptText, PiggyBank,
  AlertTriangle, RotateCcw, Landmark, ShieldAlert, CheckCircle2,
  CalendarDays, Layers, ChevronRight, SlidersHorizontal
} from 'lucide-react'
import { formatMoney, monthKey } from '../lib/finance'
import {
  type Transaction, type Budget, type TransactionType
} from '../services/storage'
import {
  backdropVariants, desktopModalVariants, mobileSheetVariants,
  reducedMotionVariants, buttonTap, primaryButtonTap
} from '../lib/motion'
import { ThemedSelect } from './ThemedSelect'
import { ThemedDatePicker } from './ThemedDatePicker'

interface AdvancedDeleteModalProps {
  transactions: Transaction[]
  budgets: Budget[]
  reconciliationCount: number
  currency: string
  categories: string[]
  incomeCategories: string[]
  accounts: string[]
  activeMonth?: string
  close: () => void
  onDeleteTransactions: (ids: string[], description: string) => void
  onResetBudgets: () => void
  onResetMonthlyBudget: () => void
  onClearReconciliationHistory: () => void
  onResetCategories: (type: 'expense' | 'income' | 'both') => void
  onResetAccounts: () => void
  onFactoryReset: () => void
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

type Tab = 'transactions' | 'budgets' | 'system'

export function AdvancedDeleteModal({
  transactions,
  budgets,
  reconciliationCount,
  currency,
  categories,
  incomeCategories,
  accounts,
  activeMonth = monthKey(),
  close,
  onDeleteTransactions,
  onResetBudgets,
  onResetMonthlyBudget,
  onClearReconciliationHistory,
  onResetCategories,
  onResetAccounts,
  onFactoryReset,
  askConfirm
}: AdvancedDeleteModalProps) {
  const reduced = useReducedMotion()
  const isMobile = typeof window !== 'undefined' && window.innerWidth <= 768
  const modalVariants = isMobile ? mobileSheetVariants : desktopModalVariants

  const [activeTab, setActiveTab] = useState<Tab>('transactions')

  // Transaction delete sub-options state
  const availableMonths = useMemo(() => {
    const set = new Set<string>()
    set.add(activeMonth)
    transactions.forEach((t) => set.add(t.date.slice(0, 7)))
    return [...set].sort().reverse()
  }, [transactions, activeMonth])

  const [targetMonth, setTargetMonth] = useState<string>(activeMonth)

  const [rangeStart, setRangeStart] = useState<string>(() => {
    const d = new Date()
    d.setDate(1)
    return d.toISOString().slice(0, 10)
  })
  const [rangeEnd, setRangeEnd] = useState<string>(() => new Date().toISOString().slice(0, 10))

  const [targetCategory, setTargetCategory] = useState<string>(categories[0] || 'Food & Dining')
  const [targetType, setTargetType] = useState<TransactionType>('expense')

  const f = (n: number) => formatMoney(n, currency)

  // Calculations for live previews
  const monthTxs = useMemo(() => {
    return transactions.filter((t) => t.date.slice(0, 7) === targetMonth)
  }, [transactions, targetMonth])
  const monthTotal = useMemo(() => monthTxs.reduce((sum, t) => sum + t.amount, 0), [monthTxs])

  const rangeTxs = useMemo(() => {
    return transactions.filter((t) => t.date >= rangeStart && t.date <= rangeEnd)
  }, [transactions, rangeStart, rangeEnd])
  const rangeTotal = useMemo(() => rangeTxs.reduce((sum, t) => sum + t.amount, 0), [rangeTxs])

  const categoryTxs = useMemo(() => {
    return transactions.filter((t) => t.category === targetCategory)
  }, [transactions, targetCategory])
  const categoryTotal = useMemo(() => categoryTxs.reduce((sum, t) => sum + t.amount, 0), [categoryTxs])

  const typeTxs = useMemo(() => {
    return transactions.filter((t) => t.type === targetType)
  }, [transactions, targetType])
  const typeTotal = useMemo(() => typeTxs.reduce((sum, t) => sum + t.amount, 0), [typeTxs])

  const zeroTxs = useMemo(() => {
    return transactions.filter((t) => !t.amount || t.amount <= 0 || isNaN(t.amount))
  }, [transactions])

  const formatMonthLabel = (m: string) => {
    try {
      return new Date(`${m}-01T12:00:00`).toLocaleDateString(undefined, {
        month: 'long',
        year: 'numeric'
      })
    } catch {
      return m
    }
  }

  // Action Triggers with Confirmations
  const confirmDeleteMonth = () => {
    if (monthTxs.length === 0) return
    const monthName = formatMonthLabel(targetMonth)
    askConfirm({
      title: `Delete all transactions in ${monthName}?`,
      message: `Permanently delete all ${monthTxs.length} transaction(s) totaling ${f(monthTotal)} for ${monthName}. This cannot be undone.`,
      confirmText: `Delete ${monthTxs.length} items`,
      danger: true,
      icon: 'trash',
      onConfirm: () => {
        onDeleteTransactions(monthTxs.map((t) => t.id), `transactions in ${monthName}`)
      }
    })
  }

  const confirmDeleteRange = () => {
    if (rangeTxs.length === 0) return
    askConfirm({
      title: `Delete transactions in range?`,
      message: `Permanently delete ${rangeTxs.length} transaction(s) totaling ${f(rangeTotal)} between ${rangeStart} and ${rangeEnd}. This cannot be undone.`,
      confirmText: `Delete ${rangeTxs.length} items`,
      danger: true,
      icon: 'trash',
      onConfirm: () => {
        onDeleteTransactions(rangeTxs.map((t) => t.id), `transactions from ${rangeStart} to ${rangeEnd}`)
      }
    })
  }

  const confirmDeleteCategory = () => {
    if (categoryTxs.length === 0) return
    askConfirm({
      title: `Delete all "${targetCategory}" transactions?`,
      message: `Permanently delete all ${categoryTxs.length} transaction(s) in category "${targetCategory}" totaling ${f(categoryTotal)}. This cannot be undone.`,
      confirmText: `Delete ${categoryTxs.length} items`,
      danger: true,
      icon: 'trash',
      onConfirm: () => {
        onDeleteTransactions(categoryTxs.map((t) => t.id), `transactions in "${targetCategory}"`)
      }
    })
  }

  const confirmDeleteType = () => {
    if (typeTxs.length === 0) return
    const typeLabel = targetType === 'income' ? 'Income' : targetType === 'expense' ? 'Expense' : 'Due'
    askConfirm({
      title: `Delete all ${typeLabel} transactions?`,
      message: `Permanently delete all ${typeTxs.length} ${typeLabel} transaction(s) totaling ${f(typeTotal)}. This cannot be undone.`,
      confirmText: `Delete ${typeTxs.length} items`,
      danger: true,
      icon: 'trash',
      onConfirm: () => {
        onDeleteTransactions(typeTxs.map((t) => t.id), `all ${typeLabel} transactions`)
      }
    })
  }

  const confirmDeleteZero = () => {
    if (zeroTxs.length === 0) return
    askConfirm({
      title: `Clean empty transactions?`,
      message: `Permanently delete ${zeroTxs.length} empty or zero-amount transaction(s).`,
      confirmText: `Clean ${zeroTxs.length} items`,
      danger: true,
      icon: 'trash',
      onConfirm: () => {
        onDeleteTransactions(zeroTxs.map((t) => t.id), `zero-amount transactions`)
      }
    })
  }

  const confirmDeleteAllTransactions = () => {
    if (transactions.length === 0) return
    askConfirm({
      title: `Clear all ${transactions.length} transactions?`,
      message: `Permanently delete EVERY transaction from your ledger. Your categories, budgets, and settings will remain safe. This cannot be undone.`,
      confirmText: `Delete all ${transactions.length} transactions`,
      danger: true,
      icon: 'trash',
      onConfirm: () => {
        onDeleteTransactions(transactions.map((t) => t.id), `all transactions`)
      }
    })
  }

  const confirmResetBudgets = () => {
    if (budgets.length === 0) return
    askConfirm({
      title: 'Delete all category budgets?',
      message: `Remove all ${budgets.length} category budget target limits. Transactions will NOT be deleted.`,
      confirmText: `Delete ${budgets.length} budgets`,
      danger: true,
      icon: 'trash',
      onConfirm: onResetBudgets
    })
  }

  const confirmResetMonthlyBudget = () => {
    askConfirm({
      title: 'Reset overall monthly budget?',
      message: 'Reset your monthly spending target to zero. Category budgets will remain unchanged.',
      confirmText: 'Reset target',
      danger: true,
      icon: 'reset',
      onConfirm: onResetMonthlyBudget
    })
  }

  const confirmClearReconciliation = () => {
    if (reconciliationCount === 0) return
    askConfirm({
      title: 'Clear reconciliation history?',
      message: `Permanently delete all ${reconciliationCount} statement reconciliation audit snapshots.`,
      confirmText: 'Clear history',
      danger: true,
      icon: 'trash',
      onConfirm: onClearReconciliationHistory
    })
  }

  const confirmResetCategories = (type: 'expense' | 'income' | 'both') => {
    const label = type === 'expense' ? 'expense' : type === 'income' ? 'income' : 'all'
    askConfirm({
      title: `Reset ${label} categories to defaults?`,
      message: `Restore standard THOGAI ${label} categories. Any custom category names will be removed. Existing transactions will keep their original tags.`,
      confirmText: 'Reset categories',
      danger: true,
      icon: 'reset',
      onConfirm: () => onResetCategories(type)
    })
  }

  const confirmResetAccounts = () => {
    askConfirm({
      title: 'Reset accounts to defaults?',
      message: 'Restore default accounts (Cash, Bank, Credit Card, Savings, UPI).',
      confirmText: 'Reset accounts',
      danger: true,
      icon: 'reset',
      onConfirm: onResetAccounts
    })
  }

  const confirmFactoryReset = () => {
    askConfirm({
      title: 'Factory reset all data?',
      message: 'EXTREME CAUTION: This will permanently wipe all transactions, budgets, settings, accounts, categories, and reconciliation history from this device and cloud sync.',
      confirmText: 'Erase everything',
      danger: true,
      icon: 'alert',
      onConfirm: onFactoryReset
    })
  }

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
        className="modal modal-advanced-delete"
        variants={reduced ? reducedMotionVariants : modalVariants}
        initial="initial"
        animate="animate"
        exit="exit"
        role="dialog"
        aria-modal="true"
        aria-label="Advanced Delete Options"
      >
        <div className="modal-head">
          <div>
            <span className="eyebrow" style={{ color: 'var(--negative)', display: 'flex', alignItems: 'center', gap: 5 }}>
              <ShieldAlert size={13} /> Advanced Data Cleanup
            </span>
            <h2 style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Trash2 size={20} className="danger-text" /> Advanced Delete Options
            </h2>
          </div>
          <button
            type="button"
            className="icon-button"
            onClick={close}
            aria-label="Close modal"
          >
            <X size={19} />
          </button>
        </div>

        <p className="modal-intro">
          Selectively purge transactions by month, date range, or category, or reset budgets and audit trails.
        </p>

        {/* Tab navigation */}
        <div className="type-tabs" style={{ marginBottom: 18 }}>
          <button
            type="button"
            className={activeTab === 'transactions' ? 'active' : ''}
            onClick={() => setActiveTab('transactions')}
          >
            <ReceiptText size={15} /> Transactions
          </button>
          <button
            type="button"
            className={activeTab === 'budgets' ? 'active' : ''}
            onClick={() => setActiveTab('budgets')}
          >
            <PiggyBank size={15} /> Budgets
          </button>
          <button
            type="button"
            className={activeTab === 'system' ? 'active' : ''}
            onClick={() => setActiveTab('system')}
          >
            <SlidersHorizontal size={15} /> Records & Reset
          </button>
        </div>

        {/* TAB 1: TRANSACTIONS CLEANUP */}
        {activeTab === 'transactions' && (
          <div className="advanced-delete-group">
            {/* Card 1: By Month */}
            <div className="cleanup-card">
              <div className="cleanup-card-header">
                <div className="cleanup-card-icon">
                  <CalendarDays size={18} />
                </div>
                <div>
                  <strong>Delete by Month</strong>
                  <p>Permanently remove all entries within a specific month.</p>
                </div>
              </div>
              <div className="cleanup-card-body">
                <div className="cleanup-field-row">
                  <ThemedSelect
                    ariaLabel="Select month to delete"
                    value={targetMonth}
                    onChange={(v) => setTargetMonth(v)}
                    options={availableMonths.map((m) => {
                      const count = transactions.filter((t) => t.date.slice(0, 7) === m).length
                      return {
                        value: m,
                        label: `${formatMonthLabel(m)} (${count} txs)`
                      }
                    })}
                    compact
                  />
                  <div className="cleanup-preview-pill">
                    <span>{monthTxs.length} items</span>
                    <b>{f(monthTotal)}</b>
                  </div>
                </div>
                <button
                  type="button"
                  className="button compact danger"
                  disabled={monthTxs.length === 0}
                  onClick={confirmDeleteMonth}
                >
                  <Trash2 size={14} /> Delete {formatMonthLabel(targetMonth)} ({monthTxs.length})
                </button>
              </div>
            </div>

            {/* Card 2: By Date Range */}
            <div className="cleanup-card">
              <div className="cleanup-card-header">
                <div className="cleanup-card-icon">
                  <Calendar size={18} />
                </div>
                <div>
                  <strong>Delete by Date Range</strong>
                  <p>Target transactions between custom start and end dates.</p>
                </div>
              </div>
              <div className="cleanup-card-body">
                <div className="cleanup-date-grid">
                  <ThemedDatePicker
                    value={rangeStart}
                    onChange={setRangeStart}
                    ariaLabel="Start date"
                  />
                  <ThemedDatePicker
                    value={rangeEnd}
                    onChange={setRangeEnd}
                    ariaLabel="End date"
                  />
                </div>
                <div className="cleanup-footer-row">
                  <div className="cleanup-preview-pill">
                    <span>{rangeTxs.length} items in range</span>
                    <b>{f(rangeTotal)}</b>
                  </div>
                  <button
                    type="button"
                    className="button compact danger"
                    disabled={rangeTxs.length === 0}
                    onClick={confirmDeleteRange}
                  >
                    <Trash2 size={14} /> Delete in range ({rangeTxs.length})
                  </button>
                </div>
              </div>
            </div>

            {/* Card 3: By Category */}
            <div className="cleanup-card">
              <div className="cleanup-card-header">
                <div className="cleanup-card-icon">
                  <Filter size={18} />
                </div>
                <div>
                  <strong>Delete by Category</strong>
                  <p>Remove all transactions assigned to a particular category.</p>
                </div>
              </div>
              <div className="cleanup-card-body">
                <div className="cleanup-field-row">
                  <ThemedSelect
                    ariaLabel="Select category to delete"
                    value={targetCategory}
                    onChange={(v) => setTargetCategory(v)}
                    options={categories.map((c) => {
                      const count = transactions.filter((t) => t.category === c).length
                      return {
                        value: c,
                        label: `${c} (${count} txs)`
                      }
                    })}
                    compact
                    searchable
                  />
                  <div className="cleanup-preview-pill">
                    <span>{categoryTxs.length} items</span>
                    <b>{f(categoryTotal)}</b>
                  </div>
                </div>
                <button
                  type="button"
                  className="button compact danger"
                  disabled={categoryTxs.length === 0}
                  onClick={confirmDeleteCategory}
                >
                  <Trash2 size={14} /> Delete all "{targetCategory}" ({categoryTxs.length})
                </button>
              </div>
            </div>

            {/* Card 4: By Type */}
            <div className="cleanup-card">
              <div className="cleanup-card-header">
                <div className="cleanup-card-icon">
                  <Layers size={18} />
                </div>
                <div>
                  <strong>Delete by Type</strong>
                  <p>Purge all expenses, all income, or all dues.</p>
                </div>
              </div>
              <div className="cleanup-card-body">
                <div className="cleanup-field-row">
                  <ThemedSelect
                    ariaLabel="Select transaction type to delete"
                    value={targetType}
                    onChange={(v) => setTargetType(v as TransactionType)}
                    options={[
                      { value: 'expense', label: 'Expenses only' },
                      { value: 'income', label: 'Income only' },
                      { value: 'due', label: 'Dues only' }
                    ]}
                    compact
                  />
                  <div className="cleanup-preview-pill">
                    <span>{typeTxs.length} items</span>
                    <b>{f(typeTotal)}</b>
                  </div>
                </div>
                <button
                  type="button"
                  className="button compact danger"
                  disabled={typeTxs.length === 0}
                  onClick={confirmDeleteType}
                >
                  <Trash2 size={14} /> Delete all {targetType}s ({typeTxs.length})
                </button>
              </div>
            </div>

            {/* Card 5: Zero-amount / Empty transactions */}
            {zeroTxs.length > 0 && (
              <div className="cleanup-card">
                <div className="cleanup-card-header">
                  <div className="cleanup-card-icon warning">
                    <AlertTriangle size={18} />
                  </div>
                  <div>
                    <strong>Clean Zero-Amount Entries</strong>
                    <p>Remove invalid or 0-rupee test entries.</p>
                  </div>
                </div>
                <div className="cleanup-card-body">
                  <button
                    type="button"
                    className="button compact danger"
                    onClick={confirmDeleteZero}
                  >
                    <Trash2 size={14} /> Clean {zeroTxs.length} zero-amount entries
                  </button>
                </div>
              </div>
            )}

            {/* Card 6: Clear all transactions */}
            <div className="cleanup-card danger-outline">
              <div className="cleanup-card-header">
                <div className="cleanup-card-icon danger">
                  <Trash2 size={18} />
                </div>
                <div>
                  <strong className="danger-text">Delete All Transactions</strong>
                  <p>Permanently wipe all {transactions.length} transactions while keeping budgets & settings intact.</p>
                </div>
              </div>
              <div className="cleanup-card-body">
                <button
                  type="button"
                  className="button danger full-width"
                  disabled={transactions.length === 0}
                  onClick={confirmDeleteAllTransactions}
                >
                  <Trash2 size={16} /> Delete All {transactions.length} Transactions
                </button>
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: BUDGETS CLEANUP */}
        {activeTab === 'budgets' && (
          <div className="advanced-delete-group">
            <div className="cleanup-card">
              <div className="cleanup-card-header">
                <div className="cleanup-card-icon">
                  <PiggyBank size={18} />
                </div>
                <div>
                  <strong>Clear Category Budgets</strong>
                  <p>Remove all {budgets.length} category spending targets. Transactions will remain intact.</p>
                </div>
              </div>
              <div className="cleanup-card-body">
                <button
                  type="button"
                  className="button compact danger"
                  disabled={budgets.length === 0}
                  onClick={confirmResetBudgets}
                >
                  <Trash2 size={14} /> Remove All {budgets.length} Category Budgets
                </button>
              </div>
            </div>

            <div className="cleanup-card">
              <div className="cleanup-card-header">
                <div className="cleanup-card-icon">
                  <RotateCcw size={18} />
                </div>
                <div>
                  <strong>Reset Overall Monthly Budget</strong>
                  <p>Reset the global monthly budget target back to zero.</p>
                </div>
              </div>
              <div className="cleanup-card-body">
                <button
                  type="button"
                  className="button compact ghost danger-text"
                  onClick={confirmResetMonthlyBudget}
                >
                  <RotateCcw size={14} /> Reset Monthly Budget Target
                </button>
              </div>
            </div>
          </div>
        )}

        {/* TAB 3: SYSTEM, AUDIT & FACTORY RESET */}
        {activeTab === 'system' && (
          <div className="advanced-delete-group">
            <div className="cleanup-card">
              <div className="cleanup-card-header">
                <div className="cleanup-card-icon">
                  <Landmark size={18} />
                </div>
                <div>
                  <strong>Reconciliation Audit Trail</strong>
                  <p>Permanently remove {reconciliationCount} statement reconciliation audit snapshots.</p>
                </div>
              </div>
              <div className="cleanup-card-body">
                <button
                  type="button"
                  className="button compact danger"
                  disabled={reconciliationCount === 0}
                  onClick={confirmClearReconciliation}
                >
                  <Trash2 size={14} /> Clear {reconciliationCount} Reconciliation Records
                </button>
              </div>
            </div>

            <div className="cleanup-card">
              <div className="cleanup-card-header">
                <div className="cleanup-card-icon">
                  <RotateCcw size={18} />
                </div>
                <div>
                  <strong>Reset Categories</strong>
                  <p>Reset expense ({categories.length}) and income ({incomeCategories.length}) categories back to factory defaults.</p>
                </div>
              </div>
              <div className="cleanup-card-body" style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button
                  type="button"
                  className="button compact ghost"
                  onClick={() => confirmResetCategories('expense')}
                >
                  Reset Expense Categories (23)
                </button>
                <button
                  type="button"
                  className="button compact ghost"
                  onClick={() => confirmResetCategories('income')}
                >
                  Reset Income Categories (11)
                </button>
              </div>
            </div>

            <div className="cleanup-card">
              <div className="cleanup-card-header">
                <div className="cleanup-card-icon">
                  <Landmark size={18} />
                </div>
                <div>
                  <strong>Reset Accounts</strong>
                  <p>Reset custom accounts back to default accounts (Cash, Bank, Credit Card, Savings, UPI).</p>
                </div>
              </div>
              <div className="cleanup-card-body">
                <button
                  type="button"
                  className="button compact ghost"
                  onClick={confirmResetAccounts}
                >
                  <RotateCcw size={14} /> Reset Accounts to Default
                </button>
              </div>
            </div>

            <div className="cleanup-card danger-outline" style={{ background: 'color-mix(in srgb, var(--negative) 6%, var(--surface))' }}>
              <div className="cleanup-card-header">
                <div className="cleanup-card-icon danger">
                  <ShieldAlert size={18} />
                </div>
                <div>
                  <strong className="danger-text">Full Factory Reset</strong>
                  <p>Wipe ALL transactions, budgets, settings, and reconciliation history. Completely start over fresh.</p>
                </div>
              </div>
              <div className="cleanup-card-body">
                <button
                  type="button"
                  className="button danger full-width"
                  onClick={confirmFactoryReset}
                >
                  <ShieldAlert size={16} /> Wipe Everything & Reset
                </button>
              </div>
            </div>
          </div>
        )}

        <div className="modal-actions" style={{ marginTop: 22 }}>
          <button type="button" className="button ghost" onClick={close}>
            Done
          </button>
        </div>
      </motion.div>
    </motion.div>
  )
}
