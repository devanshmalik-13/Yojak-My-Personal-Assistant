import { useRef, useState } from 'react'
import { Sun, Moon, Smartphone, Bell, Calendar, BookOpen, Trophy, Minus, Plus, RefreshCw, Download, Upload, Globe2 } from 'lucide-react'
import { useApp } from '../store'
import { Dialog } from '../components/ui'
import type { ThemeMode, NotificationSettings } from '../types'
import ChangeTimetableFlow from '../components/ChangeTimetableFlow'
import { backupService } from '../services/backupService'

interface SettingsScreenProps {
  onBack: () => void
  onProfile: () => void
}

const themeOptions: { value: ThemeMode; label: string; icon: typeof Sun; desc: string }[] = [
  { value: 'light',  label: 'Light',        icon: Sun,        desc: 'Ivory Academic Ledger theme' },
  { value: 'dark',   label: 'Dark',         icon: Moon,       desc: 'Black olive and emerald theme' },
  { value: 'system', label: 'Follow Phone', icon: Smartphone, desc: 'Matches your system setting' },
]

export default function SettingsScreen({ onBack, onProfile }: SettingsScreenProps) {
  const { state, dispatch, reload } = useApp()
  const [thresholdDialog, setThresholdDialog] = useState(false)
  const [draftThreshold, setDraftThreshold] = useState(state.attendanceThreshold)
  const [showChangeTimetable, setShowChangeTimetable] = useState(false)
  const [dataMessage, setDataMessage] = useState('')
  const backupInputRef = useRef<HTMLInputElement>(null)

  const exportBackup = async () => { try { await backupService.saveBackup(); setDataMessage('Backup exported successfully') } catch (error) { setDataMessage(error instanceof Error ? error.message : 'Backup failed') } }
  const importBackup = async (event: React.ChangeEvent<HTMLInputElement>) => { const file=event.target.files?.[0];if(!file)return;try{await backupService.importBackup(file);await reload();setDataMessage('Backup restored successfully')}catch(error){setDataMessage(error instanceof Error?error.message:'Restore failed')}finally{event.target.value=''} }

  if (showChangeTimetable) {
    return <ChangeTimetableFlow onClose={() => setShowChangeTimetable(false)} />
  }

  const setTheme = (theme: ThemeMode) => {
    dispatch({ type: 'SET_THEME', theme })
    applyTheme(theme)
  }

  const toggleNotif = (key: keyof NotificationSettings) => {
    dispatch({ type: 'SET_NOTIFICATION_SETTINGS', settings: { [key]: !state.notificationSettings[key] } })
  }

  const saveThreshold = () => {
    dispatch({ type: 'SET_THRESHOLD', threshold: draftThreshold })
    setThresholdDialog(false)
  }

  const notifRows: { key: keyof NotificationSettings; icon: typeof Calendar; label: string; desc: string }[] = [
    { key: 'attendance',   icon: Calendar, label: 'Attendance Alerts',   desc: 'Warns when attendance drops below threshold' },
    { key: 'assignments',  icon: BookOpen, label: 'Assignment Reminders', desc: 'Reminds before assignment deadlines' },
    { key: 'competitions', icon: Trophy,   label: 'Competition Alerts',   desc: 'Notifies about upcoming competition dates' },
    { key: 'reminders',    icon: Bell,     label: 'Custom Reminders',     desc: 'Your personal notifier reminders' },
  ]

  return (
    <div className="flex flex-col pb-8 min-h-full">
      {/* Header */}
      <div className="px-5 safe-top pb-6 flex items-center gap-3">
        <button onClick={onBack} className="p-2 -ml-2 text-muted-fg active:opacity-60">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M19 12H5M12 5l-7 7 7 7" />
          </svg>
        </button>
        <h1 className="font-display font-bold text-xl text-fg flex-1">Settings</h1>
        <button onClick={onProfile} className="w-9 h-9 rounded-xl bg-primary text-white dark:text-[#062117] flex items-center justify-center text-xs font-bold" aria-label="Profile">
          {state.profile.name.split(' ').map(value => value[0]).slice(0, 2).join('').toUpperCase() || '?'}
        </button>
      </div>

      <div className="px-5 flex flex-col gap-5">

        {/* ── Appearance ── */}
        <div>
          <p className="text-xs font-semibold text-muted-fg uppercase tracking-wide mb-2 px-1">Appearance</p>
          <div className="bg-card border border-border rounded-2xl overflow-hidden">
            {themeOptions.map((opt, i) => {
              const Icon = opt.icon
              const isActive = state.theme === opt.value
              return (
                <button
                  key={opt.value}
                  onClick={() => setTheme(opt.value)}
                  className={`w-full flex items-center gap-3 px-5 py-4 text-left transition-colors ${i < themeOptions.length - 1 ? 'border-b border-border' : ''} ${isActive ? 'bg-primary/5' : 'active:bg-muted'}`}
                >
                  <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${isActive ? 'bg-primary/15' : 'bg-muted'}`}>
                    <Icon size={18} className={isActive ? 'text-primary' : 'text-muted-fg'} />
                  </div>
                  <div className="flex-1">
                    <p className={`font-medium text-sm ${isActive ? 'text-primary' : 'text-fg'}`}>{opt.label}</p>
                    <p className="text-xs text-muted-fg">{opt.desc}</p>
                  </div>
                  <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors ${isActive ? 'border-primary bg-primary' : 'border-border'}`}>
                    {isActive && (
                      <svg width="10" height="10" viewBox="0 0 12 10" fill="none">
                        <path d="M1 5l3.5 3.5L11 1" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    )}
                  </div>
                </button>
              )
            })}
          </div>
        </div>

        {/* ── Notifications ── */}
        <div>
          <p className="text-xs font-semibold text-muted-fg uppercase tracking-wide mb-2 px-1">Notifications</p>
          <div className="bg-card border border-border rounded-2xl overflow-hidden">
            {notifRows.map((item, i) => {
              const Icon = item.icon
              const enabled = state.notificationSettings[item.key]
              return (
                <div key={item.key} className={`flex items-center gap-3 px-5 py-4 ${i < notifRows.length - 1 ? 'border-b border-border' : ''}`}>
                  <div className="w-9 h-9 rounded-xl bg-muted flex items-center justify-center shrink-0">
                    <Icon size={16} className="text-muted-fg" />
                  </div>
                  <div className="flex-1">
                    <p className="font-medium text-sm text-fg">{item.label}</p>
                    <p className="text-xs text-muted-fg">{item.desc}</p>
                  </div>
                  <button onClick={() => toggleNotif(item.key)} className="shrink-0">
                    <Toggle enabled={enabled} />
                  </button>
                </div>
              )
            })}
          </div>
        </div>

        {/* ── Attendance ── */}
        <div>
          <p className="text-xs font-semibold text-muted-fg uppercase tracking-wide mb-2 px-1">Attendance</p>
          <div className="bg-card border border-border rounded-2xl overflow-hidden">
            <button
              onClick={() => { setDraftThreshold(state.attendanceThreshold); setThresholdDialog(true) }}
              className="w-full flex items-center justify-between px-5 py-4 border-b border-border active:bg-muted transition-colors"
            >
              <div className="text-left">
                <p className="font-medium text-sm text-fg">Attendance Threshold</p>
                <p className="text-xs text-muted-fg">Alert when attendance drops below this</p>
              </div>
              <div className="flex items-center gap-2">
                <span className="font-display font-bold text-xl text-primary">{state.attendanceThreshold}%</span>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-muted-fg">
                  <path d="M9 18l6-6-6-6" />
                </svg>
              </div>
            </button>
            <button
              onClick={() => setShowChangeTimetable(true)}
              className="w-full flex items-center gap-3 px-5 py-4 active:bg-muted transition-colors"
            >
              <div className="w-9 h-9 rounded-xl bg-muted flex items-center justify-center shrink-0">
                <RefreshCw size={16} className="text-muted-fg" />
              </div>
              <div className="flex-1 text-left">
                <p className="font-medium text-sm text-fg">Change Timetable</p>
                <p className="text-xs text-muted-fg">Update schedule · manage past attendance</p>
              </div>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-muted-fg shrink-0">
                <path d="M9 18l6-6-6-6" />
              </svg>
            </button>
          </div>
        </div>

        <div>
          <p className="text-xs font-semibold text-muted-fg uppercase tracking-wide mb-2 px-1">Local data</p>
          <div className="bg-card border border-border rounded-2xl overflow-hidden">
            <div className="flex items-center gap-3 px-5 py-4 border-b border-border">
              <Globe2 size={17} className="text-muted-fg shrink-0" />
              <div className="flex-1"><p className="font-medium text-sm text-fg">Timezone</p><p className="text-xs text-muted-fg">Used for reminder scheduling</p></div>
              <select value={state.timezone} onChange={e => dispatch({type:'SET_TIMEZONE',timezone:e.target.value})} className="max-w-36 bg-muted border border-border rounded-xl px-2 py-2 text-xs text-fg">
                {['Asia/Kolkata','UTC','Asia/Dubai','Asia/Singapore','Europe/London','America/New_York','America/Los_Angeles','Australia/Sydney'].map(zone=><option key={zone} value={zone}>{zone}</option>)}
              </select>
            </div>
            <button onClick={exportBackup} className="w-full flex items-center gap-3 px-5 py-4 border-b border-border text-left active:bg-muted">
              <Download size={17} className="text-primary" /><div><p className="font-medium text-sm text-fg">Export backup</p><p className="text-xs text-muted-fg">SQLite data and local files in one archive</p></div>
            </button>
            <button onClick={()=>backupInputRef.current?.click()} className="w-full flex items-center gap-3 px-5 py-4 text-left active:bg-muted">
              <Upload size={17} className="text-primary" /><div><p className="font-medium text-sm text-fg">Restore backup</p><p className="text-xs text-muted-fg">Validated before replacing current data</p></div>
            </button>
            <input ref={backupInputRef} type="file" accept=".zip,.mpa-backup.zip" className="hidden" onChange={importBackup} />
          </div>
          {dataMessage && <p className="text-xs text-muted-fg mt-2 px-1">{dataMessage}</p>}
        </div>

        {/* App info */}
        <div className="text-center py-2">
          <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-3">
            <span className="text-2xl">🤖</span>
          </div>
          <p className="font-display font-semibold text-sm text-fg">My Personal Assistant</p>
          <p className="text-xs text-muted-fg mt-0.5">Version 2.0 · Academic Ledger</p>
        </div>
      </div>

      {/* Threshold Dialog */}
      <Dialog
        open={thresholdDialog}
        onClose={() => setThresholdDialog(false)}
        title="Attendance Threshold"
        confirmLabel="Save"
        onConfirm={saveThreshold}
      >
        <p className="text-sm text-muted-fg mb-5 -mt-1">
          You'll be alerted when any subject falls below this percentage.
        </p>
        <div className="flex items-center justify-center gap-6 py-4 bg-muted rounded-2xl mb-2">
          <button
            onClick={() => setDraftThreshold(t => Math.max(50, t - 5))}
            className="w-10 h-10 rounded-full bg-card border border-border flex items-center justify-center text-fg active:bg-muted transition-colors"
          >
            <Minus size={18} />
          </button>
          <div className="text-center min-w-[80px]">
            <span className="font-display font-bold text-4xl text-primary">{draftThreshold}</span>
            <span className="font-display font-bold text-2xl text-muted-fg">%</span>
          </div>
          <button
            onClick={() => setDraftThreshold(t => Math.min(95, t + 5))}
            className="w-10 h-10 rounded-full bg-card border border-border flex items-center justify-center text-fg active:bg-muted transition-colors"
          >
            <Plus size={18} />
          </button>
        </div>
        <p className="text-xs text-center text-muted-fg">Adjust in steps of 5% (50%–95%)</p>
      </Dialog>
    </div>
  )
}

function Toggle({ enabled }: { enabled: boolean }) {
  return (
    <div className={`w-12 h-6 rounded-full flex items-center px-1 transition-colors duration-200 ${enabled ? 'bg-primary' : 'bg-border'}`}>
      <div className={`w-4 h-4 rounded-full bg-white shadow transition-transform duration-200 ${enabled ? 'translate-x-6' : 'translate-x-0'}`} />
    </div>
  )
}

export function applyTheme(mode: ThemeMode) {
  const html = document.documentElement
  if (mode === 'dark') {
    html.setAttribute('data-theme', 'dark')
  } else if (mode === 'light') {
    html.removeAttribute('data-theme')
  } else {
    if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
      html.setAttribute('data-theme', 'dark')
    } else {
      html.removeAttribute('data-theme')
    }
  }
}
