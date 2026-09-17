import { useEffect, useState } from 'react'
import { Plus, Bell, Repeat, Clock, Trash2, ChevronLeft, Settings } from 'lucide-react'
import { useApp, uid } from '../store'
import type { Reminder, Frequency } from '../types'
import { Sheet, Dialog, Snackbar } from '../components/ui'
import { isValidLocalDate } from '../services/validation'

const FREQ_LABELS: Record<Frequency, string> = {
  once: 'Once', daily: 'Daily', weekly: 'Weekly', monthly: 'Monthly', yearly: 'Yearly',
}

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
const HOURS   = Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, '0'))
const MINUTES = ['00','15','30','45']

function nextOccurrence(r: Reminder): string {
  if (r.frequency === 'once') {
    const d = new Date(`${r.date}T${r.time}`)
    return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) + ' • ' + formatTime(r.time)
  }
  if (r.frequency === 'daily') return `Daily • ${formatTime(r.time)}`
  if (r.frequency === 'weekly') {
    const d = new Date(`${r.date}T00:00`)
    const days = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday']
    return `Every ${days[d.getDay()]} • ${formatTime(r.time)}`
  }
  if (r.frequency === 'monthly') return `Monthly • ${formatTime(r.time)}`
  return `Yearly • ${formatTime(r.time)}`
}

function formatTime(t: string) {
  const [hh, mm] = t.split(':').map(Number)
  const ampm = hh >= 12 ? 'PM' : 'AM'
  const h = hh % 12 || 12
  return `${h}:${String(mm).padStart(2, '0')} ${ampm}`
}

/* ── Form — lives OUTSIDE the screen so React never re-mounts it ── */
interface ReminderFormProps {
  formMsg: string; setFormMsg: (v: string) => void
  formDay: string; setFormDay: (v: string) => void
  formMonth: string; setFormMonth: (v: string) => void
  formYear: string; setFormYear: (v: string) => void
  formHour: string; setFormHour: (v: string) => void
  formMin: string; setFormMin: (v: string) => void
  formAmPm: string; setFormAmPm: (v: string) => void
  formFreq: Frequency; setFormFreq: (v: Frequency) => void
  formError: string
  isEdit: boolean
  onSave: () => void
  years: string[]
}

function ReminderForm({
  formMsg, setFormMsg, formDay, setFormDay, formMonth, setFormMonth,
  formYear, setFormYear, formHour, setFormHour, formMin, setFormMin,
  formAmPm, setFormAmPm, formFreq, setFormFreq, formError, isEdit, onSave, years,
}: ReminderFormProps) {
  const daysInMonth = new Date(Number(formYear), Number(formMonth) + 1, 0).getDate()
  const days = Array.from({ length: daysInMonth }, (_, i) => String(i + 1))
  return (
    <div className="flex flex-col gap-4">
      {formError && <p className="text-sm text-danger bg-danger/10 px-3 py-2 rounded-xl">{formError}</p>}

      <div>
        <label className="block text-xs font-medium text-muted-fg mb-1.5">Message *</label>
        <textarea
          className="w-full px-4 py-3 rounded-xl border border-border bg-muted text-fg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 placeholder:text-muted-fg/50 resize-none"
          placeholder="What should I notify you about?"
          rows={3}
          value={formMsg}
          onChange={e => setFormMsg(e.target.value)}
        />
      </div>

      <div>
        <label className="block text-xs font-medium text-muted-fg mb-1.5">Date</label>
        <div className="flex gap-2">
          <select value={formDay} onChange={e => setFormDay(e.target.value)}
            className="flex-1 px-3 py-3 rounded-xl border border-border bg-muted text-fg text-sm focus:outline-none">
            {days.map(d => <option key={d} value={d}>{d}</option>)}
          </select>
          <select value={formMonth} onChange={e => setFormMonth(e.target.value)}
            className="flex-1 px-3 py-3 rounded-xl border border-border bg-muted text-fg text-sm focus:outline-none">
            {MONTHS.map((m, i) => <option key={i} value={String(i)}>{m}</option>)}
          </select>
          <select value={formYear} onChange={e => setFormYear(e.target.value)}
            className="flex-1 px-3 py-3 rounded-xl border border-border bg-muted text-fg text-sm focus:outline-none">
            {years.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
      </div>

      <div>
        <label className="block text-xs font-medium text-muted-fg mb-1.5">Time</label>
        <div className="flex gap-2">
          <select value={formHour} onChange={e => setFormHour(e.target.value)}
            className="flex-1 px-3 py-3 rounded-xl border border-border bg-muted text-fg text-sm focus:outline-none">
            {HOURS.map(h => <option key={h} value={h}>{h}</option>)}
          </select>
          <select value={formMin} onChange={e => setFormMin(e.target.value)}
            className="flex-1 px-3 py-3 rounded-xl border border-border bg-muted text-fg text-sm focus:outline-none">
            {MINUTES.map(m => <option key={m} value={m}>{m}</option>)}
          </select>
          <div className="flex rounded-xl border border-border overflow-hidden bg-muted">
            {['AM','PM'].map(p => (
              <button key={p} onClick={() => setFormAmPm(p)}
                className={`px-3 py-3 text-sm font-semibold transition-colors ${formAmPm === p ? 'bg-primary text-white' : 'text-fg'}`}>
                {p}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div>
        <label className="block text-xs font-medium text-muted-fg mb-1.5">Frequency</label>
        <div className="flex gap-2 flex-wrap">
          {(Object.keys(FREQ_LABELS) as Frequency[]).map(f => (
            <button key={f} onClick={() => setFormFreq(f)}
              className={`px-3 py-2 rounded-xl border text-xs font-semibold transition-all ${formFreq === f ? 'border-primary bg-primary/10 text-primary' : 'border-border bg-muted text-fg'}`}>
              {FREQ_LABELS[f]}
            </button>
          ))}
        </div>
      </div>

      <button onClick={onSave}
        className="w-full py-4 bg-primary text-white font-semibold rounded-2xl shadow-md shadow-primary/25 active:opacity-90 transition-all mt-2">
        {isEdit ? 'Update Reminder' : 'Add Reminder'}
      </button>
    </div>
  )
}

/* ── Main screen ── */
export default function NotifierScreen({ onBack, onSettings, onProfile, name }: { onBack: () => void; onSettings: () => void; onProfile: () => void; name: string }) {
  const { state, dispatch } = useApp()
  const [addSheet, setAddSheet]       = useState(false)
  const [editReminder, setEditReminder] = useState<Reminder | null>(null)
  const [deleteDialog, setDeleteDialog] = useState<string | null>(null)
  const [clearDialog, setClearDialog] = useState(false)
  const [snack, setSnack]             = useState('')

  useEffect(() => { void dispatch({ type: 'READ_ALL_ALERTS' }) }, [])

  const today = new Date()
  const years = Array.from({ length: 5 }, (_, i) => String(today.getFullYear() + i))

  // ── Shared form state ──
  const [formMsg,   setFormMsg]   = useState('')
  const [formDay,   setFormDay]   = useState(String(today.getDate()))
  const [formMonth, setFormMonth] = useState(String(today.getMonth()))
  const [formYear,  setFormYear]  = useState(String(today.getFullYear()))
  const [formHour,  setFormHour]  = useState('08')
  const [formMin,   setFormMin]   = useState('00')
  const [formAmPm,  setFormAmPm]  = useState('AM')
  const [formFreq,  setFormFreq]  = useState<Frequency>('once')
  const [formError, setFormError] = useState('')

  useEffect(() => {
    const max = new Date(Number(formYear), Number(formMonth) + 1, 0).getDate()
    if (Number(formDay) > max) setFormDay(String(max))
  }, [formMonth, formYear, formDay])

  const show = (msg: string) => { setSnack(msg); setTimeout(() => setSnack(''), 3500) }

  const resetForm = () => {
    setFormMsg(''); setFormDay(String(today.getDate())); setFormMonth(String(today.getMonth()))
    setFormYear(String(today.getFullYear())); setFormHour('08'); setFormMin('00')
    setFormAmPm('AM'); setFormFreq('once'); setFormError('')
  }

  const getDate = () => {
    const m = String(Number(formMonth) + 1).padStart(2, '0')
    const d = String(Number(formDay)).padStart(2, '0')
    return `${formYear}-${m}-${d}`
  }

  const getTime = () => {
    let h = Number(formHour)
    if (formAmPm === 'PM' && h !== 12) h += 12
    if (formAmPm === 'AM' && h === 12) h = 0
    return `${String(h).padStart(2, '0')}:${formMin}`
  }

  const openAdd = () => { resetForm(); setAddSheet(true) }

  const openEdit = (r: Reminder) => {
    const d = new Date(`${r.date}T00:00`)
    setFormMsg(r.message)
    setFormDay(String(d.getDate()))
    setFormMonth(String(d.getMonth()))
    setFormYear(String(d.getFullYear()))
    const [hh, mm] = r.time.split(':').map(Number)
    setFormAmPm(hh >= 12 ? 'PM' : 'AM')
    setFormHour(String(hh % 12 || 12).padStart(2, '0'))
    setFormMin(String(mm).padStart(2, '0'))
    setFormFreq(r.frequency)
    setFormError('')
    setEditReminder(r)
  }

  const save = () => {
    if (!formMsg.trim()) { setFormError('Please write a reminder message'); return }
    if (!isValidLocalDate(getDate())) { setFormError('Please choose a valid date'); return }
    if (formFreq === 'once' && new Date(`${getDate()}T${getTime()}`) <= new Date()) { setFormError('A one-time reminder must be in the future'); return }
    if (editReminder) {
      dispatch({ type: 'UPDATE_REMINDER', id: editReminder.id, changes: { message: formMsg, date: getDate(), time: getTime(), frequency: formFreq } })
      setEditReminder(null)
      resetForm()
      show('Reminder updated')
    } else {
      dispatch({ type: 'ADD_REMINDER', reminder: { id: uid(), message: formMsg, date: getDate(), time: getTime(), frequency: formFreq } })
      setAddSheet(false)
      resetForm()
      show('Reminder added')
    }
  }

  const formProps = {
    formMsg, setFormMsg, formDay, setFormDay, formMonth, setFormMonth,
    formYear, setFormYear, formHour, setFormHour, formMin, setFormMin,
    formAmPm, setFormAmPm, formFreq, setFormFreq, formError, years,
    onSave: save,
  }

  const alertIcon: Record<string, string> = {
    attendance: '📅', assignment: '📚', competition: '🏆', reminder: '🔔', system: '✨',
  }
  const initials = name.split(' ').map(value => value[0]).slice(0, 2).join('').toUpperCase() || '?'

  return (
    <div className="h-dvh bg-bg overflow-y-auto anim-fadeUp ledger-grid">
      <div className="px-5 safe-top pb-4 flex items-center gap-3 border-b border-border bg-bg/95 backdrop-blur-xl sticky top-0 z-20">
        <button onClick={onBack} className="w-9 h-9 rounded-2xl bg-muted flex items-center justify-center text-muted-fg active:opacity-60" aria-label="Back">
          <ChevronLeft size={18} />
        </button>
        <h1 className="font-display font-bold text-xl text-fg flex-1">Notifications</h1>
        <button onClick={onSettings} className="w-9 h-9 rounded-xl bg-muted border border-border flex items-center justify-center text-fg-soft" aria-label="Settings"><Settings size={16} /></button>
        <button onClick={onProfile} className="w-9 h-9 rounded-xl bg-primary text-white dark:text-[#062117] flex items-center justify-center text-xs font-bold" aria-label="Profile">{initials}</button>
        <button onClick={openAdd} className="flex items-center gap-1.5 bg-primary text-white text-xs font-semibold px-3 py-2.5 rounded-xl shadow-md shadow-primary/20 active:opacity-90" aria-label="Add reminder">
          <Plus size={15} /> Add
        </button>
      </div>

      <div className="px-5 py-5 pb-28 max-w-md mx-auto flex flex-col gap-7">
        <section>
          <div className="flex items-center justify-between mb-3">
            <div>
              <h2 className="font-display font-semibold text-lg text-fg">Reminders</h2>
              <p className="text-xs text-muted-fg mt-0.5">Scheduled notifications and repeating plans</p>
            </div>
            {state.reminders.length > 0 && (
              <button onClick={() => setClearDialog(true)} className="w-8 h-8 rounded-xl bg-danger/10 text-danger flex items-center justify-center" aria-label="Remove all reminder data">
                <Trash2 size={14} />
              </button>
            )}
          </div>

          {state.reminders.length === 0 ? (
            <button onClick={openAdd} className="w-full border border-dashed border-border rounded-2xl px-5 py-7 text-center bg-card/60 active:bg-muted">
              <div className="w-10 h-10 rounded-2xl bg-primary/10 text-primary flex items-center justify-center mx-auto mb-2"><Bell size={18} /></div>
              <p className="font-semibold text-sm text-fg">No reminders yet</p>
              <p className="text-xs text-muted-fg mt-1">Tap to add your first reminder.</p>
            </button>
          ) : (
            <div className="flex flex-col gap-3">
              {[...state.reminders].sort((a, b) => `${a.date}T${a.time}`.localeCompare(`${b.date}T${b.time}`)).map(r => (
              <div key={r.id} onClick={() => openEdit(r)}
                className="bg-card border border-border rounded-2xl p-4 text-left active:scale-[0.98] transition-transform w-full cursor-pointer">
                <div className="flex items-start gap-3">
                  <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                    <Bell size={16} className="text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm text-fg leading-snug line-clamp-2">{r.message}</p>
                    <div className="flex items-center gap-1 mt-2 text-muted-fg">
                      <Clock size={11} />
                      <span className="text-xs">{nextOccurrence(r)}</span>
                    </div>
                    {r.frequency !== 'once' && (
                      <div className="flex items-center gap-1 mt-1 text-primary">
                        <Repeat size={11} />
                        <span className="text-xs font-medium">{FREQ_LABELS[r.frequency]}</span>
                      </div>
                    )}
                  </div>
                  <button onClick={e => { e.stopPropagation(); setDeleteDialog(r.id) }}
                    className="p-2 text-muted-fg hover:text-danger transition-colors shrink-0">
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            ))}
            </div>
          )}
        </section>

        <section>
          <div className="mb-3">
            <h2 className="font-display font-semibold text-lg text-fg">Activity</h2>
            <p className="text-xs text-muted-fg mt-0.5">Attendance, assignment and event updates</p>
          </div>
          {state.alerts.length === 0 ? (
            <div className="rounded-2xl border border-border bg-card px-5 py-7 text-center">
              <p className="font-semibold text-sm text-fg">All caught up</p>
              <p className="text-xs text-muted-fg mt-1">No activity notifications right now.</p>
            </div>
          ) : (
            <div className="flex flex-col gap-2.5">
              {[...state.alerts].sort((a, b) => b.timestamp.localeCompare(a.timestamp)).map(alert => (
                <div key={alert.id} className={`rounded-2xl p-4 border ${alert.read ? 'bg-card border-border' : 'bg-primary-soft border-primary/20'}`}>
                  <div className="flex items-start gap-3">
                    <span className="text-xl shrink-0 mt-0.5">{alertIcon[alert.alertType] || '🔔'}</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <p className="font-semibold text-sm text-fg leading-tight">{alert.title}</p>
                        {!alert.read && <span className="w-1.5 h-1.5 rounded-full bg-primary shrink-0" />}
                      </div>
                      <p className="text-xs text-muted-fg leading-relaxed">{alert.message}</p>
                      <p className="text-[10px] text-muted-fg/60 mt-1.5">
                        {new Date(alert.timestamp).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                        {' · '}
                        {new Date(alert.timestamp).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true })}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      {/* Add sheet */}
      <Sheet open={addSheet} onClose={() => { setAddSheet(false); resetForm() }} title="New Reminder">
        <div className="px-5 py-4 pb-8">
          <ReminderForm {...formProps} isEdit={false} />
        </div>
      </Sheet>

      {/* Edit sheet */}
      <Sheet open={!!editReminder} onClose={() => { setEditReminder(null); resetForm() }} title="Edit Reminder">
        <div className="px-5 py-4 pb-8">
          <ReminderForm {...formProps} isEdit={true} />
        </div>
      </Sheet>

      <Dialog
        open={!!deleteDialog}
        onClose={() => setDeleteDialog(null)}
        title="Delete reminder?"
        message="This reminder will be permanently removed."
        confirmLabel="Delete"
        confirmVariant="danger"
        onConfirm={() => {
          if (deleteDialog) dispatch({ type: 'DELETE_REMINDER', id: deleteDialog })
          setDeleteDialog(null)
          show('Reminder deleted')
        }}
      />
      <Dialog open={clearDialog} onClose={() => setClearDialog(false)} title="Remove all reminder data?" message="This permanently removes every reminder and cancels its notification." confirmLabel="Remove All" confirmVariant="danger" onConfirm={() => { void dispatch({ type: 'CLEAR_REMINDERS' }); setClearDialog(false); setEditReminder(null); show('All reminder data removed') }} />

      <Snackbar message={snack} show={!!snack} onDismiss={() => setSnack('')} />
    </div>
  )
}
