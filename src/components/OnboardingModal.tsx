import React, { useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import {
  ArrowLeft, ArrowRight, BarChart3, Bot, Check, CheckCircle2, ChevronRight,
  CircleDollarSign, CreditCard, Landmark, Plus, Scale, ShieldCheck, Sparkles,
  Trash2, User, WalletCards, X
} from 'lucide-react'
import { currencies, formatMoney, newId } from '../lib/finance'
import {
  defaultAccounts, defaultExpenseCategories, defaultIncomeCategories,
  type FinanceData, type Settings, type Transaction
} from '../services/storage'
import { ThemedSelect } from './ThemedSelect'
import {
  backdropVariants, desktopModalVariants, mobileSheetVariants,
  reducedMotionVariants, wordRevealContainer, wordRevealItem,
  onboardingStepVariants, iosSpring, buttonTap, primaryButtonTap
} from '../lib/motion'

interface OnboardingModalProps {
  currentSettings: Settings
  close: () => void
  onComplete: (data: {
    settings: Partial<Settings>
    initialTransactions?: Transaction[]
  }) => Promise<void> | void
}

const TOTAL_STEPS = 8

function AnimatedHeading({ text, className = '' }: { text: string; className?: string }) {
  const reduced = useReducedMotion()
  if (reduced) return <h2 className={className}>{text}</h2>

  const words = text.split(' ')
  return (
    <motion.h2
      className={`animated-heading ${className}`}
      variants={wordRevealContainer}
      initial="initial"
      animate="animate"
    >
      {words.map((word, i) => (
        <motion.span key={i} variants={wordRevealItem} className="reveal-word">
          {word}{' '}
        </motion.span>
      ))}
    </motion.h2>
  )
}

function AnimatedParagraph({ text, className = '' }: { text: string; className?: string }) {
  const reduced = useReducedMotion()
  if (reduced) return <p className={className}>{text}</p>

  const words = text.split(' ')
  return (
    <motion.p
      className={`animated-paragraph ${className}`}
      variants={wordRevealContainer}
      initial="initial"
      animate="animate"
    >
      {words.map((word, i) => (
        <motion.span key={i} variants={wordRevealItem} className="reveal-word">
          {word}{' '}
        </motion.span>
      ))}
    </motion.p>
  )
}

export function OnboardingModal({
  currentSettings,
  close,
  onComplete
}: OnboardingModalProps) {
  const reduced = useReducedMotion()
  const isMobile = typeof window !== 'undefined' && window.innerWidth <= 768
  const modalVariants = isMobile ? mobileSheetVariants : desktopModalVariants

  const [step, setStep] = useState(1)
  const [direction, setDirection] = useState(1)

  // Step state
  const [selectedCurrency, setSelectedCurrency] = useState(currentSettings.currency || 'INR')
  const [expenseCats, setExpenseCats] = useState<string[]>(
    currentSettings.categories || defaultExpenseCategories
  )
  const [incomeCats, setIncomeCats] = useState<string[]>(
    currentSettings.incomeCategories || defaultIncomeCategories
  )
  const [newCatInput, setNewCatInput] = useState('')
  const [newCatType, setNewCatType] = useState<'expense' | 'income'>('expense')

  // Accounts state with opening balances
  const [accounts, setAccounts] = useState<Array<{ name: string; openingBalance: string }>>(() => {
    const list = currentSettings.accounts || defaultAccounts
    return list.map((a) => ({ name: a, openingBalance: '' }))
  })
  const [newAccInput, setNewAccInput] = useState('')

  // Budget state
  const [monthlyBudget, setMonthlyBudget] = useState<string>(
    currentSettings.monthlyBudget ? String(currentSettings.monthlyBudget) : ''
  )

  // Nickname state
  const [nickname, setNickname] = useState<string>(currentSettings.name || '')

  // Tour active tab
  const [tourTab, setTourTab] = useState<number>(0)

  const goTo = (nextStep: number) => {
    setDirection(nextStep > step ? 1 : -1)
    setStep(nextStep)
  }

  const next = () => {
    if (step < TOTAL_STEPS) {
      goTo(step + 1)
    } else {
      finish()
    }
  }

  const prev = () => {
    if (step > 1) {
      goTo(step - 1)
    }
  }

  const finish = () => {
    const patch: Partial<Settings> = {
      currency: selectedCurrency,
      categories: expenseCats,
      incomeCategories: incomeCats,
      accounts: accounts.map((a) => a.name).filter(Boolean),
      defaultAccount: accounts[0]?.name || 'Cash',
      monthlyBudget: monthlyBudget ? Number(monthlyBudget) : 0,
      name: nickname.trim(),
      onboardingCompleted: true
    }

    // Build initial opening balance transactions if specified
    const initialTxs: Transaction[] = []
    const todayStr = new Date().toISOString().slice(0, 10)
    const nowIso = new Date().toISOString()

    accounts.forEach((acc) => {
      const bal = Number(acc.openingBalance)
      if (bal && bal > 0) {
        initialTxs.push({
          id: newId(),
          type: 'income',
          category: incomeCats.includes('Salary') ? 'Salary' : incomeCats[0] || 'Income',
          amount: bal,
          date: todayStr,
          account: acc.name,
          description: `Initial balance — ${acc.name}`,
          notes: 'Opening account balance setup',
          recurring: false,
          createdAt: nowIso,
          updatedAt: nowIso
        })
      }
    })

    onComplete({ settings: patch, initialTransactions: initialTxs })
    close()
  }

  const skipAll = () => {
    onComplete({
      settings: {
        onboardingCompleted: true
      }
    })
    close()
  }

  const handleAddCategory = () => {
    const trimmed = newCatInput.trim()
    if (!trimmed) return
    if (newCatType === 'expense') {
      if (!expenseCats.includes(trimmed)) setExpenseCats([...expenseCats, trimmed])
    } else {
      if (!incomeCats.includes(trimmed)) setIncomeCats([...incomeCats, trimmed])
    }
    setNewCatInput('')
  }

  const handleRemoveCategory = (cat: string, type: 'expense' | 'income') => {
    if (type === 'expense') {
      setExpenseCats(expenseCats.filter((c) => c !== cat))
    } else {
      setIncomeCats(incomeCats.filter((c) => c !== cat))
    }
  }

  const handleAddAccount = () => {
    const trimmed = newAccInput.trim()
    if (!trimmed) return
    if (!accounts.some((a) => a.name.toLowerCase() === trimmed.toLowerCase())) {
      setAccounts([...accounts, { name: trimmed, openingBalance: '' }])
    }
    setNewAccInput('')
  }

  const handleRemoveAccount = (accName: string) => {
    if (accounts.length <= 1) return
    setAccounts(accounts.filter((a) => a.name !== accName))
  }

  const handleBalanceChange = (accName: string, val: string) => {
    setAccounts(
      accounts.map((a) => (a.name === accName ? { ...a, openingBalance: val } : a))
    )
  }

  const currencyObj = currencies.find((c) => c.code === selectedCurrency) || currencies[0]

  return (
    <motion.div
      className="modal-layer"
      variants={backdropVariants}
      initial="initial"
      animate="animate"
      exit="exit"
    >
      <motion.div
        className="modal modal-onboarding"
        variants={reduced ? reducedMotionVariants : modalVariants}
        initial="initial"
        animate="animate"
        exit="exit"
        role="dialog"
        aria-modal="true"
        aria-label="Welcome Setup"
      >
        {/* Onboarding Header */}
        <div className="onboarding-header">
          <div className="onboarding-progress-dots">
            {Array.from({ length: TOTAL_STEPS }).map((_, i) => (
              <span
                key={i}
                className={`progress-dot ${i + 1 === step ? 'active' : i + 1 < step ? 'completed' : ''}`}
                onClick={() => goTo(i + 1)}
                role="button"
                tabIndex={0}
                aria-label={`Step ${i + 1}`}
              />
            ))}
          </div>

          <button
            type="button"
            className="text-button skip-setup-btn"
            onClick={skipAll}
          >
            Skip setup
          </button>
        </div>

        {/* Dynamic Step Content */}
        <div className="onboarding-body">
          <AnimatePresence mode="wait" custom={direction}>
            {/* STEP 1: Welcome */}
            {step === 1 && (
              <motion.div
                key="step-1"
                custom={direction}
                variants={onboardingStepVariants}
                initial="initial"
                animate="animate"
                exit="exit"
                className="onboarding-step-pane"
              >
                <div className="step-badge">
                  <ShieldCheck size={16} />
                  <span>Private by design</span>
                </div>
                <AnimatedHeading text="Welcome to THOGAI" className="onboarding-title" />
                <AnimatedParagraph
                  text="Know your money."
                  className="onboarding-subtitle"
                />
                <div className="philosophy-box">
                  <p>
                    Private. Honest. Simple.
                    No advertisements, no tracking pixels, and no mandatory bank integrations.
                    You are in total command of your finances.
                  </p>
                </div>
                <div className="step-features-list">
                  <div className="feature-bullet">
                    <span className="bullet-dot" />
                    <span>Instant, frictionless transaction entry</span>
                  </div>
                  <div className="feature-bullet">
                    <span className="bullet-dot" />
                    <span>Deterministic bank statement reconciliation</span>
                  </div>
                  <div className="feature-bullet">
                    <span className="bullet-dot" />
                    <span>Encrypted cloud backup with full offline capability</span>
                  </div>
                </div>
              </motion.div>
            )}

            {/* STEP 2: Currency */}
            {step === 2 && (
              <motion.div
                key="step-2"
                custom={direction}
                variants={onboardingStepVariants}
                initial="initial"
                animate="animate"
                exit="exit"
                className="onboarding-step-pane"
              >
                <div className="step-badge">
                  <CircleDollarSign size={16} />
                  <span>Step 2 of {TOTAL_STEPS}</span>
                </div>
                <AnimatedHeading text="Choose your currency" className="onboarding-title" />
                <p className="onboarding-desc">
                  All your transactions, budgets and insights will format in this currency.
                  You can change this anytime from Settings.
                </p>

                <div className="currency-selector-grid">
                  {currencies.map((c) => (
                    <button
                      key={c.code}
                      type="button"
                      className={`currency-card ${selectedCurrency === c.code ? 'selected' : ''}`}
                      onClick={() => setSelectedCurrency(c.code)}
                    >
                      <span className="curr-sym">{c.symbol}</span>
                      <div className="curr-info">
                        <strong>{c.code}</strong>
                        <small>{c.name}</small>
                      </div>
                      {selectedCurrency === c.code && (
                        <span className="curr-check">
                          <Check size={14} />
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              </motion.div>
            )}

            {/* STEP 3: Categories */}
            {step === 3 && (
              <motion.div
                key="step-3"
                custom={direction}
                variants={onboardingStepVariants}
                initial="initial"
                animate="animate"
                exit="exit"
                className="onboarding-step-pane"
              >
                <div className="step-badge">
                  <BarChart3 size={16} />
                  <span>Step 3 of {TOTAL_STEPS}</span>
                </div>
                <AnimatedHeading text="Review your categories" className="onboarding-title" />
                <p className="onboarding-desc">
                  Sensible categories tailored for everyday spending. Add your own or customize.
                </p>

                <div className="category-section-tabs">
                  <button
                    type="button"
                    className={`sub-tab ${newCatType === 'expense' ? 'active' : ''}`}
                    onClick={() => setNewCatType('expense')}
                  >
                    Expenses ({expenseCats.length})
                  </button>
                  <button
                    type="button"
                    className={`sub-tab ${newCatType === 'income' ? 'active' : ''}`}
                    onClick={() => setNewCatType('income')}
                  >
                    Income ({incomeCats.length})
                  </button>
                </div>

                <div className="category-pills-wrap">
                  {(newCatType === 'expense' ? expenseCats : incomeCats).map((cat) => (
                    <span key={cat} className="category-tag-pill">
                      <span>{cat}</span>
                      <button
                        type="button"
                        className="remove-cat-btn"
                        onClick={() => handleRemoveCategory(cat, newCatType)}
                        aria-label={`Remove ${cat}`}
                      >
                        <X size={12} />
                      </button>
                    </span>
                  ))}
                </div>

                <div className="inline-add-row">
                  <input
                    type="text"
                    placeholder={`Add custom ${newCatType} category...`}
                    value={newCatInput}
                    onChange={(e) => setNewCatInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault()
                        handleAddCategory()
                      }
                    }}
                  />
                  <button
                    type="button"
                    className="button compact secondary"
                    onClick={handleAddCategory}
                    disabled={!newCatInput.trim()}
                  >
                    <Plus size={15} /> Add
                  </button>
                </div>
              </motion.div>
            )}

            {/* STEP 4: Accounts & Opening Balances */}
            {step === 4 && (
              <motion.div
                key="step-4"
                custom={direction}
                variants={onboardingStepVariants}
                initial="initial"
                animate="animate"
                exit="exit"
                className="onboarding-step-pane"
              >
                <div className="step-badge">
                  <WalletCards size={16} />
                  <span>Step 4 of {TOTAL_STEPS}</span>
                </div>
                <AnimatedHeading text="Set up your accounts" className="onboarding-title" />
                <p className="onboarding-desc">
                  Keep separate balances for cash, bank accounts, and credit cards. Set starting balances so your numbers are honest from day one.
                </p>

                <div className="accounts-setup-list">
                  {accounts.map((acc) => (
                    <div key={acc.name} className="account-setup-card">
                      <div className="acc-info-row">
                        <div className="acc-title-group">
                          <Landmark size={18} />
                          <strong>{acc.name}</strong>
                        </div>
                        {accounts.length > 1 && (
                          <button
                            type="button"
                            className="icon-button compact"
                            onClick={() => handleRemoveAccount(acc.name)}
                            title="Remove account"
                          >
                            <Trash2 size={14} />
                          </button>
                        )}
                      </div>
                      <div className="acc-balance-input-wrap">
                        <label>Opening Balance</label>
                        <div className="input-with-sym">
                          <span>{currencyObj.symbol}</span>
                          <input
                            type="number"
                            step="any"
                            placeholder="0"
                            value={acc.openingBalance}
                            onChange={(e) => handleBalanceChange(acc.name, e.target.value)}
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="inline-add-row">
                  <input
                    type="text"
                    placeholder="Add account (e.g. Savings, HDFC, Forex)..."
                    value={newAccInput}
                    onChange={(e) => setNewAccInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault()
                        handleAddAccount()
                      }
                    }}
                  />
                  <button
                    type="button"
                    className="button compact secondary"
                    onClick={handleAddAccount}
                    disabled={!newAccInput.trim()}
                  >
                    <Plus size={15} /> Add account
                  </button>
                </div>
              </motion.div>
            )}

            {/* STEP 5: Monthly Target */}
            {step === 5 && (
              <motion.div
                key="step-5"
                custom={direction}
                variants={onboardingStepVariants}
                initial="initial"
                animate="animate"
                exit="exit"
                className="onboarding-step-pane"
              >
                <div className="step-badge">
                  <BarChart3 size={16} />
                  <span>Step 5 of {TOTAL_STEPS}</span>
                </div>
                <AnimatedHeading text="Set a monthly target" className="onboarding-title" />
                <p className="onboarding-desc">
                  An overall limit helps you keep track of your spending without feeling restricted.
                  You can fine-tune individual category budgets anytime.
                </p>

                <div className="target-input-card">
                  <label className="field-label">Overall Monthly Limit (Optional)</label>
                  <div className="big-target-input">
                    <span className="big-sym">{currencyObj.symbol}</span>
                    <input
                      type="number"
                      placeholder="50,000"
                      value={monthlyBudget}
                      onChange={(e) => setMonthlyBudget(e.target.value)}
                      autoFocus
                    />
                  </div>
                  <small className="target-hint">
                    Leave blank or 0 to skip setting an overall limit for now.
                  </small>
                </div>
              </motion.div>
            )}

            {/* STEP 6: Personalize & Nickname */}
            {step === 6 && (
              <motion.div
                key="step-6"
                custom={direction}
                variants={onboardingStepVariants}
                initial="initial"
                animate="animate"
                exit="exit"
                className="onboarding-step-pane"
              >
                <div className="step-badge">
                  <User size={16} />
                  <span>Step 6 of {TOTAL_STEPS}</span>
                </div>
                <AnimatedHeading text="What should THOGAI call you?" className="onboarding-title" />
                <p className="onboarding-desc">
                  Your name or nickname appears in your daily greeting and personalized summaries.
                </p>

                <div className="nickname-input-card">
                  <label className="field-label">Preferred Name / Nickname</label>
                  <input
                    type="text"
                    className="nickname-input"
                    placeholder="e.g. Varun"
                    value={nickname}
                    onChange={(e) => setNickname(e.target.value)}
                    autoFocus
                  />
                  <small className="nickname-hint">
                    Synced securely with your encrypted account profile.
                  </small>
                </div>
              </motion.div>
            )}

            {/* STEP 7: Quick Feature Tour */}
            {step === 7 && (
              <motion.div
                key="step-7"
                custom={direction}
                variants={onboardingStepVariants}
                initial="initial"
                animate="animate"
                exit="exit"
                className="onboarding-step-pane"
              >
                <div className="step-badge">
                  <Sparkles size={16} />
                  <span>Step 7 of {TOTAL_STEPS}</span>
                </div>
                <AnimatedHeading text="Three pillars of THOGAI" className="onboarding-title" />
                <p className="onboarding-desc">
                  Designed for peace of mind, honest clarity, and daily reliability.
                </p>

                <div className="tour-tabs-row">
                  <button
                    type="button"
                    className={`tour-nav-btn ${tourTab === 0 ? 'active' : ''}`}
                    onClick={() => setTourTab(0)}
                  >
                    1. Ledger
                  </button>
                  <button
                    type="button"
                    className={`tour-nav-btn ${tourTab === 1 ? 'active' : ''}`}
                    onClick={() => setTourTab(1)}
                  >
                    2. Budgets
                  </button>
                  <button
                    type="button"
                    className={`tour-nav-btn ${tourTab === 2 ? 'active' : ''}`}
                    onClick={() => setTourTab(2)}
                  >
                    3. AI Advisor
                  </button>
                </div>

                <div className="tour-card-display">
                  {tourTab === 0 && (
                    <div className="tour-card">
                      <div className="tour-icon ledger">
                        <Scale size={32} />
                      </div>
                      <h3>Universal Ledger</h3>
                      <p>
                        Record every rupee in seconds. Filter by date ranges, search across notes, and
                        reconcile directly against your official bank statements.
                      </p>
                    </div>
                  )}

                  {tourTab === 1 && (
                    <div className="tour-card">
                      <div className="tour-icon budget">
                        <BarChart3 size={32} />
                      </div>
                      <h3>Intentional Budgets</h3>
                      <p>
                        Category targets that make sense. Visual progress indicators that guide your
                        spending decisions rather than locking you out.
                      </p>
                    </div>
                  )}

                  {tourTab === 2 && (
                    <div className="tour-card">
                      <div className="tour-icon ai">
                        <Bot size={32} />
                      </div>
                      <h3>Private AI Advisor</h3>
                      <p>
                        Your personal financial counsel. Ask anything about your spending habits, upcoming
                        dues, or savings targets with complete local privacy.
                      </p>
                    </div>
                  )}
                </div>
              </motion.div>
            )}

            {/* STEP 8: Ready */}
            {step === 8 && (
              <motion.div
                key="step-8"
                custom={direction}
                variants={onboardingStepVariants}
                initial="initial"
                animate="animate"
                exit="exit"
                className="onboarding-step-pane ready-pane"
              >
                <div className="ready-icon-wrap">
                  <CheckCircle2 size={56} className="ready-check" />
                </div>
                <AnimatedHeading text="You're all set." className="onboarding-title" />
                <AnimatedParagraph
                  text="Your financial command center is configured and ready."
                  className="onboarding-subtitle"
                />

                <div className="setup-summary-pill-box">
                  <div className="summary-pill">
                    <span>Currency</span>
                    <strong>{selectedCurrency}</strong>
                  </div>
                  <div className="summary-pill">
                    <span>Accounts</span>
                    <strong>{accounts.length} configured</strong>
                  </div>
                  <div className="summary-pill">
                    <span>Monthly Target</span>
                    <strong>
                      {monthlyBudget ? formatMoney(Number(monthlyBudget), selectedCurrency) : 'Flexible'}
                    </strong>
                  </div>
                  {nickname && (
                    <div className="summary-pill">
                      <span>User</span>
                      <strong>{nickname}</strong>
                    </div>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Onboarding Footer Controls */}
        <div className="onboarding-footer">
          {step > 1 ? (
            <button type="button" className="button secondary back-btn" onClick={prev}>
              <ArrowLeft size={16} /> Back
            </button>
          ) : (
            <div />
          )}

          <button
            type="button"
            className="button primary next-btn"
            onClick={next}
          >
            {step === TOTAL_STEPS ? (
              <>
                Enter THOGAI <ArrowRight size={16} />
              </>
            ) : step === 1 ? (
              <>
                Get started <ArrowRight size={16} />
              </>
            ) : (
              <>
                Continue <ArrowRight size={16} />
              </>
            )}
          </button>
        </div>
      </motion.div>
    </motion.div>
  )
}
