import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Leaf, Mail, Lock, User, ArrowRight, Check, AlertCircle, Sparkles, KeyRound, HardDrive, Send, MailCheck, RefreshCw } from 'lucide-react'
import { authService, type AuthUser } from '../services/auth'
import { isSupabaseConfigured } from '../lib/supabase'
import { authStepVariants, iosSpring } from '../lib/motion'
import type { ThemeId } from '../services/storage'

interface AuthScreenProps {
  currentTheme: ThemeId
  onThemeChange: (theme: ThemeId) => void
  onSuccess: (user: AuthUser) => void
  onContinueOffline: () => void
  initialMode?: 'login' | 'signup' | 'forgot' | 'reset_password' | 'confirm_email'
}

export function AuthScreen({
  currentTheme,
  onThemeChange,
  onSuccess,
  onContinueOffline,
  initialMode = 'login'
}: AuthScreenProps) {
  const [mode, setMode] = useState<'login' | 'signup' | 'forgot' | 'reset_password' | 'confirm_email'>(initialMode)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [name, setName] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [infoMessage, setInfoMessage] = useState('')
  const [isVerifiedSuccess, setIsVerifiedSuccess] = useState(false)
  const [resending, setResending] = useState(false)
  const [resendSent, setResendSent] = useState(false)
  const [resendCooldown, setResendCooldown] = useState(0)

  const configured = isSupabaseConfigured()

  const cleanAuthError = (err: any, fallback = 'Something went wrong. Please try again.'): string => {
    if (!err) return fallback
    const raw = String(err?.message || err || '').trim()
    const lower = raw.toLowerCase()
    if (lower.includes('invalid login credentials') || lower.includes('invalid credentials')) {
      return 'Incorrect email or password. Please check and try again.'
    }
    if (lower.includes('user already registered') || lower.includes('already registered') || lower.includes('already exists')) {
      return 'An account with this email already exists. Try logging in instead.'
    }
    if (lower.includes('rate limit') || lower.includes('too many requests')) {
      return 'Too many attempts. Please wait a moment and try again.'
    }
    if (lower.includes('not confirmed') || lower.includes('email not confirmed')) {
      return 'Please verify your email address to continue.'
    }
    if (lower.includes('password') && (lower.includes('short') || lower.includes('least 6'))) {
      return 'Password must be at least 6 characters long.'
    }
    if (lower.includes('supabase') || lower.includes('http') || lower.includes('status code') || lower.includes('api') || lower.includes('token') || lower.includes('internal') || lower.includes('uuid')) {
      return fallback
    }
    return raw || fallback
  }

  // Resend cooldown timer
  useEffect(() => {
    if (resendCooldown <= 0) return
    const timer = setInterval(() => {
      setResendCooldown((prev) => (prev > 1 ? prev - 1 : 0))
    }, 1000)
    return () => clearInterval(timer)
  }, [resendCooldown])

  const triggerSuccessAndEnter = (confirmedUser: AuthUser) => {
    setIsVerifiedSuccess(true)
    setTimeout(() => {
      onSuccess(confirmedUser)
    }, 1400)
  }

  // Auto-detect confirmation and automatically log in & load app
  useEffect(() => {
    if (mode !== 'confirm_email' || !email || !password) return

    let active = true

    const checkConfirmed = async () => {
      try {
        const user = await authService.signIn(email, password)
        if (user && active) {
          triggerSuccessAndEnter(user)
        }
      } catch {
        // Still awaiting confirmation, silently continue polling
      }
    }

    // 1. Poll every 3.5 seconds
    const interval = setInterval(checkConfirmed, 3500)

    // 2. Immediate check when user switches back to this browser tab / window from their email
    const handleFocus = () => {
      if (document.visibilityState === 'visible') {
        checkConfirmed()
      }
    }
    window.addEventListener('visibilitychange', handleFocus)
    window.addEventListener('focus', handleFocus)

    return () => {
      active = false
      clearInterval(interval)
      window.removeEventListener('visibilitychange', handleFocus)
      window.removeEventListener('focus', handleFocus)
    }
  }, [mode, email, password, onSuccess])

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    if (!email || !password) {
      setError('Please fill in both email and password.')
      return
    }
    setLoading(true)
    try {
      const user = await authService.signIn(email, password)
      onSuccess(user)
    } catch (err: any) {
      const msg = (err?.message || '').toLowerCase()
      if (msg.includes('not confirmed') || msg.includes('email not confirmed')) {
        setError('')
        setMode('confirm_email')
      } else {
        setError(cleanAuthError(err, 'Could not log in. Please check your credentials.'))
      }
    } finally {
      setLoading(false)
    }
  }

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    if (!name || !email || !password) {
      setError('Please fill in all required fields.')
      return
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match.')
      return
    }
    if (password.length < 6) {
      setError('Password must be at least 6 characters long.')
      return
    }
    setLoading(true)
    try {
      const { user, hasSession } = await authService.signUp(email, password, name)
      if (hasSession) {
        onSuccess(user)
      } else {
        setError('')
        setMode('confirm_email')
      }
    } catch (err: any) {
      setError(cleanAuthError(err, 'Failed to create account. Please try again.'))
    } finally {
      setLoading(false)
    }
  }

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setInfoMessage('')
    if (!email) {
      setError('Please enter your account email address.')
      return
    }
    setLoading(true)
    try {
      await authService.resetPassword(email)
      setInfoMessage('Password reset link sent! Check your email inbox.')
    } catch (err: any) {
      setError(cleanAuthError(err, 'Failed to send reset link. Please try again.'))
    } finally {
      setLoading(false)
    }
  }

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    if (!password) {
      setError('Please enter a new password.')
      return
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match.')
      return
    }
    if (password.length < 6) {
      setError('Password must be at least 6 characters.')
      return
    }
    setLoading(true)
    try {
      await authService.updatePassword(password)
      setInfoMessage('Password updated successfully! You can now log in.')
      setTimeout(() => setMode('login'), 1500)
    } catch (err: any) {
      setError(cleanAuthError(err, 'Failed to update password. Please try again.'))
    } finally {
      setLoading(false)
    }
  }

  const handleManualVerifyCheck = async () => {
    setError('')
    setInfoMessage('')
    if (password && email) {
      setLoading(true)
      try {
        const user = await authService.signIn(email, password)
        if (user) {
          triggerSuccessAndEnter(user)
          return
        }
      } catch (err: any) {
        const msg = (err?.message || '').toLowerCase()
        if (msg.includes('not confirmed') || msg.includes('email not confirmed')) {
          setError("We haven't detected your verification yet. Please tap the link sent to your email, then try again.")
          setLoading(false)
          return
        }
      } finally {
        setLoading(false)
      }
    }
  }

  const themes: { id: ThemeId; label: string; short: string }[] = [
    { id: 'midnight', label: 'Midnight Glass', short: 'Midnight' },
    { id: 'cream', label: 'Cream Clay', short: 'Cream' },
    { id: 'amoled', label: 'AMOLED', short: 'AMOLED' }
  ]

  if (isVerifiedSuccess) {
    return (
      <div className="auth-container">
        <div className="auth-glow" />
        <header className="auth-topbar">
          <div className="brand">
            <div className="brand-mark" aria-hidden="true">
              <i /><i /><i />
              <b><Leaf size={11} /></b>
            </div>
            <div className="auth-brand-text">
              <strong>THOGAI</strong>
              <span>Know your money.</span>
            </div>
          </div>
        </header>

        <div className="auth-card-wrap">
          <motion.div
            className="auth-card"
            initial={{ opacity: 0, scale: 0.94, y: 15 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={iosSpring}
            style={{ textAlign: 'center', padding: '38px 24px' }}
          >
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ type: 'spring', stiffness: 420, damping: 24, delay: 0.1 }}
              className="auth-confirm-circle"
              style={{ margin: '0 auto 16px', background: 'color-mix(in srgb, var(--accent) 18%, transparent)', color: 'var(--accent)' }}
            >
              <Check size={38} strokeWidth={2.6} />
            </motion.div>
            <motion.h2
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              style={{ font: '700 24px/1.2 var(--display)', margin: '0 0 6px', letterSpacing: '-0.02em', color: 'var(--text)' }}
            >
              Email verified ✓
            </motion.h2>
            <motion.p
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
              style={{ margin: 0, fontSize: 14, color: 'var(--text-2)' }}
            >
              Welcome to THOGAI
            </motion.p>
          </motion.div>
        </div>
      </div>
    )
  }

  return (
    <div className="auth-container">
      {/* Background radial glow */}
      <div className="auth-glow" />

      {/* Top Header with Theme Switcher */}
      <header className="auth-topbar">
        <div className="brand">
          <div className="brand-mark" aria-hidden="true">
            <i /><i /><i />
            <b><Leaf size={11} /></b>
          </div>
          <div className="auth-brand-text">
            <strong>THOGAI</strong>
            <span>Know your money.</span>
          </div>
        </div>

        {/* Theme Pills */}
        <div className="auth-theme-pills">
          {themes.map((t) => (
            <button
              key={t.id}
              type="button"
              className={`auth-theme-btn ${currentTheme === t.id ? 'active' : ''}`}
              onClick={() => onThemeChange(t.id)}
            >
              <span className="theme-label-full">{t.label}</span>
              <span className="theme-label-short">{t.short}</span>
            </button>
          ))}
        </div>
      </header>

      <div className="auth-card-wrap">
        <motion.div
          className="auth-card"
          initial={{ opacity: 0, scale: 0.96, y: 15 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          transition={iosSpring}
        >
          {/* Cloud vs Local Mode Status Banner */}
          {!configured && (
            <div className="auth-status-banner local">
              <HardDrive size={15} />
              <div>
                <strong>Local Mode Active</strong>
                <p>Your financial records are saved securely on this device.</p>
              </div>
            </div>
          )}

          {error && (
            <div className="auth-banner error">
              <AlertCircle size={16} style={{ flexShrink: 0, marginTop: 1 }} />
              <div className="auth-banner-content">
                <span>{error}</span>
                {error.toLowerCase().includes('not confirmed') && (
                  <div className="auth-banner-actions">
                    <button
                      type="button"
                      className="auth-resend-btn"
                      disabled={resending || resendCooldown > 0}
                      onClick={async () => {
                        if (!email) {
                          setError('Please enter your email to resend verification.')
                          return
                        }
                        setResending(true)
                        setError('')
                        try {
                          await authService.resendConfirmationEmail(email)
                          setResendSent(true)
                          setResendCooldown(45)
                          setInfoMessage('Verification email sent.')
                        } catch {
                          setError("We couldn't send the verification email. Please try again.")
                        } finally {
                          setResending(false)
                        }
                      }}
                    >
                      {resending
                        ? 'Sending...'
                        : resendCooldown > 0
                        ? `Resend available in ${resendCooldown}s`
                        : 'Resend verification email'}
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}

          {infoMessage && (
            <div className="auth-banner success">
              <Check size={16} />
              <span>{infoMessage}</span>
            </div>
          )}

          <AnimatePresence mode="wait">
            {/* VIEW 1: LOGIN */}
            {mode === 'login' && (
              <motion.div
                key="login"
                className="auth-flow"
                variants={authStepVariants}
                initial="initial"
                animate="animate"
                exit="exit"
              >
                <div className="auth-head">
                  <h2>Welcome back</h2>
                  <p>Log in to synchronize your finances across Android and Windows.</p>
                </div>

                <form onSubmit={handleLogin} className="auth-form">
                  <label className="auth-label">
                    <span>Email</span>
                    <div className="auth-input-box">
                      <Mail size={16} />
                      <input
                        type="email"
                        autoComplete="email"
                        required
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="you@example.com"
                        disabled={loading}
                      />
                    </div>
                  </label>

                  <label className="auth-label">
                    <div className="auth-label-row">
                      <span>Password</span>
                      <button
                        type="button"
                        className="auth-link"
                        onClick={() => {
                          setError('')
                          setInfoMessage('')
                          setMode('forgot')
                        }}
                      >
                        Forgot password?
                      </button>
                    </div>
                    <div className="auth-input-box">
                      <Lock size={16} />
                      <input
                        type="password"
                        autoComplete="current-password"
                        required
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="••••••••"
                        disabled={loading}
                      />
                    </div>
                  </label>

                  <button
                    type="submit"
                    className="button primary auth-submit"
                    disabled={loading || !configured}
                  >
                    {loading ? (
                      <span className="auth-spinner" />
                    ) : (
                      <>
                        <span>Log In</span>
                        <ArrowRight size={17} />
                      </>
                    )}
                  </button>
                </form>

                <div className="auth-footer">
                  <p>
                    Don't have an account?{' '}
                    <button
                      type="button"
                      className="auth-link-bold"
                      onClick={() => {
                        setError('')
                        setInfoMessage('')
                        setMode('signup')
                      }}
                    >
                      Create account
                    </button>
                  </p>
                  {!configured && (
                    <button
                      type="button"
                      className="button ghost auth-offline-btn"
                      onClick={onContinueOffline}
                    >
                      <HardDrive size={15} />
                      <span>Continue in Local Mode</span>
                    </button>
                  )}
                </div>
              </motion.div>
            )}

            {/* VIEW 2: SIGN UP */}
            {mode === 'signup' && (
              <motion.div
                key="signup"
                className="auth-flow"
                variants={authStepVariants}
                initial="initial"
                animate="animate"
                exit="exit"
              >
                <div className="auth-head">
                  <h2>Create account</h2>
                  <p>Secure your personal financial story and access it anywhere.</p>
                </div>

                <form onSubmit={handleSignup} className="auth-form">
                  <label className="auth-label">
                    <span>Your Name</span>
                    <div className="auth-input-box">
                      <User size={16} />
                      <input
                        type="text"
                        autoComplete="name"
                        required
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder="Varun"
                        disabled={loading}
                      />
                    </div>
                  </label>

                  <label className="auth-label">
                    <span>Email</span>
                    <div className="auth-input-box">
                      <Mail size={16} />
                      <input
                        type="email"
                        autoComplete="email"
                        required
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="you@example.com"
                        disabled={loading}
                      />
                    </div>
                  </label>

                  <label className="auth-label">
                    <span>Password</span>
                    <div className="auth-input-box">
                      <Lock size={16} />
                      <input
                        type="password"
                        autoComplete="new-password"
                        required
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="At least 6 characters"
                        disabled={loading}
                      />
                    </div>
                  </label>

                  <label className="auth-label">
                    <span>Confirm Password</span>
                    <div className="auth-input-box">
                      <KeyRound size={16} />
                      <input
                        type="password"
                        autoComplete="new-password"
                        required
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        placeholder="Re-enter password"
                        disabled={loading}
                      />
                    </div>
                  </label>

                  <button
                    type="submit"
                    className="button primary auth-submit"
                    disabled={loading || !configured}
                  >
                    {loading ? (
                      <span className="auth-spinner" />
                    ) : (
                      <>
                        <span>Create Account</span>
                        <Sparkles size={16} />
                      </>
                    )}
                  </button>
                </form>

                <div className="auth-footer">
                  <p>
                    Already have an account?{' '}
                    <button
                      type="button"
                      className="auth-link-bold"
                      onClick={() => {
                        setError('')
                        setInfoMessage('')
                        setMode('login')
                      }}
                    >
                      Log in
                    </button>
                  </p>
                </div>
              </motion.div>
            )}

            {/* VIEW 3: FORGOT PASSWORD */}
            {mode === 'forgot' && (
              <motion.div
                key="forgot"
                className="auth-flow"
                variants={authStepVariants}
                initial="initial"
                animate="animate"
                exit="exit"
              >
                <div className="auth-head">
                  <h2>Reset password</h2>
                  <p>Enter your email and we'll send you a link to recover your account.</p>
                </div>

                <form onSubmit={handleForgotPassword} className="auth-form">
                  <label className="auth-label">
                    <span>Account Email</span>
                    <div className="auth-input-box">
                      <Mail size={16} />
                      <input
                        type="email"
                        autoComplete="email"
                        required
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="you@example.com"
                        disabled={loading}
                      />
                    </div>
                  </label>

                  <button
                    type="submit"
                    className="button primary auth-submit"
                    disabled={loading || !configured}
                  >
                    {loading ? (
                      <span className="auth-spinner" />
                    ) : (
                      <span>Send Reset Link</span>
                    )}
                  </button>
                </form>

                <div className="auth-footer">
                  <button
                    type="button"
                    className="auth-link"
                    onClick={() => {
                      setError('')
                      setInfoMessage('')
                      setMode('login')
                    }}
                  >
                    ← Back to Log In
                  </button>
                </div>
              </motion.div>
            )}

            {/* VIEW 4: RESET NEW PASSWORD */}
            {mode === 'reset_password' && (
              <motion.div
                key="reset_password"
                className="auth-flow"
                variants={authStepVariants}
                initial="initial"
                animate="animate"
                exit="exit"
              >
                <div className="auth-head">
                  <h2>Set new password</h2>
                  <p>Choose a secure new password for your THOGAI account.</p>
                </div>

                <form onSubmit={handleResetPassword} className="auth-form">
                  <label className="auth-label">
                    <span>New Password</span>
                    <div className="auth-input-box">
                      <Lock size={16} />
                      <input
                        type="password"
                        autoComplete="new-password"
                        required
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="At least 6 characters"
                        disabled={loading}
                      />
                    </div>
                  </label>

                  <label className="auth-label">
                    <span>Confirm New Password</span>
                    <div className="auth-input-box">
                      <KeyRound size={16} />
                      <input
                        type="password"
                        autoComplete="new-password"
                        required
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        placeholder="Re-enter password"
                        disabled={loading}
                      />
                    </div>
                  </label>

                  <button
                    type="submit"
                    className="button primary auth-submit"
                    disabled={loading || !configured}
                  >
                    {loading ? (
                      <span className="auth-spinner" />
                    ) : (
                      <span>Update Password</span>
                    )}
                  </button>
                </form>

                <div className="auth-footer">
                  <button
                    type="button"
                    className="auth-link"
                    onClick={() => {
                      setError('')
                      setInfoMessage('')
                      setMode('login')
                    }}
                  >
                    ← Back to Log In
                  </button>
                </div>
              </motion.div>
            )}

            {/* VIEW 5: CONFIRM EMAIL SCREEN */}
            {mode === 'confirm_email' && (
              <motion.div
                key="confirm_email"
                className="auth-flow"
                variants={authStepVariants}
                initial="initial"
                animate="animate"
                exit="exit"
              >
                <div style={{ textAlign: 'center', padding: '6px 0 14px' }}>
                  <div className="auth-confirm-circle">
                    <MailCheck size={36} />
                  </div>
                  <h2 style={{ font: '700 24px/1.2 var(--display)', margin: '14px 0 6px', letterSpacing: '-0.02em' }}>
                    Verify your email
                  </h2>
                  <p style={{ margin: '0 auto 10px', fontSize: 14, color: 'var(--text-2)', lineHeight: 1.5, maxWidth: 320 }}>
                    We've sent a verification link to your email address.
                  </p>
                  <div
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 8,
                      padding: '7px 14px',
                      borderRadius: 20,
                      background: 'var(--surface-soft)',
                      border: '1px solid var(--border)',
                      margin: '4px auto 14px',
                      fontSize: 13,
                      fontWeight: 600,
                      color: 'var(--text)'
                    }}
                  >
                    <Mail size={14} style={{ color: 'var(--accent)' }} />
                    <span>{email || 'your email'}</span>
                  </div>
                  <p style={{ margin: '0 auto 14px', fontSize: 12, color: 'var(--muted)', lineHeight: 1.45, maxWidth: 310 }}>
                    Please click the link in that email to activate your account and start using THOGAI across your devices.
                  </p>
                  <div className="auth-auto-confirm-pill">
                    <span className="auth-pulse-dot" />
                    <span>Waiting for verification — app opens automatically</span>
                  </div>
                </div>

                <div style={{ display: 'grid', gap: 10 }}>
                  <button
                    type="button"
                    className="button primary auth-submit"
                    disabled={loading}
                    onClick={handleManualVerifyCheck}
                  >
                    {loading ? (
                      <span className="auth-spinner" />
                    ) : (
                      <>
                        <span>I've verified my email →</span>
                      </>
                    )}
                  </button>

                  <button
                    type="button"
                    className="button ghost"
                    style={{ minHeight: 44, fontSize: 13 }}
                    disabled={resending || resendCooldown > 0}
                    onClick={async () => {
                      if (!email) {
                        setError('Please enter your email to resend verification.')
                        return
                      }
                      setResending(true)
                      setError('')
                      try {
                        await authService.resendConfirmationEmail(email)
                        setResendSent(true)
                        setResendCooldown(45)
                        setInfoMessage('Verification email sent.')
                      } catch {
                        setError("We couldn't send the verification email. Please try again.")
                      } finally {
                        setResending(false)
                      }
                    }}
                  >
                    <Send size={15} />
                    <span>
                      {resending
                        ? 'Sending...'
                        : resendCooldown > 0
                        ? `Resend available in ${resendCooldown}s`
                        : 'Resend verification email'}
                    </span>
                  </button>
                </div>

                <div className="auth-footer" style={{ marginTop: 20, display: 'flex', flexDirection: 'column', gap: 10, alignItems: 'center' }}>
                  <div style={{ display: 'flex', gap: 16, alignItems: 'center', fontSize: 13 }}>
                    <button
                      type="button"
                      className="auth-link"
                      onClick={() => {
                        setError('')
                        setInfoMessage('')
                        setMode('signup')
                      }}
                    >
                      Change email
                    </button>
                    <span style={{ color: 'var(--border)' }}>•</span>
                    <button
                      type="button"
                      className="auth-link"
                      onClick={() => {
                        setError('')
                        setInfoMessage('')
                        setMode('login')
                      }}
                    >
                      Back to Log In
                    </button>
                  </div>
                  <p style={{ margin: 0, fontSize: 11.5, color: 'var(--muted)', lineHeight: 1.4, textAlign: 'center' }}>
                    Can't find the email? Please check your spam or junk folder.
                  </p>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      </div>
    </div>
  )
}
