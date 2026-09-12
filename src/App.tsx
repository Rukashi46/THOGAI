import { useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import {
  ArrowDownLeft, ArrowUpRight, BarChart3, Bell, CalendarDays, Check, ChevronDown, ChevronRight,
  CircleDollarSign, ClipboardList, Download, Ellipsis, Eye, EyeOff, FileUp, Filter, Home, Leaf,
  Lock, MoreHorizontal, Pencil, PieChart, Plus, ReceiptText, Search, Settings2, ShieldCheck,
  ShoppingBag, SlidersHorizontal, Trash2, TrendingUp, Utensils, WalletCards, X, Bus, Landmark,
  RotateCcw, Fingerprint, Sparkles, Send, Bot, ShieldAlert, KeyRound, LockKeyhole, Delete, Cloud,
  CloudOff, RefreshCw, HardDrive, User, Fuel, Zap, Droplets, Wifi, Smartphone, Percent,
  HeartPulse, GraduationCap, Film, Plane, Users, Repeat, Smile, Cookie, Receipt, Briefcase,
  Laptop, Building2, Coins, Award, Gift, Handshake, PiggyBank, CreditCard
} from 'lucide-react'
import { categorySpend, currencies, formatMoney, groupByDate, labelDate, monthKey, newId, seedBudgets, snapshot, budgetState } from './lib/finance'
import {
  defaultAccounts, defaultCategories, defaultExpenseCategories, defaultIncomeCategories,
  defaultSettings, storage, type Budget, type FinanceData, type Settings, type ThemeId,
  type Transaction, type TransactionType
} from './services/storage'
import { security } from './services/security'
import { buildFinancialContext, generateLocalAiResponse, queryAiAdvisor, type FinancialContext, type ConversationTurn } from './services/ai'
import { SafeMarkdown } from './lib/markdown'
import { ThemedSelect } from './components/ThemedSelect'
import { ThemedDatePicker } from './components/ThemedDatePicker'
import { authService, type AuthUser } from './services/auth'
import { cloudSync, type SyncState } from './services/cloudSync'
import { idbStorage } from './services/idb'
import { isSupabaseConfigured } from './lib/supabase'
import { AuthScreen } from './components/AuthScreen'
import { pageVariants, desktopModalVariants, mobileSheetVariants, backdropVariants, buttonTap, primaryButtonTap, reducedMotionVariants, iosSpring, sheetSpring, snapSpring } from './lib/motion'

type Page = 'home'|'ledger'|'budget'|'stats'|'config'
type ModalState = { mode:'transaction'; draft?:Transaction; type?:TransactionType; category?:string } | { mode:'budget'; draft?:Budget } | { mode:'ai' } | { mode:'pin_setup'; nextAction?: 'appLock' | 'biometricLock' | 'changePin' } | { mode:'categories' } | { mode:'accounts' } | { mode:'migration' } | { mode:'privacy' } | { mode:'terms' } | null

interface ConfirmDialogState {
  title: string
  message: string
  confirmText?: string
  cancelText?: string
  danger?: boolean
  icon?: 'trash' | 'logout' | 'reset' | 'alert'
  onConfirm: () => void | Promise<void>
  onCancel?: () => void
}

const categories = defaultExpenseCategories

const categoryIcons: Record<string, typeof ReceiptText> = {
  // 23 Expense Categories
  'Food & Dining': Utensils,
  Groceries: ShoppingBag,
  Fuel: Fuel,
  Transport: Bus,
  Shopping: ShoppingBag,
  Rent: Home,
  Electricity: Zap,
  Water: Droplets,
  Internet: Wifi,
  'Mobile Recharge': Smartphone,
  EMI: Percent,
  Insurance: ShieldCheck,
  Medical: HeartPulse,
  Education: GraduationCap,
  Entertainment: Film,
  Travel: Plane,
  Investment: TrendingUp,
  Family: Users,
  Subscription: Repeat,
  'Personal Care': Smile,
  Miscellaneous: ReceiptText,
  Snacks: Cookie,
  'Food Bill': Receipt,

  // 11 Income Categories
  Salary: Briefcase,
  Freelance: Laptop,
  'Business Income': Building2,
  Refund: RotateCcw,
  Cashback: Coins,
  Bonus: Award,
  Gift: Gift,
  'Friend Repayment': Handshake,
  'Asset Sale': PiggyBank,
  Interest: TrendingUp,
  Other: Ellipsis,

  // Fallbacks
  Food: Utensils,
  Bills: ReceiptText,
  Health: HeartPulse
}

const accountIcons: Record<string, typeof WalletCards> = {
  Cash: CircleDollarSign,
  SBI: Landmark,
  HDFC: Landmark,
  ICICI: Landmark,
  Axis: Landmark,
  UPI: Sparkles,
  'Indian Bank': Landmark,
  Wallet: WalletCards,
  'Credit Card': CreditCard,
  'UPI / GPay': Sparkles,
  'Savings Account': Landmark
}

const nav = [
  { id: 'home', label: 'Home', icon: Home },
  { id: 'ledger', label: 'Ledger', icon: ClipboardList },
  { id: 'budget', label: 'Budget', icon: WalletCards },
  { id: 'stats', label: 'Stats', icon: BarChart3 },
  { id: 'config', label: 'Settings', icon: Settings2 }
] as const

function ConfirmModal({
  title,
  message,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  danger = false,
  icon,
  onConfirm,
  onCancel
}: ConfirmDialogState) {
  const reduced = useReducedMotion()
  const isMobile = typeof window !== 'undefined' && window.innerWidth <= 768
  const modalVariants = isMobile ? mobileSheetVariants : desktopModalVariants
  const cancelBtnRef = useRef<HTMLButtonElement>(null)
  const confirmBtnRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (danger) {
      cancelBtnRef.current?.focus()
    } else {
      confirmBtnRef.current?.focus()
    }
  }, [danger])

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onCancel?.()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onCancel])

  return (
    <motion.div
      className="modal-layer confirm-modal-layer"
      variants={backdropVariants}
      initial="initial"
      animate="animate"
      exit="exit"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onCancel?.()
      }}
    >
      <motion.div
        className="modal confirm-modal"
        variants={reduced ? reducedMotionVariants : modalVariants}
        initial="initial"
        animate="animate"
        exit="exit"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-modal-title"
        aria-describedby="confirm-modal-desc"
      >
        <div className="confirm-modal-header">
          <div className={`confirm-modal-icon ${danger ? 'danger' : 'accent'}`}>
            {icon === 'logout' ? (
              <User size={22} />
            ) : icon === 'trash' ? (
              <Trash2 size={22} />
            ) : icon === 'reset' ? (
              <RotateCcw size={22} />
            ) : danger ? (
              <ShieldAlert size={22} />
            ) : (
              <Leaf size={22} />
            )}
          </div>
          <IconButton label="Close dialog" onClick={onCancel}>
            <X size={18} />
          </IconButton>
        </div>

        <div className="confirm-modal-body">
          <h2 id="confirm-modal-title">{title}</h2>
          <p id="confirm-modal-desc">{message}</p>
        </div>

        <div className="confirm-modal-actions">
          <button
            ref={cancelBtnRef}
            type="button"
            className="button ghost"
            onClick={onCancel}
          >
            {cancelText}
          </button>
          <button
            ref={confirmBtnRef}
            type="button"
            className={`button ${danger ? 'danger' : 'primary'}`}
            onClick={onConfirm}
          >
            {confirmText}
          </button>
        </div>
      </motion.div>
    </motion.div>
  )
}
const navOrder: Page[] = ['home', 'ledger', 'budget', 'stats', 'config']
const themes: {id:ThemeId;name:string;copy:string}[] = [{id:'midnight',name:'Midnight Glass',copy:'Liquid glass'}, {id:'cream',name:'Cream Clay',copy:'Softly molded'}, {id:'amoled',name:'AMOLED Stealth',copy:'Pure black'}]
const today = () => new Date().toISOString().slice(0,10)
const safe = (n:number) => Number.isFinite(n) ? n : 0

function Brand({small=false}:{small?:boolean}) { return <div className="brand"><div className="brand-mark" aria-hidden="true"><i></i><i></i><i></i><b><Leaf size={11}/></b></div>{!small&&<div><strong>THOGAI</strong><span>Know your money.</span></div>}</div> }
function IconButton({children,label,onClick,active=false,className=''}:{children:React.ReactNode;label:string;onClick?:()=>void;active?:boolean;className?:string}) {return <motion.button whileTap={buttonTap} className={`icon-button ${active?'is-active':''} ${className}`} aria-label={label} title={label} onClick={onClick}>{children}</motion.button>}
function Progress({value,state='normal'}:{value:number;state?:string}) {return <div className="progress" aria-label={`${Math.round(value)}% used`}><motion.span className={`progress-fill ${state}`} initial={{width:0}} animate={{width:`${Math.min(100,Math.max(0,value))}%`}} transition={{duration:.55}}/></div>}
function Empty({onAction}:{onAction:(type:TransactionType| 'budget')=>void}) {return <section className="empty"><div className="empty-orbit"><TrendingUp size={30}/></div><h2>Your money story starts here.</h2><p>Set a foundation, then THOGAI will make every month easier to understand.</p><div className="empty-actions"><button className="button primary" onClick={()=>onAction('income')}><ArrowDownLeft size={17}/> Add income</button><button className="button ghost" onClick={()=>onAction('expense')}><Plus size={17}/> Add expense</button></div><button className="text-button" onClick={()=>onAction('budget')}>Set a monthly budget <ChevronRight size={15}/></button></section>}

function SyncPill({ state, onClick, lastSynced }: { state: SyncState; onClick: () => void; lastSynced?: Date | null }) {
  const label = state === 'syncing' ? 'Syncing...' : state === 'synced' ? 'Synced' : state === 'offline' ? 'Offline' : state === 'error' ? 'Sync issue' : 'Synced'
  const icon = state === 'syncing' ? <RefreshCw size={12} /> : state === 'offline' ? <CloudOff size={12} /> : state === 'error' ? <CloudOff size={12} /> : <Check size={12} />
  const timeStr = lastSynced ? ` · Last synced: ${lastSynced.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : ''
  return (
    <button
      type="button"
      className={`sync-pill ${state}`}
      onClick={onClick}
      title={`Sync status: ${label}${timeStr}. Tap to refresh.`}
      aria-label={`Sync status: ${label}`}
    >
      {icon}
      <span>{label}</span>
    </button>
  )
}

function App() {
  const [data,setData] = useState<FinanceData>(()=>storage.read())
  const [page,setPage] = useState<Page>('home')
  const [pageDirection, setPageDirection] = useState<number>(1)
  const [modal,setModal] = useState<ModalState>(null)
  const [toast,setToast] = useState('')
  const reduced = useReducedMotion()

  // Authentication & Cloud Sync States
  const [isRestoringSession, setIsRestoringSession] = useState(true)
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(null)
  const [showAuth, setShowAuth] = useState(false)
  const [authInitialMode, setAuthInitialMode] = useState<'login' | 'signup' | 'forgot' | 'reset_password'>('login')
  const [syncState, setSyncState] = useState<SyncState>('idle')
  const [lastSyncedAt, setLastSyncedAt] = useState<Date | null>(null)
  const [migrationTxCount, setMigrationTxCount] = useState<number>(0)

  const [isLocked, setIsLocked] = useState<boolean>(() => {
    const initialData = storage.read()
    const hasLock = !!(initialData.settings.appLock || initialData.settings.biometricLock)
    const wasUnlocked = sessionStorage.getItem('thogai_unlocked') === 'true'
    return hasLock && !wasUnlocked
  })

  // Theme synchronization (runs immediately before any render)
  useEffect(()=>{
    document.documentElement.dataset.theme=data.settings.theme;
    document.documentElement.style.colorScheme=['midnight','amoled'].includes(data.settings.theme)?'dark':'light';
    const metaThemeColor = document.querySelector('meta[name="theme-color"]');
    if (metaThemeColor) {
      metaThemeColor.setAttribute('content', data.settings.theme === 'cream' ? '#f4ecdc' : data.settings.theme === 'amoled' ? '#000000' : '#10231e');
    }
  },[data.settings.theme])

  // Session & Cloud Sync Lifecycle
  useEffect(() => {
    // 1. Sync State Subscription
    const unsubSync = cloudSync.subscribe((s, t) => {
      setSyncState(s)
      setLastSyncedAt(t)
    })

    // 2. Auth State Subscription
    const authSub = authService.onAuthStateChange(async (event, session, user) => {
      if (event === 'PASSWORD_RECOVERY') {
        setAuthInitialMode('reset_password')
        setShowAuth(true)
      } else if ((event === 'SIGNED_IN' || event === 'USER_UPDATED') && user) {
        if (typeof window !== 'undefined' && (window.location.hash || window.location.search.includes('code='))) {
          window.history.replaceState(null, '', window.location.pathname)
        }
        setCurrentUser(user)
        cloudSync.setUser(user)
        setShowAuth(false)
        const cached = await idbStorage.loadUserData(user.id) || storage.read()
        setData(cached)
        let fresh = await cloudSync.pull(user, cached)
        // Restore nickname from cloud user profile if local name is blank
        if (!fresh.settings.name && user.name) {
          fresh = { ...fresh, settings: { ...fresh.settings, name: user.name } }
        }
        setData(fresh)
        const count = await cloudSync.checkGuestDataForMigration(user.id)
        if (count > 0) setMigrationTxCount(count)
      } else if (event === 'SIGNED_OUT') {
        setCurrentUser(null)
        cloudSync.setUser(null)
        if (isSupabaseConfigured()) {
          setShowAuth(true)
        }
      }
    })

    // 3. App Startup & Session Restoration
    const initApp = async () => {
      try {
        const { user } = await authService.getSession()
        if (user) {
          setCurrentUser(user)
          cloudSync.setUser(user)
          const cached = await idbStorage.loadUserData(user.id)
          if (cached) setData(cached)
          let fresh = await cloudSync.pull(user, cached || storage.read())
          // Restore nickname from cloud user profile if local name is blank
          if (!fresh.settings.name && user.name) {
            fresh = { ...fresh, settings: { ...fresh.settings, name: user.name } }
          }
          setData(fresh)
          const count = await cloudSync.checkGuestDataForMigration(user.id)
          if (count > 0) setMigrationTxCount(count)
        } else {
          if (isSupabaseConfigured()) {
            setShowAuth(true)
          } else {
            // Local / Offline Mode: load guest IndexedDB
            const guestCached = await idbStorage.loadUserData(null)
            if (guestCached) setData(guestCached)
          }
        }
      } catch (err) {
        console.error('Session restoration error:', err)
      } finally {
        setIsRestoringSession(false)
      }
    }
    initApp()

    return () => {
      unsubSync()
      authSub.unsubscribe()
    }
  }, [])

  useEffect(()=>{if(!toast)return;const t=setTimeout(()=>setToast(''),2800);return()=>clearTimeout(t)},[toast]);

  const save = (next: FinanceData) => {
    setData(next)
    storage.write(next)
    idbStorage.saveUserData(currentUser ? currentUser.id : null, next)
  }

  const setSettings = (patch: Partial<Settings>) => {
    const updated = { ...data.settings, ...patch }
    const next = { ...data, settings: updated }
    save(next)
    cloudSync.syncSettings(updated, currentUser)
  }

  const changePage = (next: Page, dir?: number) => {
    if (next === page) return
    if (dir !== undefined) {
      setPageDirection(dir)
    } else {
      const curIdx = navOrder.indexOf(page)
      const nextIdx = navOrder.indexOf(next)
      setPageDirection(nextIdx >= curIdx ? 1 : -1)
    }
    setPage(next)
  }


  const open = (type: TransactionType = 'expense', category?: string, draft?: Transaction) =>
    setModal({ mode: 'transaction', type, category, draft })
  const openAi = () => setModal({ mode: 'ai' })
  const lockApp = () => {
    sessionStorage.removeItem('thogai_unlocked')
    setIsLocked(true)
    setToast('App locked')
  }

  const saveTransaction = (tx: Omit<Transaction, 'id' | 'createdAt' | 'updatedAt'>, id?: string) => {
    const now = new Date().toISOString()
    const isNew = !id
    const transaction: Transaction = {
      ...tx,
      id: id ?? newId(),
      createdAt: id ? data.transactions.find((x) => x.id === id)?.createdAt ?? now : now,
      updatedAt: now
    }
    const nextTransactions = id
      ? data.transactions.map((t) => (t.id === id ? transaction : t))
      : [transaction, ...data.transactions]

    const next = { ...data, transactions: nextTransactions }
    save(next)
    cloudSync.syncTransaction(isNew ? 'CREATE' : 'UPDATE', transaction, currentUser)
    setModal(null)
    setToast(id ? 'Transaction updated' : 'Transaction added')
  }

  const [confirmDialog, setConfirmDialog] = useState<ConfirmDialogState | null>(null)
  const askConfirm = (opts: Omit<ConfirmDialogState, 'onCancel'> & { onCancel?: () => void }) => {
    setConfirmDialog({
      ...opts,
      onConfirm: async () => {
        setConfirmDialog(null)
        await opts.onConfirm()
      },
      onCancel: () => {
        setConfirmDialog(null)
        opts.onCancel?.()
      }
    })
  }

  const deleteTransaction = (id: string) => {
    const tx = data.transactions.find((t) => t.id === id)
    if (!tx) return
    askConfirm({
      title: 'Delete transaction?',
      message: 'This transaction will be permanently removed from your ledger. This action cannot be undone.',
      confirmText: 'Delete',
      cancelText: 'Cancel',
      danger: true,
      icon: 'trash',
      onConfirm: () => {
        const next = { ...data, transactions: data.transactions.filter((t) => t.id !== id) }
        save(next)
        cloudSync.syncTransaction('DELETE', tx, currentUser)
        setToast('Transaction deleted')
      }
    })
  }

  const saveBudget = (category: string, limit: number, id?: string) => {
    const now = new Date().toISOString()
    const isNew = !id
    const b: Budget = {
      id: id ?? newId(),
      category,
      limit,
      period: 'monthly',
      createdAt: id ? data.budgets.find((x) => x.id === id)?.createdAt ?? now : now,
      updatedAt: now
    }
    const nextBudgets = id ? data.budgets.map((x) => (x.id === id ? b : x)) : [...data.budgets, b]
    const next = { ...data, budgets: nextBudgets }
    save(next)
    cloudSync.syncBudget(isNew ? 'CREATE' : 'UPDATE', b, currentUser)
    setModal(null)
    setToast(id ? 'Budget updated' : 'Budget added')
  }

  const handleManualSync = async () => {
    if (!currentUser) {
      if (isSupabaseConfigured()) {
        setShowAuth(true)
      } else {
        setToast('Your data is saved securely on this device.')
      }
      return
    }
    setToast('Syncing with cloud...')
    const fresh = await cloudSync.pull(currentUser, data)
    setData(fresh)
    setToast('Cloud synchronization complete')
  }

  const handleLogout = () => {
    askConfirm({
      title: 'Log out?',
      message: 'Your data is safely synced to your account. You can sign back in anytime to access it.',
      confirmText: 'Log Out',
      cancelText: 'Cancel',
      danger: true,
      icon: 'logout',
      onConfirm: async () => {
        try {
          await authService.signOut()
          setCurrentUser(null)
          cloudSync.setUser(null)
          setData(storage.read())
          setShowAuth(true)
          setToast('Logged out successfully')
        } catch {
          setToast("Couldn't log out right now. Please try again.")
        }
      }
    })
  }

  const handleImportGuestData = async () => {
    if (!currentUser) return
    try {
      const imported = await cloudSync.migrateGuestData(currentUser)
      setMigrationTxCount(0)
      setToast(`Imported ${imported} transactions to your cloud account`)
      const fresh = await cloudSync.pull(currentUser, data)
      setData(fresh)
    } catch {
      setToast('Failed to import data')
    }
  }

  const handleSkipMigration = async () => {
    if (currentUser) {
      await idbStorage.markDataMigrated(currentUser.id)
    }
    setMigrationTxCount(0)
  }

  // 1. Splash loading state (clean THOGAI brand experience)
  if (isRestoringSession) {
    return (
      <div className="thogai-splash">
        <div className="brand-mark" aria-hidden="true">
          <i /><i /><i />
          <b><Leaf size={14} /></b>
        </div>
        <div className="thogai-splash-title">THOGAI</div>
        <div className="thogai-splash-subtitle">Know your money.</div>
        <div className="thogai-splash-spinner" />
      </div>
    )
  }

  // 2. Auth Screen
  if (showAuth && isSupabaseConfigured()) {
    return (
      <AuthScreen
        currentTheme={data.settings.theme}
        onThemeChange={(t) => setSettings({ theme: t })}
        onSuccess={(user) => {
          setCurrentUser(user)
          cloudSync.setUser(user)
          setShowAuth(false)
          setToast(`Welcome back, ${user.name || 'User'}!`)
        }}
        onContinueOffline={() => {
          setShowAuth(false)
          setToast('Continuing in Local Mode')
        }}
        initialMode={authInitialMode}
      />
    )
  }

  const s = snapshot(data.transactions, data.settings)

  const syncLabel = !currentUser
    ? 'Stored securely on this device'
    : syncState === 'syncing'
    ? 'Syncing...'
    : syncState === 'offline'
    ? 'Offline'
    : syncState === 'error'
    ? 'Sync issue'
    : 'Cloud synced · Secure'

  const SyncIcon = !currentUser
    ? HardDrive
    : syncState === 'syncing'
    ? RefreshCw
    : syncState === 'offline' || syncState === 'error'
    ? CloudOff
    : ShieldCheck

  return (
    <div className="app-shell">
      <AnimatePresence>
        {isLocked && (
          <LockScreen
            settings={data.settings}
            onUnlock={() => {
              sessionStorage.setItem('thogai_unlocked', 'true')
              setIsLocked(false)
            }}
          />
        )}
      </AnimatePresence>

      <aside className="side-nav">
        <Brand />
        <nav>
          {nav.map((item) => {
            const I = item.icon
            return (
              <button
                key={item.id}
                onClick={() => changePage(item.id, 0)}
                className={page === item.id ? 'active' : ''}
              >
                <I size={19} />
                <span>{item.label}</span>
              </button>
            )
          })}
        </nav>
        <div className="side-note" title={currentUser ? `Sync status: ${syncLabel}` : 'Data is stored securely on this device'}>
          <SyncIcon size={17} className={syncState === 'syncing' ? 'spin' : ''} />
          <span>{syncLabel}</span>
        </div>
      </aside>

      <main>
        <header className="topbar">
          <Brand small />
          <div className="desktop-title">{nav.find((x) => x.id === page)?.label}</div>
          <div className="top-actions">
            <SyncPill state={syncState} onClick={handleManualSync} lastSynced={lastSyncedAt} />
            <IconButton label="Add transaction" onClick={() => open()}>
              <Plus size={19} />
            </IconButton>
            <motion.button
              whileTap={buttonTap}
              className="ai-topbar-btn"
              onClick={openAi}
              aria-label="AI Advisor"
              title="AI Advisor"
            >
              <Sparkles size={16} />
              <span>AI</span>
            </motion.button>
            {(data.settings.appLock || data.settings.biometricLock) && (
              <IconButton label="Lock App" onClick={lockApp}>
                <LockKeyhole size={19} />
              </IconButton>
            )}
            <IconButton label="Notifications">
              <Bell size={19} />
            </IconButton>
            <IconButton label="Open settings" onClick={() => changePage('config', 1)} className="mobile-hide">
              <Settings2 size={19} />
            </IconButton>
          </div>
        </header>

        <AnimatePresence mode="popLayout" custom={pageDirection}>
          <motion.div
            key={page}
            custom={pageDirection}
            variants={reduced ? reducedMotionVariants : pageVariants}
            initial="initial"
            animate="animate"
            exit="exit"
            className="page"
          >
            {page === 'home' && (
              <HomePage
                data={data}
                snapshot={s}
                setPage={changePage}
                open={open}
                openAi={openAi}
                setSettings={setSettings}
              />
            )}
            {page === 'ledger' && (
              <Ledger
                transactions={data.transactions}
                currency={data.settings.currency}
                categories={data.settings.categories || defaultExpenseCategories}
                open={open}
                remove={deleteTransaction}
              />
            )}
            {page === 'budget' && (
              <BudgetPage
                data={data}
                setModal={setModal}
                save={save}
                toast={setToast}
                askConfirm={askConfirm}
              />
            )}
            {page === 'stats' && <StatsPage data={data} />}
            {page === 'config' && (
              <ConfigPage
                data={data}
                setSettings={setSettings}
                save={save}
                toast={setToast}
                setModal={setModal}
                setIsLocked={setIsLocked}
                currentUser={currentUser}
                syncState={syncState}
                lastSyncedAt={lastSyncedAt}
                onManualSync={handleManualSync}
                onLogout={handleLogout}
                onShowAuth={() => setShowAuth(true)}
                askConfirm={askConfirm}
              />
            )}
          </motion.div>
        </AnimatePresence>
      </main>

      <nav className="bottom-nav">
        {nav.map((item) => {
          const I = item.icon
          const isActive = page === item.id
          return (
            <motion.button
              key={item.id}
              whileTap={buttonTap}
              onClick={() => changePage(item.id, 0)}
              className={isActive ? 'active' : ''}
            >
              <I size={20} />
              <span>{item.label}</span>
            </motion.button>
          )
        })}
      </nav>

      <motion.button
        whileTap={{ scale: 0.88, transition: { type: 'spring', stiffness: 560, damping: 28 } }}
        whileHover={{ scale: 1.07, transition: { type: 'spring', stiffness: 400, damping: 28 } }}
        className="floating-add"
        onClick={() => open()}
        aria-label="Add transaction"
      >
        <Plus size={24} />
      </motion.button>

      <AnimatePresence>
        {modal?.mode === 'transaction' && (
          <TransactionModal
            initial={modal.draft}
            type={modal.type}
            category={modal.category}
            currency={data.settings.currency}
            categories={data.settings.categories || defaultExpenseCategories}
            incomeCategories={data.settings.incomeCategories || defaultIncomeCategories}
            accounts={data.settings.accounts || defaultAccounts}
            defaultAccount={data.settings.defaultAccount || 'Cash'}
            close={() => setModal(null)}
            submit={saveTransaction}
          />
        )}
        {modal?.mode === 'budget' && (
          <BudgetModal
            initial={modal.draft}
            currency={data.settings.currency}
            categories={data.settings.categories || defaultExpenseCategories}
            close={() => setModal(null)}
            submit={saveBudget}
          />
        )}
        {modal?.mode === 'ai' && <AiModal data={data} close={() => setModal(null)} />}
        {modal?.mode === 'pin_setup' && (
          <PinSetupModal
            close={() => setModal(null)}
            onSave={(pin) => {
              setSettings({ appLock: true, appLockPin: security.hashPin(pin) })
              setModal(null)
              setToast(modal.nextAction === 'changePin' ? 'PIN updated' : 'App Lock PIN configured')
            }}
          />
        )}
        {modal?.mode === 'categories' && (
          <CategoriesModal
            categories={data.settings.categories || defaultExpenseCategories}
            incomeCategories={data.settings.incomeCategories || defaultIncomeCategories}
            defaultCategory={data.settings.defaultCategory}
            onUpdateExpense={(cats, def) => {
              const patch: Partial<Settings> = { categories: cats }
              if (def) patch.defaultCategory = def
              setSettings(patch)
            }}
            onUpdateIncome={(cats) => {
              setSettings({ incomeCategories: cats })
            }}
            toast={setToast}
            askConfirm={askConfirm}
            close={() => setModal(null)}
          />
        )}
        {modal?.mode === 'accounts' && (
          <AccountsModal
            accounts={data.settings.accounts || defaultAccounts}
            defaultAccount={data.settings.defaultAccount || 'Cash'}
            onUpdate={(accs, def) => {
              const patch: Partial<Settings> = { accounts: accs }
              if (def) patch.defaultAccount = def
              setSettings(patch)
            }}
            toast={setToast}
            askConfirm={askConfirm}
            close={() => setModal(null)}
          />
        )}
        {modal?.mode === 'privacy' && <PrivacyModal close={() => setModal(null)} />}
        {modal?.mode === 'terms' && <TermsModal close={() => setModal(null)} />}
        {migrationTxCount > 0 && (
          <MigrationModal
            count={migrationTxCount}
            onImport={handleImportGuestData}
            onSkip={handleSkipMigration}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {confirmDialog && <ConfirmModal {...confirmDialog} />}
      </AnimatePresence>

      <AnimatePresence>
        {toast && (
          <motion.div
            className="toast"
            initial={{ opacity: 0, y: 18, scale: 0.92 }}
            animate={{ opacity: 1, y: 0, scale: 1, transition: { type: 'spring', stiffness: 480, damping: 32, mass: 0.7 } }}
            exit={{ opacity: 0, y: 14, scale: 0.94, transition: { duration: 0.18, ease: [0.4, 0, 0.6, 1] } }}
          >
            <Check size={16} />
            {toast}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

function HomePage({data,snapshot:s,setPage,open,openAi,setSettings}:{data:FinanceData;snapshot:ReturnType<typeof snapshot>;setPage:(p:Page,dir?:number)=>void;open:(t?:TransactionType,c?:string)=>void;openAi:()=>void;setSettings:(p:Partial<Settings>)=>void}) { const h=new Date().getHours(); const greeting=h<12?'Good morning':h<18?'Good afternoon':'Good evening'; const f=(n:number)=>formatMoney(n,data.settings.currency); const has=data.transactions.length>0||data.settings.monthlyBudget>0; const recent=[...data.transactions].sort((a,b)=>b.date.localeCompare(a.date)).slice(0,4); const state=budgetState(s.expenses,s.budget); const insight=s.budget? s.expenses>s.budget?'Your spending is over your monthly budget.':s.budgetRemaining>0?`You have ${f(s.budgetRemaining)} left in this month’s budget.`:'You have reached this month’s budget.':s.expenses?'Every expense is now part of your financial picture.':'Add your first transaction to see an honest overview.'; return <>{!has?<Empty onAction={(x)=>x==='budget'?setPage('budget',1):open(x)}/>:<div className="home-layout"><section className="hero-area"><div className="greeting"><p>{greeting}{data.settings.name?`, ${data.settings.name}`:''}</p><h1>Let’s make today count.</h1></div><div className="insight insight-clickable" onClick={openAi} role="button" tabIndex={0} title="Tap to ask THOGAI AI"><div className="insight-icon"><TrendingUp size={18}/></div><p>{insight}</p><span className="ai-badge"><Sparkles size={11}/> Ask AI</span></div><motion.section className="balance-card" initial={{opacity:0,scale:.98}} animate={{opacity:1,scale:1}}><div className="balance-top"><span>Remaining balance</span><IconButton label={data.settings.hideBalance?'Show balance':'Hide balance'} onClick={()=>setSettings({hideBalance:!data.settings.hideBalance})}>{data.settings.hideBalance?<EyeOff size={18}/>:<Eye size={18}/>}</IconButton></div><h2>{data.settings.hideBalance?'••••••':f(s.balance)}</h2><div className="balance-foot"><span><span className="dot"></span>Available this month</span><span>{s.income?`${Math.round((s.balance/s.income)*100)}% retained`:''}</span></div></motion.section></section><section className="summary-grid"><Metric label="Income" value={f(s.income)} detail="Money in" icon={<ArrowDownLeft size={18}/>} tone="positive"/><Metric label="Expenses" value={f(s.expenses)} detail="Money spent" icon={<ArrowUpRight size={18}/>} tone="negative"/><Metric label="Previous dues" value={f(s.dues)} detail="Separate from expenses" icon={<Landmark size={18}/>} tone="neutral"/><Metric label="Paid out" value={f(s.paidOut)} detail="Expenses + dues" icon={<CircleDollarSign size={18}/>} tone="neutral"/></section><section className="section-block budget-overview"><div className="section-title"><div><p className="eyebrow">Monthly plan</p><h2>Budget overview</h2></div><button className="text-button" onClick={()=>setPage('budget',1)}>Manage <ChevronRight size={15}/></button></div>{s.budget?<><div className="budget-main"><div><strong>{f(s.expenses)} <span>of {f(s.budget)}</span></strong><p>{f(s.budgetRemaining)} remaining</p></div><b className={`percentage ${state}`}>{Math.round(s.budgetUsed)}% used</b></div><Progress value={s.budgetUsed} state={state}/></>:<div className="inline-empty"><p>Give every rupee a job with a monthly budget.</p><button className="button compact" onClick={()=>setPage('budget',1)}>Set budget</button></div>}</section><section className="section-block"><div className="section-title"><div><p className="eyebrow">Spend smarter</p><h2>Quick expense</h2></div><span className="muted">One tap to start</span></div><div className="quick-grid">{['Food & Dining','Groceries','Transport','Fuel','Snacks'].map(c=>{const I=categoryIcons[c]??ReceiptText;return <button key={c} onClick={()=>open('expense',c)}><span><I size={20}/></span>{c}</button>})}</div></section><section className="section-block recent"><div className="section-title"><div><p className="eyebrow">Your activity</p><h2>Recent transactions</h2></div><button className="text-button" onClick={()=>setPage('ledger',1)}>See all <ChevronRight size={15}/></button></div>{recent.length?<div className="transactions mini">{recent.map(t=><TransactionRow key={t.id} tx={t} currency={data.settings.currency}/>)}</div>:<p className="muted pad">No transactions yet.</p>}</section></div>}</> }
function Metric({label,value,detail,icon,tone}:{label:string;value:string;detail:string;icon:React.ReactNode;tone:string}) {return <div className="metric"><span className={`metric-icon ${tone}`}>{icon}</span><div><p>{label}</p><strong>{value}</strong><small>{detail}</small></div></div>}

function Ledger({transactions,currency,categories:cats,open,remove}:{transactions:Transaction[];currency:string;categories:string[];open:(t?:TransactionType,c?:string,d?:Transaction)=>void;remove:(id:string)=>void}) {const [query,setQuery]=useState('');const [type,setType]=useState<'all'|TransactionType>('all');const [month,setMonth]=useState('all');const [category,setCategory]=useState('all');const filtered=useMemo(()=>transactions.filter(t=>(type==='all'||t.type===type)&&(month==='all'||t.date.slice(0,7)===month)&&(category==='all'||t.category===category)&&(`${t.category} ${t.account||''} ${t.description} ${t.notes}`.toLowerCase().includes(query.toLowerCase()))).sort((a,b)=>b.date.localeCompare(a.date)),[transactions,query,type,month,category]);const groups=groupByDate(filtered);const months=[...new Set(transactions.map(t=>t.date.slice(0,7)))];return <div className="ledger-page"><div className="page-heading"><div><p className="eyebrow">Money movement</p><h1>Ledger</h1><p>Every inflow, expense and outstanding due.</p></div><button className="button primary desktop-add" onClick={()=>open()}><Plus size={17}/> Add transaction</button></div><div className="ledger-tools"><label className="search"><Search size={18}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search ledger by text, note or account"/></label><div className="filters"><ThemedSelect ariaLabel="Transaction type" value={type} onChange={v=>setType(v as typeof type)} options={[{value:'all',label:'All types'},{value:'income',label:'Income',icon:<ArrowDownLeft size={14}/>},{value:'expense',label:'Expenses',icon:<ArrowUpRight size={14}/>},{value:'due',label:'Dues',icon:<Landmark size={14}/>}]} compact/><ThemedSelect ariaLabel="Category filter" value={category} onChange={v=>setCategory(v)} options={[{value:'all',label:'All categories'},...cats.map(c=>{const I=categoryIcons[c]||ReceiptText;return {value:c,label:c,icon:<I size={14}/>}})]} compact searchable searchPlaceholder="Filter category..."/><ThemedSelect ariaLabel="Date filter" value={month} onChange={v=>setMonth(v)} options={[{value:'all',label:'All dates'},...months.map(m=>({value:m,label:new Date(`${m}-01T12:00:00`).toLocaleDateString(undefined,{month:'long',year:'numeric'})}))]} compact/></div></div>{filtered.length?<div className="ledger-list">{Object.entries(groups).map(([date,items])=><section key={date}><h3>{labelDate(date)}</h3><div className="transactions">{items.map(t=><TransactionRow key={t.id} tx={t} currency={currency} actions={<><IconButton label="Edit transaction" onClick={()=>open(t.type,t.category,t)}><Pencil size={16}/></IconButton><IconButton label="Delete transaction" onClick={()=>remove(t.id)}><Trash2 size={16}/></IconButton></>}/>)}</div></section>)}</div>:<div className="no-results"><Filter size={24}/><h2>No matching entries</h2><p>Try changing your filters or add a new transaction.</p></div>}</div>}
function TransactionRow({tx,currency,actions}:{tx:Transaction;currency:string;actions?:React.ReactNode}) {const I=tx.type==='income'?ArrowDownLeft:tx.type==='due'?Landmark:categoryIcons[tx.category]??ReceiptText;return <article className="transaction"><span className={`transaction-icon ${tx.type}`}><I size={18}/></span><div className="transaction-main"><strong>{tx.description||tx.category}</strong><span>{tx.category}{tx.account?` · ${tx.account}`:''}{tx.recurring?' · Recurring':''}{tx.notes?` · ${tx.notes}`:''}</span></div><div className={`transaction-value ${tx.type}`}><strong>{tx.type==='income'?'+':'−'} {formatMoney(tx.amount,currency)}</strong><span>{tx.type==='due'?'Due paid':tx.type}</span></div>{actions&&<div className="row-actions">{actions}</div>}</article>}

function BudgetPage({
  data,
  setModal,
  save,
  toast,
  askConfirm
}: {
  data: FinanceData
  setModal: (m: ModalState) => void
  save: (d: FinanceData) => void
  toast?: (s: string) => void
  askConfirm: (opts: Omit<ConfirmDialogState, 'onCancel'> & { onCancel?: () => void }) => void
}) {
  const f = (n: number) => formatMoney(n, data.settings.currency)
  const budgets = data.budgets
  const totalSpent = snapshot(data.transactions, data.settings).expenses
  const setOverall = (raw: string) => {
    const amount = Math.max(0, Number(raw) || 0)
    save({ ...data, settings: { ...data.settings, monthlyBudget: amount } })
  }
  const remove = (id: string, category: string) => {
    askConfirm({
      title: 'Delete category budget?',
      message: `Are you sure you want to remove the monthly target for "${category}"? Transactions will not be deleted.`,
      confirmText: 'Delete',
      cancelText: 'Cancel',
      danger: true,
      icon: 'trash',
      onConfirm: () => {
        save({ ...data, budgets: data.budgets.filter((b) => b.id !== id) })
        toast?.('Category budget deleted')
      }
    })
  }
  const reset = () => {
    askConfirm({
      title: 'Reset all category budgets?',
      message: 'This will remove all category spending targets. Your transactions will not be affected.',
      confirmText: 'Reset all',
      cancelText: 'Cancel',
      danger: true,
      icon: 'reset',
      onConfirm: () => {
        save({ ...data, budgets: [] })
        toast?.('All category budgets reset')
      }
    })
  }
  return (
    <div className="budget-page">
      <div className="page-heading">
        <div>
          <p className="eyebrow">Plan with intent</p>
          <h1>Budget</h1>
          <p>Set limits and see how every category is doing.</p>
        </div>
        <button className="button primary desktop-add" onClick={() => setModal({ mode: 'budget' })}>
          <Plus size={17} /> Add category
        </button>
      </div>
      <section className="overall-budget">
        <div>
          <span className="eyebrow">Monthly overall budget</span>
          <h2>{f(data.settings.monthlyBudget)}</h2>
          <p>{f(totalSpent)} spent this month</p>
        </div>
        <label>
          <span>Set monthly limit</span>
          <input
            type="number"
            min="0"
            inputMode="decimal"
            value={data.settings.monthlyBudget || ''}
            onChange={(e) => setOverall(e.target.value)}
            placeholder="0"
          />
        </label>
      </section>
      <section className="section-block category-budget">
        <div className="section-title">
          <div>
            <p className="eyebrow">By category</p>
            <h2>Category budgets</h2>
          </div>
          {budgets.length > 0 && (
            <button className="text-button danger-text" onClick={reset}>
              <RotateCcw size={14} /> Reset
            </button>
          )}
        </div>
        {budgets.length ? (
          <div className="budget-list">
            {budgets.map((b) => {
              const spent = categorySpend(data.transactions, b.category)
              const pct = b.limit ? (spent / b.limit) * 100 : 0
              const state = budgetState(spent, b.limit)
              const I = categoryIcons[b.category] ?? ReceiptText
              return (
                <article className="budget-item" key={b.id}>
                  <span className="budget-icon">
                    <I size={18} />
                  </span>
                  <div className="budget-content">
                    <div>
                      <strong>{b.category}</strong>
                      <span className={state}>{f(Math.max(0, b.limit - spent))} remaining</span>
                    </div>
                    <p>
                      {f(spent)} <span>/ {f(b.limit)}</span>
                      <b className={state}>{Math.round(pct)}%</b>
                    </p>
                    <Progress value={pct} state={state} />
                  </div>
                  <div className="budget-actions">
                    <IconButton
                      label={`Edit ${b.category} budget`}
                      onClick={() => setModal({ mode: 'budget', draft: b })}
                    >
                      <Pencil size={16} />
                    </IconButton>
                    <IconButton
                      label={`Delete ${b.category} budget`}
                      onClick={() => remove(b.id, b.category)}
                    >
                      <Trash2 size={16} />
                    </IconButton>
                  </div>
                </article>
              )
            })}
          </div>
        ) : (
          <div className="inline-empty tall">
            <WalletCards size={24} />
            <p>Set limits for the places you spend most.</p>
            <button className="button compact" onClick={() => setModal({ mode: 'budget' })}>
              Add a category budget
            </button>
            {!data.transactions.length && (
              <button
                className="text-button"
                onClick={() =>
                  save({
                    ...data,
                    budgets: seedBudgets(['Food & Dining', 'Groceries', 'Transport', 'Shopping'])
                  })
                }
              >
                Use suggested categories
              </button>
            )}
          </div>
        )}
      </section>
    </div>
  )
}

function StatsPage({ data }: { data: FinanceData }) {
  const f = (n: number) => formatMoney(n, data.settings.currency)
  const [selected, setSelected] = useState(monthKey())

  // Last 6 months array (oldest first)
  const months = Array.from({ length: 6 }, (_, i) => {
    const d = new Date()
    d.setDate(1)
    d.setMonth(d.getMonth() - 5 + i)
    return monthKey(d)
  })

  // Human-readable month label: "Sep 2026"
  const monthLabel = (key: string) =>
    new Date(key + '-01T12:00:00').toLocaleDateString(undefined, { month: 'short', year: 'numeric' })

  // Per-month stats — independent of startingBalance
  const monthStats = (key: string) => {
    const income = data.transactions
      .filter(t => t.type === 'income' && t.date.slice(0, 7) === key)
      .reduce((n, t) => n + t.amount, 0)
    const expenses = data.transactions
      .filter(t => t.type === 'expense' && t.date.slice(0, 7) === key)
      .reduce((n, t) => n + t.amount, 0)
    const dues = data.transactions
      .filter(t => t.type === 'due' && t.date.slice(0, 7) === key)
      .reduce((n, t) => n + t.amount, 0)
    const hasData = data.transactions.some(t => t.date.slice(0, 7) === key)
    return { income, expenses, dues, net: income - expenses - dues, hasData }
  }

  const sel = monthStats(selected)
  const budgetForSelected = data.settings.monthlyBudget
  const budgetUsedPct = budgetForSelected > 0 ? Math.min(100, sel.expenses / budgetForSelected * 100) : 0
  const budgetRemaining = budgetForSelected > 0 ? Math.max(0, budgetForSelected - sel.expenses) : 0

  // Category spending for selected month, sorted highest→lowest
  const cats = data.settings.categories || categories
  const spending = cats
    .map(c => ({ name: c, value: categorySpend(data.transactions, c, selected) }))
    .filter(x => x.value > 0)
    .sort((a, b) => b.value - a.value)
  const totalExpenseForPct = spending.reduce((n, x) => n + x.value, 0)

  // Bar chart: max across all 6 months expenses
  const monthExpenses = months.map(m => monthStats(m).expenses)
  const barMax = Math.max(...monthExpenses, 1)

  return (
    <div className="stats-page">
      <div className="page-heading">
        <div>
          <p className="eyebrow">Make it visible</p>
          <h1>Stats</h1>
          <p>Patterns that help you make calmer decisions.</p>
        </div>
        <div style={{ minWidth: 160 }}>
          <ThemedSelect
            ariaLabel="Select month"
            value={selected}
            onChange={v => setSelected(v)}
            options={months.map(m => ({ value: m, label: monthLabel(m), icon: <CalendarDays size={14} /> }))}
            compact
          />
        </div>
      </div>

      <section className="stats-summary">
        <Metric label="Income" value={f(sel.income)} detail={monthLabel(selected)} icon={<ArrowDownLeft size={18} />} tone="positive" />
        <Metric label="Expenses" value={f(sel.expenses)} detail={monthLabel(selected)} icon={<ArrowUpRight size={18} />} tone="negative" />
        <Metric
          label="Net"
          value={sel.net >= 0 ? `+${f(sel.net)}` : f(sel.net)}
          detail="Income minus expenses"
          icon={<WalletCards size={18} />}
          tone={sel.net >= 0 ? 'positive' : 'negative'}
        />
      </section>

      <div className="chart-grid">
        {/* Income vs Expense */}
        <section className="chart-card">
          <div className="chart-head">
            <div>
              <p className="eyebrow">Income vs expense</p>
              <h2>{monthLabel(selected)}</h2>
            </div>
            <BarChart3 size={20} />
          </div>
          <div className="compare-bars">
            <Bar label="Income" value={sel.income} max={Math.max(sel.income, sel.expenses, 1)} tone="positive" />
            <Bar label="Expenses" value={sel.expenses} max={Math.max(sel.income, sel.expenses, 1)} tone="negative" />
            <div className="compare-row" style={{ marginTop: 4, opacity: 0.75 }}>
              <span>Net</span>
              <div className="compare-track" style={{ background: 'transparent' }} />
              <b style={{ color: sel.net >= 0 ? 'var(--positive)' : 'var(--negative)' }}>
                {sel.net >= 0 ? '+' : ''}{f(sel.net)}
              </b>
            </div>
          </div>
        </section>

        {/* Budget utilization — uses selected month's expenses */}
        <section className="chart-card">
          <div className="chart-head">
            <div>
              <p className="eyebrow">Budget utilization</p>
              <h2>{monthLabel(selected)}</h2>
            </div>
            <PieChart size={20} />
          </div>
          {budgetForSelected > 0 ? (
            <div className="donut-wrap">
              <div
                className="donut"
                style={{ '--percent': `${budgetUsedPct}%` } as React.CSSProperties}
              >
                <div>
                  <b>{Math.round(budgetUsedPct)}%</b>
                  <span>used</span>
                </div>
              </div>
              <div>
                <strong>{f(budgetRemaining)}</strong>
                <p>still available</p>
              </div>
            </div>
          ) : (
            <div className="chart-empty">Set a monthly budget in Settings to track progress.</div>
          )}
        </section>

        {/* Last 6 months bar chart */}
        <section className="chart-card wide">
          <div className="chart-head">
            <div>
              <p className="eyebrow">Spending pattern</p>
              <h2>Last 6 months</h2>
            </div>
            <span className="muted">Expense total</span>
          </div>
          <div className="monthly-bars">
            {months.map(m => {
              const ms = monthStats(m)
              const heightPct = ms.hasData ? ms.expenses / barMax * 100 : 0
              const isSelected = m === selected
              return (
                <div
                  key={m}
                  style={{ cursor: 'pointer', opacity: isSelected ? 1 : 0.75 }}
                  onClick={() => setSelected(m)}
                  title={ms.hasData ? `${monthLabel(m)}: ${f(ms.expenses)}` : `${monthLabel(m)}: No data`}
                >
                  <div
                    className="bar-track"
                    style={isSelected ? { outline: '2px solid var(--accent)', outlineOffset: 2, borderRadius: 7 } : {}}
                  >
                    {ms.hasData ? (
                      <motion.span
                        initial={{ height: 0 }}
                        animate={{ height: `${heightPct}%` }}
                        transition={{ duration: 0.5, ease: [0.34, 1.04, 0.64, 1] }}
                        style={isSelected ? { background: 'var(--accent)' } : {}}
                      />
                    ) : null}
                  </div>
                  <small style={isSelected ? { color: 'var(--accent)', fontWeight: 700 } : {}}>
                    {new Date(m + '-01T12:00:00').toLocaleDateString(undefined, { month: 'short' })}
                  </small>
                </div>
              )
            })}
          </div>
        </section>

        {/* Category spending */}
        <section className="chart-card wide">
          <div className="chart-head">
            <div>
              <p className="eyebrow">Where it went</p>
              <h2>Category spending</h2>
            </div>
          </div>
          {spending.length > 0 ? (
            <div className="category-chart">
              {spending.map((x, i) => {
                const pct = totalExpenseForPct > 0 ? (x.value / totalExpenseForPct * 100).toFixed(1) : '0'
                return (
                  <div key={x.name}>
                    <div>
                      <span>
                        <i style={{ background: `var(--chart-${i % 5})` }} />
                        {x.name}
                      </span>
                      <b>
                        {f(x.value)}
                        {totalExpenseForPct > 0 && (
                          <span style={{ fontWeight: 400, color: 'var(--muted)', marginLeft: 5, fontSize: 11 }}>
                            · {pct}%
                          </span>
                        )}
                      </b>
                    </div>
                    <Progress value={x.value / Math.max(...spending.map(s => s.value)) * 100} state="normal" />
                  </div>
                )
              })}
            </div>
          ) : (
            <div className="chart-empty">
              {sel.hasData ? 'No expense categories found for this month.' : 'No transactions in this month.'}
            </div>
          )}
        </section>
      </div>
    </div>
  )
}
function Bar({label,value,max,tone}:{label:string;value:number;max:number;tone:string}){return <div className="compare-row"><span>{label}</span><div className="compare-track"><motion.i className={tone} initial={{width:0}} animate={{width:`${value/max*100}%`}}/></div><b>{value?formatMoney(value):'—'}</b></div>}

function ConfigPage({
  data,
  setSettings,
  save,
  toast,
  setModal,
  setIsLocked,
  currentUser,
  syncState,
  lastSyncedAt,
  onManualSync,
  onLogout,
  onShowAuth,
  askConfirm
}: {
  data: FinanceData
  setSettings: (p: Partial<Settings>) => void
  save: (d: FinanceData) => void
  toast: (s: string) => void
  setModal: (m: ModalState) => void
  setIsLocked: (b: boolean) => void
  currentUser: AuthUser | null
  syncState: SyncState
  lastSyncedAt?: Date | null
  onManualSync: () => void
  onLogout: () => void
  onShowAuth: () => void
  askConfirm: (opts: Omit<ConfirmDialogState, 'onCancel'> & { onCancel?: () => void }) => void
}) {
  const input=useRef<HTMLInputElement>(null);
  const activeExpenseCategories = data.settings.categories || defaultExpenseCategories;
  const activeIncomeCategories = data.settings.incomeCategories || defaultIncomeCategories;
  const activeAccounts = data.settings.accounts || defaultAccounts;

  const exportData=()=>{const blob=new Blob([storage.export(data)],{type:'application/json'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=`thogai-backup-${today()}.json`;a.click();URL.revokeObjectURL(a.href);toast('Your data was exported')};
  const importData=(file?:File)=>{if(!file)return;const reader=new FileReader();reader.onload=()=>{try{save(storage.import(String(reader.result)));toast('Backup imported successfully')}catch(e){toast(e instanceof Error?e.message:'Import failed')}};reader.readAsText(file)};
  const clear = () => {
    askConfirm({
      title: 'Clear all local data?',
      message: 'This will permanently remove all transactions, budgets, and settings from this device. This action cannot be undone.',
      confirmText: 'Clear data',
      cancelText: 'Cancel',
      danger: true,
      icon: 'trash',
      onConfirm: () => {
        storage.clear()
        save({ transactions: [], budgets: [], settings: defaultSettings })
        toast('All local data cleared')
      }
    })
  }
  const setDefaultAcc=(acc:string)=>{setSettings({defaultAccount:acc});toast(`Default account set to ${acc}`)};

  return (
    <div className="config-page">
      <div className="page-heading">
        <div>
          <p className="eyebrow">MAKE IT YOURS</p>
          <h1>Settings</h1>
          <p>Preferences, accounts, categories, privacy and AI controls.</p>
        </div>
      </div>

      <ConfigSection title="Account & Cloud Sync">
        {currentUser ? (
          <div className="account-card">
            <div className="account-card-header">
              <div className="account-avatar">
                {currentUser.name ? currentUser.name.charAt(0).toUpperCase() : <User size={20} />}
              </div>
              <div className="account-details">
                <strong>{currentUser.name || 'THOGAI User'}</strong>
                <span>{currentUser.email}</span>
              </div>
              <SyncPill state={syncState} onClick={onManualSync} lastSynced={lastSyncedAt} />
            </div>

            <div className="account-sync-details">
              <span>Sync status</span>
              <strong>
                {syncState === 'syncing'
                  ? 'Syncing...'
                  : syncState === 'synced'
                  ? 'Synced'
                  : syncState === 'offline'
                  ? 'Offline'
                  : syncState === 'error'
                  ? 'Sync issue'
                  : 'Synced'}
              </strong>
              {lastSyncedAt && (
                <span style={{ marginLeft: 'auto', fontSize: 11.5, color: 'var(--muted)', fontWeight: 500 }}>
                  Last synced: {lastSyncedAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
              )}
            </div>

            <div className="account-card-actions">
              <motion.button
                whileTap={buttonTap}
                type="button"
                className="button compact ghost"
                onClick={onManualSync}
                disabled={syncState === 'syncing'}
              >
                <RefreshCw size={14} className={syncState === 'syncing' ? 'spin' : ''} />
                <span>Sync Now</span>
              </motion.button>
              <motion.button
                whileTap={buttonTap}
                type="button"
                className="button compact danger"
                onClick={onLogout}
              >
                <span>Log Out</span>
              </motion.button>
            </div>
          </div>
        ) : (
          <div className="account-card local">
            <div className="account-card-header">
              <div className="account-avatar local">
                <HardDrive size={20} />
              </div>
              <div className="account-details">
                <strong>Personal Account</strong>
                <span>
                  {isSupabaseConfigured()
                    ? 'Signed out · Data is stored safely on this device'
                    : 'Local Mode · Financial records are saved on this device'}
                </span>
              </div>
            </div>
            {isSupabaseConfigured() && (
              <div className="account-card-actions">
                <motion.button
                  whileTap={buttonTap}
                  type="button"
                  className="button compact primary"
                  onClick={onShowAuth}
                >
                  <User size={14} />
                  <span>Log In / Sign Up</span>
                </motion.button>
              </div>
            )}
          </div>
        )}
      </ConfigSection>

      <ConfigSection title="Profile">
        <SettingRow icon={<CircleDollarSign size={18}/>} title="Your name" detail="Personalize your greeting">
          <input
            className="setting-input"
            value={data.settings.name}
            onChange={e => setSettings({ name: e.target.value })}
            onBlur={e => {
              const name = e.target.value.trim()
              if (currentUser && name) {
                authService.updateProfile(name).catch(() => {})
              }
            }}
            placeholder="Add name"
          />
        </SettingRow>
        <SettingRow icon={<WalletCards size={18}/>} title="Currency" detail="Used throughout THOGAI">
          <div style={{minWidth:160,maxWidth:190}}>
            <ThemedSelect compact value={data.settings.currency} onChange={v=>setSettings({currency:v})} options={currencies.map(c=>({value:c.code,label:`${c.symbol} — ${c.name}`}))}/>
          </div>
        </SettingRow>
      </ConfigSection>

      <ConfigSection title="Finance Defaults">
        <SettingRow icon={<Landmark size={18}/>} title="Starting balance" detail="Your balance before tracked activity">
          <input className="setting-input amount" type="number" inputMode="decimal" value={data.settings.startingBalance||''} onChange={e=>setSettings({startingBalance:safe(Number(e.target.value))})} placeholder="0"/>
        </SettingRow>
        <SettingRow icon={<ReceiptText size={18}/>} title="Default category" detail="Preselected for new expenses">
          <div style={{minWidth:140,maxWidth:175}}>
            <ThemedSelect compact value={data.settings.defaultCategory} onChange={v=>setSettings({defaultCategory:v})} options={activeExpenseCategories.map(c=>{const I=categoryIcons[c]||ReceiptText;return{value:c,label:c,icon:<I size={14}/>}})}/>
          </div>
        </SettingRow>
        <SettingRow icon={<WalletCards size={18}/>} title="Default account" detail="Preselected spend type">
          <div style={{minWidth:140,maxWidth:175}}>
            <ThemedSelect compact value={data.settings.defaultAccount||'Cash'} onChange={v=>setDefaultAcc(v)} options={activeAccounts.map(a=>{const I=accountIcons[a]||WalletCards;return{value:a,label:a,icon:<I size={14}/>}})}/>
          </div>
        </SettingRow>
      </ConfigSection>

      <ConfigSection title="Categories & Accounts">
        <button type="button" className="data-action" onClick={()=>setModal({mode:'categories'})}>
          <ReceiptText size={18}/>
          <span>
            <strong>Edit categories</strong>
            <small>{activeExpenseCategories.length} expense · {activeIncomeCategories.length} income</small>
          </span>
          <ChevronRight size={17}/>
        </button>
        <button type="button" className="data-action" onClick={()=>setModal({mode:'accounts'})}>
          <WalletCards size={18}/>
          <span>
            <strong>Accounts & payment methods</strong>
            <small>{activeAccounts.length} accounts · Default: {data.settings.defaultAccount||'Cash'}</small>
          </span>
          <ChevronRight size={17}/>
        </button>
      </ConfigSection>

      <ConfigSection title="Theme & appearance">
        <div className="theme-scroller">
          {themes.map(t=>(
            <button key={t.id} className={`theme-card ${t.id} ${data.settings.theme===t.id?'selected':''}`} onClick={()=>setSettings({theme:t.id})}>
              <span className="theme-preview"><i/><i/><i/></span>
              <strong>{t.name}</strong>
              <small>{t.copy}</small>
              {data.settings.theme===t.id&&<b><Check size={13}/></b>}
            </button>
          ))}
        </div>
      </ConfigSection>

      <ConfigSection title="Security">
        <ToggleRow title="App lock" detail={data.settings.appLockPin?"Require 4-digit PIN on app open":"Set up 4-digit PIN lock"} on={data.settings.appLock} set={(v)=>{if(v){if(data.settings.appLockPin){setSettings({appLock:true});toast('App Lock enabled')}else{setModal({mode:'pin_setup',nextAction:'appLock'})}}else{setSettings({appLock:false});toast('App Lock disabled')}}}/>
        <ToggleRow title="Biometric lock" detail="Unlock with Touch ID, Face ID or Windows Hello" on={data.settings.biometricLock} set={async(v)=>{if(v){const available=await security.isBiometricAvailable();if(!available){toast('Platform biometrics / Windows Hello not available on this browser/device');return}if(!data.settings.appLockPin){toast('Please set an App PIN first as backup');setModal({mode:'pin_setup',nextAction:'biometricLock'});return}const reg=await security.registerBiometric();if(reg){setSettings({biometricLock:true});toast('Biometric lock enabled')}else{toast('Biometric registration was cancelled')}}else{setSettings({biometricLock:false});toast('Biometric lock disabled')}}}/>
        {data.settings.appLockPin&&<SettingRow icon={<KeyRound size={18}/>} title="Change PIN" detail="Update your 4-digit security code"><button className="button compact ghost" onClick={()=>setModal({mode:'pin_setup',nextAction:'changePin'})}>Change PIN</button></SettingRow>}
        {(data.settings.appLock||data.settings.biometricLock)&&<button className="data-action" onClick={()=>{sessionStorage.removeItem('thogai_unlocked');setIsLocked(true)}}><LockKeyhole size={18}/><span><strong>Lock App Now</strong><small>Return to secure lock screen immediately</small></span><ChevronRight size={17}/></button>}
      </ConfigSection>

      <ConfigSection title="AI Advisor">
        <SettingRow icon={<Sparkles size={18}/>} title="Smart Financial Insights" detail="Personalized spending breakdowns and budget strategies">
          <span style={{fontSize:11,fontWeight:600,padding:'4px 9px',borderRadius:12,background:'var(--surface-soft)',border:'1px solid var(--border)',color:'var(--accent)'}}>Active</span>
        </SettingRow>
        <button className="data-action" onClick={()=>setModal({mode:'ai'})}><Bot size={18}/><span><strong>Open AI Advisor</strong><small>Ask questions about your spending, budget & savings</small></span><ChevronRight size={17}/></button>
      </ConfigSection>

      <ConfigSection title="Notifications">
        <ToggleRow title="Budget alerts" detail="When you approach a limit" on={data.settings.notifications.budget} set={v=>setSettings({notifications:{...data.settings.notifications,budget:v}})}/>
        <ToggleRow title="Due reminders" detail="Keep outstanding payments visible" on={data.settings.notifications.dues} set={v=>setSettings({notifications:{...data.settings.notifications,dues:v}})}/>
        <ToggleRow title="Monthly summaries" detail="A fresh financial recap" on={data.settings.notifications.summary} set={v=>setSettings({notifications:{...data.settings.notifications,summary:v}})}/>
      </ConfigSection>

      <ConfigSection title="Data">
        <button className="data-action" onClick={exportData}><Download size={18}/><span><strong>Export data</strong><small>Save a complete THOGAI backup</small></span><ChevronRight size={17}/></button>
        <button className="data-action" onClick={()=>input.current?.click()}><FileUp size={18}/><span><strong>Import data</strong><small>Restore from a THOGAI backup</small></span><ChevronRight size={17}/></button>
        <input ref={input} hidden type="file" accept="application/json" onChange={e=>importData(e.target.files?.[0])}/>
        <button className="data-action delete" onClick={clear}><Trash2 size={18}/><span><strong>Clear local data</strong><small>Remove all transactions and settings</small></span><ChevronRight size={17}/></button>
      </ConfigSection>

      <ConfigSection title="About">
        <div className="about-card">
          <Brand/>
          <div className="about-meta">
            <span className="about-version">Version 1.0.0</span>
            <span className="about-sep">·</span>
            <span>Your financial data stays private & secure.</span>
          </div>
          <div className="about-links">
            <button type="button" className="about-link-btn" onClick={() => setModal({ mode: 'privacy' })}>
              Privacy Policy
            </button>
            <span className="about-sep">•</span>
            <button type="button" className="about-link-btn" onClick={() => setModal({ mode: 'terms' })}>
              Terms of Service
            </button>
          </div>
        </div>
      </ConfigSection>
    </div>
  );
}
function ConfigSection({title,children}:{title:string;children:React.ReactNode}){return <section className="config-section"><p className="eyebrow">{title}</p><div className="settings-group">{children}</div></section>}
function SettingRow({icon,title,detail,children}:{icon:React.ReactNode;title:string;detail:string;children:React.ReactNode}){return <div className="setting-row"><span className="setting-icon">{icon}</span><div><strong>{title}</strong><small>{detail}</small></div>{children}</div>}
function ToggleRow({title,detail,on,set}:{title:string;detail:string;on:boolean;set:(v:boolean)=>void}){return <div className="toggle-row"><div><strong>{title}</strong><small>{detail}</small></div><button className={`toggle ${on?'on':''}`} onClick={()=>set(!on)} aria-label={`Toggle ${title}`} aria-pressed={on}><i/></button></div>}

function TransactionModal({
  initial,
  type = 'expense',
  category,
  currency,
  categories: expenseCats,
  incomeCategories: incomeCats = defaultIncomeCategories,
  accounts,
  defaultAccount,
  close,
  submit
}: {
  initial?: Transaction
  type?: TransactionType
  category?: string
  currency: string
  categories: string[]
  incomeCategories?: string[]
  accounts: string[]
  defaultAccount: string
  close: () => void
  submit: (t: Omit<Transaction, 'id' | 'createdAt' | 'updatedAt'>, id?: string) => void
}) {
  const initialType = initial?.type ?? type
  const availableCats = initialType === 'income' ? incomeCats : expenseCats
  const [form, setForm] = useState({
    type: initialType,
    amount: initial?.amount ? String(initial.amount) : '',
    category: initial?.category ?? category ?? (availableCats[0] || 'Other'),
    account: initial?.account ?? defaultAccount ?? (accounts[0] || 'Cash'),
    description: initial?.description ?? '',
    date: initial?.date ?? today(),
    notes: initial?.notes ?? '',
    recurring: initial?.recurring ?? false
  })
  const [error, setError] = useState('')

  const handleTypeChange = (t: TransactionType) => {
    const nextCats = t === 'income' ? incomeCats : expenseCats
    setForm((p) => ({
      ...p,
      type: t,
      category: nextCats.includes(p.category) ? p.category : (nextCats[0] || 'Other')
    }))
  }

  const change = (key: string, value: string | boolean) => setForm((p) => ({ ...p, [key]: value }))
  const save = () => {
    const amount = Number(form.amount)
    if (!Number.isFinite(amount) || amount <= 0) return setError('Enter an amount greater than zero.')
    if (!form.category) return setError('Choose a category.')
    submit({ ...form, amount }, initial?.id)
  }

  const currentCats = form.type === 'income' ? incomeCats : expenseCats

  return (
    <Modal close={close} title={initial ? 'Edit transaction' : 'Add transaction'}>
      <div className="type-tabs">
        {(['income', 'expense', 'due'] as TransactionType[]).map((t) => (
          <button
            key={t}
            className={form.type === t ? 'active' : ''}
            onClick={() => handleTypeChange(t)}
          >
            {t === 'income' ? (
              <ArrowDownLeft size={16} />
            ) : t === 'expense' ? (
              <ArrowUpRight size={16} />
            ) : (
              <Landmark size={16} />
            )}{' '}
            {t}
          </button>
        ))}
      </div>
      <label className="amount-field">
        <span>Amount</span>
        <div>
          <b>{currencies.find((c) => c.code === currency)?.symbol ?? '₹'}</b>
          <input
            autoFocus
            type="number"
            inputMode="decimal"
            min="0"
            step="0.01"
            value={form.amount}
            onChange={(e) => change('amount', e.target.value)}
            placeholder="0"
          />
        </div>
      </label>
      <div className="form-grid">
        <label>
          Category
          <ThemedSelect
            searchable
            searchPlaceholder="Type to filter categories..."
            value={form.category}
            onChange={(v) => change('category', v)}
            options={currentCats.map((c) => {
              const I = categoryIcons[c] || ReceiptText
              return { value: c, label: c, icon: <I size={14} /> }
            })}
          />
        </label>
        <label>
          Date
          <ThemedDatePicker
            align="right"
            value={form.date}
            onChange={(v) => change('date', v)}
          />
        </label>
      </div>
      <div className="form-grid">
        <label>
          Account / Spend Type
          <ThemedSelect
            searchable
            searchPlaceholder="Type to filter accounts..."
            value={form.account}
            onChange={(v) => change('account', v)}
            options={accounts.map((a) => {
              const I = accountIcons[a] || WalletCards
              return { value: a, label: a, icon: <I size={14} /> }
            })}
          />
        </label>
        <label>
          Description
          <input
            value={form.description}
            onChange={(e) => change('description', e.target.value)}
            placeholder={form.type === 'income' ? 'e.g. Salary' : 'e.g. Lunch with friends'}
          />
        </label>
      </div>
      <label>
        Notes <span className="optional">optional</span>
        <textarea
          value={form.notes}
          onChange={(e) => change('notes', e.target.value)}
          placeholder="Add a note"
          rows={2}
        />
      </label>
      <label className="recurring">
        <input
          type="checkbox"
          checked={form.recurring}
          onChange={(e) => change('recurring', e.target.checked)}
        />
        <span>
          <strong>Repeats regularly</strong>
          <small>Mark this for easy recognition in your ledger.</small>
        </span>
      </label>
      {error && <p className="form-error">{error}</p>}
      <div className="modal-actions">
        <button className="button ghost" onClick={close}>
          Cancel
        </button>
        <button className="button primary" onClick={save}>
          {initial ? 'Save changes' : 'Add transaction'}
        </button>
      </div>
    </Modal>
  )
}
function BudgetModal({initial,currency,categories:cats,close,submit}:{initial?:Budget;currency:string;categories:string[];close:()=>void;submit:(category:string,limit:number,id?:string)=>void}) {
  const [category,setCategory]=useState(initial?.category??cats[0]??'Food');
  const [limit,setLimit]=useState(initial?.limit?String(initial.limit):'');
  const [error,setError]=useState('');
  const save=()=>{
    const n=Number(limit);
    if(!Number.isFinite(n)||n<=0)return setError('Enter a monthly limit greater than zero.');
    submit(category,n,initial?.id);
  };
  return (
    <Modal close={close} title={initial?'Edit category budget':'Add category budget'}>
      <p className="modal-intro">A budget uses your actual expense entries to show what’s left.</p>
      <label>
        Category
        <ThemedSelect
          searchable
          searchPlaceholder="Type to filter categories..."
          value={category}
          onChange={v=>setCategory(v)}
          options={cats.map(c=>{const I=categoryIcons[c]||ReceiptText;return{value:c,label:c,icon:<I size={14}/>}})}
        />
      </label>
      <label className="amount-field">
        <span>Monthly limit</span>
        <div>
          <b>{currencies.find(c=>c.code===currency)?.symbol??'₹'}</b>
          <input autoFocus type="number" inputMode="decimal" min="0" value={limit} onChange={e=>setLimit(e.target.value)} placeholder="0"/>
        </div>
      </label>
      {error&&<p className="form-error">{error}</p>}
      <div className="modal-actions">
        <button className="button ghost" onClick={close}>Cancel</button>
        <button className="button primary" onClick={save}>{initial?'Save budget':'Add budget'}</button>
      </div>
    </Modal>
  );
}
function Modal({ title, close, children }: { title: string; close: () => void; children: React.ReactNode }) {
  const reduced = useReducedMotion()
  const isMobile = typeof window !== 'undefined' && window.innerWidth <= 768
  const modalVariants = isMobile ? mobileSheetVariants : desktopModalVariants

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        close()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [close])

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
        className="modal"
        variants={reduced ? reducedMotionVariants : modalVariants}
        initial="initial"
        animate="animate"
        exit="exit"
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className="modal-head">
          <h2>{title}</h2>
          <IconButton label="Close dialog" onClick={close}>
            <X size={19} />
          </IconButton>
        </div>
        {children}
      </motion.div>
    </motion.div>
  )
}

function LockScreen({settings,onUnlock}:{settings:Settings;onUnlock:()=>void}) {
 const [pin,setPin]=useState(''); const [error,setError]=useState(''); const [shake,setShake]=useState(false); const [checkingBio,setCheckingBio]=useState(false);
 const triggerBiometrics=async()=>{if(!settings.biometricLock)return;setCheckingBio(true);setError('');try{const ok=await security.verifyBiometric();if(ok)onUnlock()}catch{}finally{setCheckingBio(false)}};
 useEffect(()=>{if(settings.biometricLock)triggerBiometrics()},[]);
 const press=(num:string)=>{if(pin.length>=4)return;const next=pin+num;setPin(next);setError('');if(next.length===4){if(!settings.appLockPin||security.verifyPin(next,settings.appLockPin)){setTimeout(()=>onUnlock(),120)}else{setShake(true);setError('Incorrect PIN');setTimeout(()=>{setShake(false);setPin('')},500)}}};
 const backspace=()=>{setPin(p=>p.slice(0,-1));setError('')};
 return <motion.div className="lock-screen" initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}}><div className={`lock-box ${shake?'shake':''}`}><div className="lock-shield"><LockKeyhole size={28}/></div><h1 className="lock-title">THOGAI Locked</h1><p className="lock-subtitle">{settings.biometricLock?'Enter PIN or verify biometrics':'Enter 4-digit PIN to continue'}</p><div className="pin-dots">{[0,1,2,3].map(i=><div key={i} className={`pin-dot ${i<pin.length?'filled':''}`}/>)}</div>{error&&<p className="form-error" style={{marginBottom:16}}>{error}</p>}<div className="keypad">{['1','2','3','4','5','6','7','8','9'].map(k=><button key={k} type="button" className="key-btn" onClick={()=>press(k)}>{k}</button>)}{settings.biometricLock?<button type="button" className="key-btn action" onClick={triggerBiometrics} title="Unlock with biometrics" disabled={checkingBio}><Fingerprint size={26}/></button>:<button type="button" className="key-btn action" onClick={()=>setPin('')}>Clear</button>}<button type="button" className="key-btn" onClick={()=>press('0')}>0</button><button type="button" className="key-btn action" onClick={backspace} title="Backspace"><Delete size={20}/></button></div></div></motion.div>
}

function PinSetupModal({close,onSave}:{close:()=>void;onSave:(pin:string)=>void}) {
 const [step,setStep]=useState<'create'|'confirm'>('create'); const [pin,setPin]=useState(''); const [firstPin,setFirstPin]=useState(''); const [error,setError]=useState(''); const [shake,setShake]=useState(false);
 const press=(num:string)=>{if(pin.length>=4)return;const next=pin+num;setPin(next);setError('');if(next.length===4){if(step==='create'){setTimeout(()=>{setFirstPin(next);setPin('');setStep('confirm')},180)}else{if(next===firstPin){setTimeout(()=>onSave(next),180)}else{setShake(true);setError('PINs did not match. Try again.');setTimeout(()=>{setShake(false);setPin('');setFirstPin('');setStep('create')},600)}}}};
 const backspace=()=>{setPin(p=>p.slice(0,-1));setError('')};
 return <Modal close={close} title={step==='create'?'Set 4-digit PIN':'Confirm 4-digit PIN'}><div className={`lock-box ${shake?'shake':''}`} style={{margin:'8px auto'}}><p className="modal-intro" style={{textAlign:'center',marginBottom:18}}>{step==='create'?'Choose a 4-digit PIN to secure your financial records.':'Re-enter the same 4-digit PIN to confirm.'}</p><div className="pin-dots">{[0,1,2,3].map(i=><div key={i} className={`pin-dot ${i<pin.length?'filled':''}`}/>)}</div>{error&&<p className="form-error" style={{marginBottom:14}}>{error}</p>}<div className="keypad">{['1','2','3','4','5','6','7','8','9'].map(k=><button key={k} type="button" className="key-btn" onClick={()=>press(k)}>{k}</button>)}<button type="button" className="key-btn action" onClick={()=>setPin('')}>Clear</button><button type="button" className="key-btn" onClick={()=>press('0')}>0</button><button type="button" className="key-btn action" onClick={backspace} title="Backspace"><Delete size={20}/></button></div></div></Modal>
}

function AiModal({data,close}:{data:FinanceData;close:()=>void}) {
 const ctx=useMemo(()=>buildFinancialContext(data.transactions,data.budgets,data.settings),[data]);
 const [messages,setMessages]=useState<{sender:'user'|'bot';text:string;isOffline?:boolean}[]>(()=>[{sender:'bot',text:generateLocalAiResponse('overview',ctx)}]);
 const [input,setInput]=useState(''); const [loading,setLoading]=useState(false); const chatBottomRef=useRef<HTMLDivElement>(null);
 useEffect(()=>{chatBottomRef.current?.scrollIntoView({behavior:'smooth'})},[messages,loading]);
 const send=async(queryText?:string)=>{
   const textToSend=(queryText||input).trim(); if(!textToSend||loading)return;
   setInput('');
   const newMessages = [...messages, { sender:'user' as const, text:textToSend }];
   setMessages(newMessages);
   setLoading(true);
   try{
     const historyTurns: ConversationTurn[] = newMessages.map(m => ({
       role: m.sender === 'user' ? 'user' : 'model',
       text: m.text
     }));
     const result = await queryAiAdvisor(textToSend, historyTurns, ctx);
     setMessages(prev=>[...prev,{sender:'bot',text:result.text,isOffline:result.isOffline}]);
   }catch{
     const fallback = generateLocalAiResponse(textToSend,ctx) || 'Unable to get advice right now. Please try again.';
     setMessages(prev=>[...prev,{sender:'bot',text:fallback,isOffline:true}]);
   }finally{
     setLoading(false);
   }
 };
 const quickActions = [
   { label: '50/30/20 Budget', prompt: 'Generate 50/30/20 Budget' },
   { label: 'Spending Analysis', prompt: 'Analyze Spending Trends' },
   { label: 'Savings Goal', prompt: 'Simulate Savings Goal' },
   { label: 'Debt Strategy', prompt: 'Debt Payoff Strategy' }
 ];
 return <Modal close={close} title="AI Advisor"><div className="ai-modal"><div className="ai-chips">{quickActions.map(q=><button key={q.label} type="button" className="ai-chip" onClick={()=>send(q.prompt)}><Sparkles size={11} style={{display:'inline',marginRight:4}}/>{q.label}</button>)}</div><div className="ai-chat">{messages.map((m,i)=><div key={i} className={`ai-msg ${m.sender}`}>{m.sender==='user'?m.text:<SafeMarkdown content={m.text}/>}</div>)}{loading&&<div className="ai-msg bot" style={{display:'flex',alignItems:'center',gap:8}}><Sparkles size={15}/><span>Thinking...</span></div>}<div ref={chatBottomRef}/></div><form className="ai-composer" onSubmit={e=>{e.preventDefault();send()}}><input value={input} onChange={e=>setInput(e.target.value)} placeholder="Ask AI Advisor about your spending, budget, or savings..." disabled={loading}/><button type="submit" className="button primary" disabled={loading||!input.trim()}><Send size={16}/></button></form></div></Modal>
}

function PrivacyModal({ close }: { close: () => void }) {
  return (
    <Modal title="Privacy & Security" close={close}>
      <div className="legal-content">
        <p className="modal-intro">
          THOGAI is designed to keep your financial life private, secure, and entirely under your control.
        </p>
        <div className="legal-section">
          <h4>Private & Encrypted Storage</h4>
          <p>Your financial transactions, budgets, accounts, and categories are saved on your device. When cloud sync is active, your records are synchronized through secure, encrypted connections to your private vault.</p>
        </div>
        <div className="legal-section">
          <h4>No Ad Tracking & No Data Selling</h4>
          <p>We do not track you for ads, nor do we sell, rent, or trade your personal financial data with any third parties.</p>
        </div>
        <div className="legal-section">
          <h4>AI Advisor Privacy</h4>
          <p>Financial inquiries sent to the AI Advisor are processed securely and privately solely to analyze your spending and provide actionable budgeting advice.</p>
        </div>
        <div className="legal-section">
          <h4>Full Data Portability</h4>
          <p>You have full ownership of your data. You can export a complete backup or clear your data at any time from Settings.</p>
        </div>
        <div className="modal-actions" style={{ marginTop: 20 }}>
          <button type="button" className="button primary compact" onClick={close} style={{ width: '100%' }}>
            Done
          </button>
        </div>
      </div>
    </Modal>
  )
}

function TermsModal({ close }: { close: () => void }) {
  return (
    <Modal title="Terms of Service" close={close}>
      <div className="legal-content">
        <p className="modal-intro">
          Terms of using THOGAI for personal financial tracking and budgeting.
        </p>
        <div className="legal-section">
          <h4>Personal Finance Management</h4>
          <p>THOGAI is a personal tool designed to help you track expenses, budget with intent, and understand your financial patterns.</p>
        </div>
        <div className="legal-section">
          <h4>Informational Insights</h4>
          <p>Recommendations provided by the AI Advisor, budget calculations, and monthly projections are for educational and personal budgeting assistance only, and do not constitute certified financial or tax advice.</p>
        </div>
        <div className="legal-section">
          <h4>Account Security</h4>
          <p>You are responsible for keeping your device PIN, login credentials, and biometric security settings up to date to safeguard access to your financial records.</p>
        </div>
        <div className="modal-actions" style={{ marginTop: 20 }}>
          <button type="button" className="button primary compact" onClick={close} style={{ width: '100%' }}>
            Done
          </button>
        </div>
      </div>
    </Modal>
  )
}

function CategoriesModal({
  categories: expenseCats,
  incomeCategories: incomeCats,
  defaultCategory,
  onUpdateExpense,
  onUpdateIncome,
  toast,
  askConfirm,
  close
}: {
  categories: string[]
  incomeCategories: string[]
  defaultCategory: string
  onUpdateExpense: (cats: string[], def?: string) => void
  onUpdateIncome: (cats: string[]) => void
  toast: (s: string) => void
  askConfirm: (opts: Omit<ConfirmDialogState, 'onCancel'> & { onCancel?: () => void }) => void
  close: () => void
}) {
  const [activeTab, setActiveTab] = useState<'expense' | 'income'>('expense')
  const [newCat, setNewCat] = useState('')
  const [crossListWarning, setCrossListWarning] = useState('')

  const cats = activeTab === 'expense' ? expenseCats : incomeCats
  const oppositeCats = activeTab === 'expense' ? incomeCats : expenseCats

  const addCategory = () => {
    const trimmed = newCat.trim()
    if (!trimmed) return

    const norm = (s: string) => s.trim().toLowerCase()

    // Hard block: already in same list
    if (cats.some((c) => norm(c) === norm(trimmed))) {
      toast(`"${trimmed}" already exists in ${activeTab} categories`)
      return
    }

    // Soft warn: exists in opposite list
    const existsInOpposite = oppositeCats.find((c) => norm(c) === norm(trimmed))
    if (existsInOpposite && !crossListWarning) {
      setCrossListWarning(
        `"${existsInOpposite}" already exists as a ${activeTab === 'expense' ? 'Income' : 'Expense'} category. Add it here too?`
      )
      return
    }

    // Proceed
    setCrossListWarning('')
    if (activeTab === 'expense') {
      onUpdateExpense([...expenseCats, trimmed])
    } else {
      onUpdateIncome([...incomeCats, trimmed])
    }
    setNewCat('')
    toast(`${activeTab === 'expense' ? 'Expense' : 'Income'} category "${trimmed}" added`)
  }

  const removeCategory = (catToRemove: string) => {
    if (cats.length <= 1) {
      toast('At least one category is required')
      return
    }
    if (activeTab === 'expense') {
      const next = expenseCats.filter((c) => c !== catToRemove)
      const nextDef = defaultCategory === catToRemove ? next[0] : undefined
      onUpdateExpense(next, nextDef)
    } else {
      const next = incomeCats.filter((c) => c !== catToRemove)
      onUpdateIncome(next)
    }
    toast(`Category "${catToRemove}" removed`)
  }

  const resetCategories = () => {
    if (activeTab === 'expense') {
      askConfirm({
        title: 'Reset expense categories to defaults?',
        message:
          'This will restore all 23 default spending categories. Any custom category tags you added will be replaced.',
        confirmText: 'Reset to defaults',
        cancelText: 'Cancel',
        danger: true,
        icon: 'reset',
        onConfirm: () => {
          onUpdateExpense(defaultExpenseCategories, defaultExpenseCategories[0])
          toast('Expense categories restored to defaults (23 categories)')
        }
      })
    } else {
      askConfirm({
        title: 'Reset income categories to defaults?',
        message:
          'This will restore all 11 default income categories. Any custom income category tags you added will be replaced.',
        confirmText: 'Reset to defaults',
        cancelText: 'Cancel',
        danger: true,
        icon: 'reset',
        onConfirm: () => {
          onUpdateIncome(defaultIncomeCategories)
          toast('Income categories restored to defaults (11 categories)')
        }
      })
    }
  }

  return (
    <Modal title="Edit Categories" close={close}>
      <div className="type-tabs" style={{ marginBottom: 14 }}>
        <button
          type="button"
          className={activeTab === 'expense' ? 'active' : ''}
          onClick={() => {
            setActiveTab('expense')
            setNewCat('')
          }}
        >
          <ArrowUpRight size={15} /> Expense ({expenseCats.length})
        </button>
        <button
          type="button"
          className={activeTab === 'income' ? 'active' : ''}
          onClick={() => {
            setActiveTab('income')
            setNewCat('')
          }}
        >
          <ArrowDownLeft size={15} /> Income ({incomeCats.length})
        </button>
      </div>

      <p className="modal-intro">
        {activeTab === 'expense'
          ? 'Customize categories used to tag expenses and set budget limits.'
          : 'Customize categories used to track income inflows and earnings.'}
      </p>
      <div className="config-pill-grid modal-pill-grid">
        {cats.map((cat) => {
          const I = categoryIcons[cat] || ReceiptText
          return (
            <span key={cat} className="config-pill">
              <I size={14} style={{ color: 'var(--accent)' }} />
              <span>{cat}</span>
              {cats.length > 1 && (
                <button
                  type="button"
                  className="config-pill-del"
                  onClick={() => removeCategory(cat)}
                  aria-label={`Remove ${cat}`}
                  title={`Remove ${cat}`}
                >
                  <X size={12} />
                </button>
              )}
            </span>
          )
        })}
      </div>
      <form
        className="config-inline-form modal-inline-form"
        onSubmit={(e) => {
          e.preventDefault()
          addCategory()
        }}
      >
        <input
          value={newCat}
          onChange={(e) => { setNewCat(e.target.value); setCrossListWarning('') }}
          placeholder={
            activeTab === 'expense'
              ? 'Add expense category (e.g. Fuel, Groceries)...'
              : 'Add income category (e.g. Freelance, Dividend)...'
          }
        />
        <button
          type="submit"
          className="button compact primary"
          disabled={!newCat.trim()}
        >
          <Plus size={15} /> Add
        </button>
      </form>
      {crossListWarning && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 2px', fontSize: 12.5, color: 'var(--warning)' }}>
          <ShieldAlert size={14} style={{ flex: 'none' }} />
          <span style={{ flex: 1 }}>{crossListWarning}</span>
          <button
            type="button"
            className="button compact ghost"
            style={{ fontSize: 12, minHeight: 30 }}
            onClick={addCategory}
          >
            Add anyway
          </button>
          <button
            type="button"
            className="text-button"
            style={{ fontSize: 12 }}
            onClick={() => setCrossListWarning('')}
          >
            Cancel
          </button>
        </div>
      )}
      <div
        className="modal-actions"
        style={{
          justifyContent: 'space-between',
          alignItems: 'center',
          marginTop: 16
        }}
      >
        <button type="button" className="text-button" onClick={resetCategories}>
          <RotateCcw size={13} /> Reset to defaults
        </button>
        <button type="button" className="button primary compact" onClick={close}>
          Done
        </button>
      </div>
    </Modal>
  )
}

function AccountsModal({
  accounts: accs,
  defaultAccount,
  onUpdate,
  toast,
  askConfirm,
  close
}: {
  accounts: string[]
  defaultAccount: string
  onUpdate: (accs: string[], def?: string) => void
  toast: (s: string) => void
  askConfirm: (opts: Omit<ConfirmDialogState, 'onCancel'> & { onCancel?: () => void }) => void
  close: () => void
}) {
  const [newAcc, setNewAcc] = useState('')

  const addAccount = () => {
    const trimmed = newAcc.trim()
    if (!trimmed) return
    if (accs.some((a) => a.toLowerCase() === trimmed.toLowerCase())) {
      toast('Account already exists')
      return
    }
    onUpdate([...accs, trimmed])
    setNewAcc('')
    toast(`Account "${trimmed}" added`)
  }

  const removeAccount = (accToRemove: string) => {
    if (accs.length <= 1) {
      toast('At least one account is required')
      return
    }
    const next = accs.filter((a) => a !== accToRemove)
    const nextDef = defaultAccount === accToRemove ? next[0] : undefined
    onUpdate(next, nextDef)
    toast(`Account "${accToRemove}" removed`)
  }

  const setDefaultAcc = (acc: string) => {
    onUpdate(accs, acc)
    toast(`Default account set to ${acc}`)
  }

  const resetAccounts = () => {
    askConfirm({
      title: 'Reset accounts to defaults?',
      message:
        'This will restore all 9 default accounts (Cash, SBI, HDFC, ICICI, Axis, UPI, Indian Bank, Wallet, Credit Card).',
      confirmText: 'Reset to defaults',
      cancelText: 'Cancel',
      danger: true,
      icon: 'reset',
      onConfirm: () => {
        onUpdate(defaultAccounts, 'Cash')
        toast('Accounts restored to defaults')
      }
    })
  }

  return (
    <Modal title="Accounts & Spend Types" close={close}>
      <p className="modal-intro">
        Manage payment methods and accounts (e.g. Cash, Indian Bank, UPI).
      </p>
      <div className="config-pill-grid modal-pill-grid">
        {accs.map(acc => {
          const isDef = defaultAccount === acc;
          const I = accountIcons[acc] || WalletCards;
          return (
            <span key={acc} className={`config-pill ${isDef ? 'is-default' : ''}`}>
              <I size={14} style={{color: isDef ? 'var(--accent)' : 'var(--muted)'}}/>
              <span>{acc}</span>
              {isDef ? (
                <span className="config-default-badge">Default</span>
              ) : (
                <button type="button" className="config-pill-default-btn" onClick={() => setDefaultAcc(acc)} title="Make this the default account">
                  Set Default
                </button>
              )}
              {accs.length > 1 && !isDef && (
                <button type="button" className="config-pill-del" onClick={() => removeAccount(acc)} aria-label={`Remove ${acc}`} title={`Remove ${acc}`}>
                  <X size={12}/>
                </button>
              )}
            </span>
          );
        })}
      </div>
      <form className="config-inline-form modal-inline-form" onSubmit={e => { e.preventDefault(); addAccount(); }} style={{padding:'12px 0'}}>
        <input value={newAcc} onChange={e => setNewAcc(e.target.value)} placeholder="Add new account (e.g. Indian Bank, HDFC, Paytm)..."/>
        <button type="submit" className="button compact primary" disabled={!newAcc.trim()}><Plus size={15}/> Add</button>
      </form>
      <div className="modal-actions" style={{justifyContent:'space-between',alignItems:'center',marginTop:16}}>
        <button type="button" className="text-button" onClick={resetAccounts}><RotateCcw size={13}/> Reset to defaults</button>
        <button type="button" className="button primary compact" onClick={close}>Done</button>
      </div>
    </Modal>
  );
}



function MigrationModal({ count, onImport, onSkip }: { count: number; onImport: () => void; onSkip: () => void }) {
  return (
    <Modal title="Import Device Data" close={onSkip}>
      <div className="migration-modal-content">
        <div style={{ textAlign: 'center', marginBottom: 16 }}>
          <div
            style={{
              width: 52,
              height: 52,
              borderRadius: 26,
              background: 'var(--accent-tint)',
              color: 'var(--accent)',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 12px auto'
            }}
          >
            <Cloud size={26} />
          </div>
          <h3 style={{ fontSize: 18, margin: '0 0 6px 0', color: 'var(--text)' }}>
            Existing Local Data Detected
          </h3>
          <p style={{ margin: 0, color: 'var(--muted)', fontSize: 14, lineHeight: 1.5 }}>
            We found <strong>{count}</strong> existing transaction{count > 1 ? 's' : ''} stored locally on this device. Would you like to merge and upload them to your cloud account?
          </p>
        </div>
        <div className="modal-actions" style={{ marginTop: 24, gap: 12 }}>
          <button type="button" className="button ghost" onClick={onSkip}>
            Keep Local Only
          </button>
          <button type="button" className="button primary" onClick={onImport}>
            <Cloud size={16} /> Merge to Cloud Account
          </button>
        </div>
      </div>
    </Modal>
  )
}

export default App

