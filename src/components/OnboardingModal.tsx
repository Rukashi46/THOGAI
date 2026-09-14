import React, { useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import {
  ArrowLeft, ArrowRight, BarChart3, Bot, Check, CheckCircle2,
  CircleDollarSign, Landmark, Plus, Scale, ShieldCheck,
  Trash2, User, WalletCards, X
} from 'lucide-react'
import { currencies, formatMoney } from '../lib/finance'
import {
  defaultAccounts, defaultExpenseCategories, defaultIncomeCategories,
  type Settings, type Transaction
} from '../services/storage'
import {
  backdropVariants, desktopModalVariants, mobileSheetVariants,
  reducedMotionVariants, wordRevealContainer, wordRevealItem,
  onboardingStepVariants, buttonTap, primaryButtonTap
} from '../lib/motion'

interface OnboardingModalProps {
  currentSettings: Settings
  close: () => void
  onComplete: (data: {
    settings: Partial<Settings>
    initialTransactions?: Transaction[]
  }) => Promise<void> | void
}

const TOTAL_STEPS = 5

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

  // Step 2: Personalize
  const [nickname, setNickname] = useState<string>(currentSettings.name || '')
  const [selectedCurrency, setSelectedCurrency] = useState(currentSettings.currency || 'INR')

  // Step 3: Categories
  const [expenseCats, setExpenseCats] = useState<string[]>(
    currentSettings.categories || defaultExpenseCategories
  )
  const [incomeCats, setIncomeCats] = useState<string[]>(
    currentSettings.incomeCategories || defaultIncomeCategories
  )
  const [newCatInput, setNewCatInput] = useState('')
  const [newCatType, setNewCatType] = useState<'expense' | 'income'>('expense')

  // Step 4: Accounts & Initial Balances
  const [accounts, setAccounts] = useState<Array<{ name: string; openingBalance: string }>>(() => {
    const list = currentSettings.accounts || defaultAccounts
    return list.map((a) => ({ name: a, openingBalance: '' }))
  })
  const [newAccInput, setNewAccInput] = useState('')

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
    // Sum opening balances to set startingBalance in settings without creating earned income
    const sumOpening = accounts.reduce((acc, a) => acc + (Number(a.openingBalance) || 0), 0)

    const patch: Partial<Settings> = {
      currency: selectedCurrency,
      categories: expenseCats,
      incomeCategories: incomeCats,
      accounts: accounts.map((a) => a.name).filter(Boolean),
      defaultAccount: accounts[0]?.name || 'Cash',
      name: nickname.trim(),
      startingBalance: sumOpening,
      onboardingCompleted: true
    }

    // Do NOT create earned income transactions for initial balances
    onComplete({ settings: patch })
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
      if (expenseCats.length <= 1) return
      setExpenseCats(expenseCats.filter((c) => c !== cat))
    } else {
      if (incomeCats.length <= 1) return
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
                    <span>Universal ledger with shared expense support</span>
                  </div>
                  <div className="feature-bullet">
                    <span className="bullet-dot" />
                    <span>Deterministic bank statement reconciliation</span>
                  </div>
                </div>
              </motion.div>
            )}

            {/* STEP 2: Personalize */}
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
                  <User size={16} />
                  <span>Step 2 of {TOTAL_STEPS}</span>
                </div>
                <AnimatedHeading text="Personalize your experience" className="onboarding-title" />
                <p className="onboarding-desc">
                  Choose what THOGAI should call you and select your primary currency.
                </p>

                <div className="space-y-4 mt-4">
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
                  </div>

                  <div className="currency-section mt-4">
                    <label className="field-label block mb-2">Primary Currency</label>
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
                  </div>
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

            {/* STEP 4: Accounts & Initial Balances */}
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
                  Keep separate balances for cash, bank accounts, and cards. Configure starting balances so your numbers are accurate from day one.
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

            {/* STEP 5: You're Ready */}
            {step === 5 && (
              <motion.div
                key="step-5"
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
                <AnimatedHeading text="You're ready." className="onboarding-title" />
                <AnimatedParagraph
                  text="Your financial command center is configured."
                  className="onboarding-subtitle"
                />

                <div className="space-y-3 my-4">
                  <div className="p-3 rounded-lg border border-border-subtle bg-surface-subtle flex items-start gap-3">
                    <Scale size={20} className="text-accent mt-0.5" />
                    <div>
                      <strong className="text-sm block">Ledger</strong>
                      <span className="text-xs text-muted">Track every inflow and expense.</span>
                    </div>
                  </div>

                  <div className="p-3 rounded-lg border border-border-subtle bg-surface-subtle flex items-start gap-3">
                    <BarChart3 size={20} className="text-accent mt-0.5" />
                    <div>
                      <strong className="text-sm block">Budget</strong>
                      <span className="text-xs text-muted">See where your money is going.</span>
                    </div>
                  </div>

                  <div className="p-3 rounded-lg border border-border-subtle bg-surface-subtle flex items-start gap-3">
                    <Bot size={20} className="text-accent mt-0.5" />
                    <div>
                      <strong className="text-sm block">AI Advisor</strong>
                      <span className="text-xs text-muted">Get insights based on your financial activity.</span>
                    </div>
                  </div>
                </div>

                <div className="setup-summary-pill-box">
                  <div className="summary-pill">
                    <span>Currency</span>
                    <strong>{selectedCurrency}</strong>
                  </div>
                  <div className="summary-pill">
                    <span>Accounts</span>
                    <strong>{accounts.length} configured</strong>
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
                Finish <ArrowRight size={16} />
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
