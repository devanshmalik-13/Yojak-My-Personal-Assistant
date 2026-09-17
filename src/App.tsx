import { useEffect, useRef, useState } from 'react'
import { App as CapacitorApp } from '@capacitor/app'
import { Capacitor } from '@capacitor/core'
import { Search, Settings, X } from 'lucide-react'
import { AppProvider, useApp } from './store'
import BottomNav from './components/BottomNav'
import Onboarding from './screens/Onboarding'
import HomeScreen from './screens/HomeScreen'
import AttendanceScreen from './screens/AttendanceScreen'
import AssignmentsScreen from './screens/AssignmentsScreen'
import CompetitionsScreen from './screens/CompetitionsScreen'
import NotifierScreen from './screens/NotifierScreen'
import ExpenseScreen from './screens/ExpenseScreen'
import ProfileScreen from './screens/ProfileScreen'
import SettingsScreen, { applyTheme } from './screens/SettingsScreen'
import type { NavTab } from './types'
import type { HeaderNav } from './components/ScreenHeader'
import { searchService, type SearchResult } from './services/searchService'
import { handleBackNavigation } from './services/backNavigation'
import { useBackHandler } from './hooks/useBackHandler'
import SubjectOverviewSheet from './components/SubjectOverviewSheet'

type SubScreen = 'main' | 'profile' | 'settings' | 'alerts' | 'search'

function AppShell() {
  const { state, ready, error, clearError } = useApp()
  const [tab, setTab] = useState<NavTab>('home')
  const [sub, setSub] = useState<SubScreen>('main')
  const [searchQuery, setSearchQuery] = useState('')
  const contentRef = useRef<HTMLDivElement>(null)
  const tabHistoryRef = useRef<NavTab[]>([])

  const navigateTab = (nextTab: NavTab) => {
    if (nextTab === tab) return
    tabHistoryRef.current.push(tab)
    setTab(nextTab)
    setSub('main')
  }

  useBackHandler(true, () => {
    if (sub !== 'main') {
      setSub('main')
      return true
    }

    const previousTab = tabHistoryRef.current.pop()
    if (previousTab) {
      setTab(previousTab)
      return true
    }

    if (tab !== 'home') {
      setTab('home')
      return true
    }

    return true
  })

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return

    const listener = CapacitorApp.addListener('backButton', async () => {
      handleBackNavigation()
    })

    return () => { void listener.then(handle => handle.remove()) }
  }, [])

  // All main tabs share one scroll container. Reset it when switching tabs so
  // a long screen cannot leave the next screen's header scrolled off-screen.
  useEffect(() => {
    contentRef.current?.scrollTo({ top: 0 })
  }, [tab])

  useEffect(() => {
    applyTheme(state.theme)
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const handler = () => { if (state.theme === 'system') applyTheme('system') }
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [state.theme])

  const unread = state.alerts.filter(a => !a.read).length

  // Shared nav object passed to every screen
  const nav: HeaderNav = {
    onSearch:   () => setSub('search'),
    onAlerts:   () => setSub('alerts'),
    onSettings: () => setSub('settings'),
    onProfile:  () => setSub('profile'),
    unread,
    name: state.profile.name,
  }

  if (!ready) return (
    <div className="h-dvh bg-bg flex items-center justify-center">
      <div className="text-center"><div className="w-10 h-10 rounded-2xl bg-primary/15 mx-auto mb-3 animate-pulse" /><p className="text-sm text-muted-fg">Opening your local data…</p></div>
    </div>
  )

  const errorBanner = error ? (
    <button onClick={clearError} className="fixed z-[100] left-4 right-4 bottom-24 max-w-sm mx-auto bg-danger text-white text-sm px-4 py-3 rounded-2xl shadow-xl text-left">
      {error}<span className="float-right opacity-80">×</span>
    </button>
  ) : null

  if (!state.onboardingComplete) return <>{errorBanner}<Onboarding /></>

  if (sub === 'profile')  return <>{errorBanner}<SlideScreen><ProfileScreen onBack={() => setSub('main')} onSettings={() => setSub('settings')} /></SlideScreen></>
  if (sub === 'settings') return <>{errorBanner}<SlideScreen><SettingsScreen onBack={() => setSub('main')} onProfile={() => setSub('profile')} /></SlideScreen></>
  if (sub === 'alerts')   return <NotifierScreen onBack={() => setSub('main')} onSettings={() => setSub('settings')} onProfile={() => setSub('profile')} name={state.profile.name} />
  if (sub === 'search')   return (
    <SearchScreen
      query={searchQuery}
      onQueryChange={setSearchQuery}
      onBack={() => setSub('main')}
      onSettings={() => setSub('settings')}
      onProfile={() => setSub('profile')}
      name={state.profile.name}
    />
  )

  return (
    <>
    {errorBanner}
    <div className="h-dvh bg-bg flex flex-col overflow-hidden ledger-grid">
      {/* Scrollable content area */}
      <div ref={contentRef} className="flex-1 overflow-y-auto overscroll-contain max-w-md mx-auto w-full">
        {tab === 'home'         && <HomeScreen         nav={nav} onNavigate={navigateTab} />}
        {tab === 'attendance'   && <AttendanceScreen   nav={nav} />}
        {tab === 'assignments'  && <AssignmentsScreen  nav={nav} />}
        {tab === 'competitions' && <CompetitionsScreen nav={nav} />}
        {tab === 'expense'      && <ExpenseScreen      nav={nav} />}
        {/* Spacer so last card clears the nav bar */}
        <div className="h-28" />
      </div>

      {/* Bottom nav — fixed relative to viewport */}
      <div className="shrink-0 max-w-md mx-auto w-full">
        <BottomNav active={tab} onChange={navigateTab} />
      </div>
    </div>
    </>
  )
}

/* ── Slide-in wrapper for sub-screens ─────────────────────────────────────── */
function SlideScreen({ children }: { children: React.ReactNode }) {
  return (
    <div className="h-dvh bg-bg overflow-y-auto anim-fadeUp ledger-grid">
      {children}
    </div>
  )
}

/* ── Search screen ────────────────────────────────────────────────────────── */
function SearchScreen({ query, onQueryChange, onBack, onSettings, onProfile, name }: {
  query: string
  onQueryChange: (q: string) => void
  onBack: () => void
  onSettings: () => void
  onProfile: () => void
  name: string
}) {
  const [results, setResults] = useState<SearchResult[]>([])
  const [selectedSubjectId, setSelectedSubjectId] = useState<string | null>(null)
  useEffect(() => { let active=true;searchService.search(query).then(value=>{if(active)setResults(value)});return()=>{active=false}}, [query])
  const labels:Record<SearchResult['type'],string>={subject:'Subject',assignment:'Assignment',competition:'Competition',reminder:'Reminder',transaction:'Transaction'}
  const emojis:Record<SearchResult['type'],string>={subject:'📅',assignment:'📚',competition:'🏆',reminder:'🔔',transaction:'💰'}

  const typeColors: Record<string, string> = {
    Subject:     'bg-purple-500/10 text-purple-600 dark:text-purple-400',
    Assignment:  'bg-orange-500/10 text-orange-600 dark:text-orange-400',
    Competition: 'bg-yellow-500/10 text-yellow-600 dark:text-yellow-400',
    Reminder:    'bg-blue-500/10   text-blue-600   dark:text-blue-400',
    Transaction: 'bg-green-500/10  text-green-600  dark:text-green-400',
  }
  const initials = name.split(' ').map(value => value[0]).slice(0, 2).join('').toUpperCase() || '?'
  return (
    <div className="h-dvh bg-bg overflow-y-auto anim-fadeUp ledger-grid">
      {/* Search bar */}
      <div className="px-5 safe-top pb-3 border-b border-border">
        <div className="flex items-center gap-3">
          <button onClick={onBack} className="text-muted-fg active:opacity-60 shrink-0">
            <X size={20} />
          </button>
          <div className="flex-1 relative">
            <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-fg" />
            <input
              autoFocus
              className="w-full pl-10 pr-4 py-3 rounded-2xl border border-border bg-card text-fg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 placeholder:text-muted-fg/60"
              placeholder="Search subjects, assignments, expenses..."
              value={query}
              onChange={e => onQueryChange(e.target.value)}
            />
          </div>
          <button onClick={onSettings} className="w-9 h-9 rounded-xl bg-muted border border-border flex items-center justify-center text-fg-soft shrink-0" aria-label="Settings"><Settings size={16} /></button>
          <button onClick={onProfile} className="w-9 h-9 rounded-xl bg-primary text-white dark:text-[#062117] flex items-center justify-center text-xs font-bold shrink-0" aria-label="Profile">{initials}</button>
        </div>
      </div>

      <div className="px-5 py-4 max-w-md mx-auto">
        {query.length < 2 ? (
          <div className="text-center py-16">
            <div className="text-4xl mb-3">🔍</div>
            <p className="text-sm text-muted-fg">Start typing to search across all modules</p>
          </div>
        ) : results.length === 0 ? (
          <div className="text-center py-16">
            <div className="text-4xl mb-3">😕</div>
            <p className="font-display font-semibold text-fg">No results</p>
            <p className="text-sm text-muted-fg mt-1">Try a different term</p>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            <p className="text-xs text-muted-fg font-medium mb-1">{results.length} result{results.length !== 1 ? 's' : ''}</p>
            {results.map(r => (
              <button key={`${r.type}-${r.id}`} onClick={() => { if (r.type === 'subject') setSelectedSubjectId(r.id) }} className="bg-card border border-border rounded-2xl px-4 py-3 flex items-center gap-3 text-left disabled:cursor-default" disabled={r.type !== 'subject'}>
                <span className="text-xl shrink-0">{emojis[r.type]}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-fg truncate">{r.title}</p>
                  {r.subtitle && <p className="text-xs text-muted-fg">{r.subtitle}</p>}
                </div>
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0 ${typeColors[labels[r.type]] || 'bg-muted text-muted-fg'}`}>
                  {labels[r.type]}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
      <SubjectOverviewSheet subjectId={selectedSubjectId} onClose={() => setSelectedSubjectId(null)} />
    </div>
  )
}

/* ── Root ─────────────────────────────────────────────────────────────────── */
export default function App() {
  return (
    <AppProvider>
      <AppShell />
    </AppProvider>
  )
}
