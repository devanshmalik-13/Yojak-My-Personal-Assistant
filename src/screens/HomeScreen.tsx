import { useMemo } from 'react'
import { Bell, BookOpen, CalendarDays, ChevronRight, ClipboardCheck, Settings, Trophy, Wallet } from 'lucide-react'
import { useApp, useAttendanceStats } from '../store'
import type { NavTab } from '../types'
import { localToday } from '../services/validation'

interface Props {
  nav: { onSearch: () => void; onAlerts: () => void; onSettings: () => void; onProfile: () => void; unread: number; name: string }
  onNavigate: (tab: NavTab) => void
}

const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

function greetingWord() {
  const hour = new Date().getHours()
  if (hour < 12) return 'Good morning,'
  if (hour < 17) return 'Good afternoon,'
  return 'Good evening,'
}

function currentWeek() {
  const now = new Date()
  const monday = new Date(now)
  monday.setHours(0, 0, 0, 0)
  monday.setDate(now.getDate() - (now.getDay() === 0 ? 6 : now.getDay() - 1))
  return Array.from({ length: 7 }, (_, index) => {
    const value = new Date(monday)
    value.setDate(monday.getDate() + index)
    return value
  })
}

export default function HomeScreen({ nav, onNavigate }: Props) {
  const { state } = useApp()
  const { overall, counted, present } = useAttendanceStats(state)
  const now = new Date()
  const today = localToday()
  const dayOfWeek = now.getDay() === 0 ? 7 : now.getDay()
  const week = useMemo(currentWeek, [today])
  const todaySlots = useMemo(
    () => state.timetable.filter(slot => slot.dayOfWeek === dayOfWeek).sort((a, b) => a.period - b.period),
    [state.timetable, dayOfWeek],
  )
  const pending = state.assignments.filter(item => item.status !== 'completed').length
  const done = state.assignments.filter(item => item.status === 'completed').length
  const activeCompetitions = state.competitions.filter(item => item.status === 'upcoming').length
  const activeReminders = state.reminders.filter(item => item.enabled !== false).length
  const monthKey = today.slice(0, 7)
  const monthSpend = state.transactions
    .filter(item => item.type === 'expense' && item.date.startsWith(monthKey))
    .reduce((sum, item) => sum + item.amount, 0)

  const semesterWeeks = (() => {
    const start = new Date(`${state.timetableActiveFrom}T00:00:00`)
    const end = new Date(`${state.timetableActiveTo}T00:00:00`)
    return Number.isFinite(start.getTime()) && Number.isFinite(end.getTime()) && end > start
      ? Math.max(1, Math.round((end.getTime() - start.getTime()) / (7 * 86400000)))
      : 16
  })()
  const totalSemesterClasses = state.timetable.length * semesterWeeks
  const skipAllowance = Math.floor(totalSemesterClasses * (1 - state.attendanceThreshold / 100))
  const skipped = state.attendanceRecords.filter(item => item.status === 'absent').length
  const skipsLeft = Math.max(0, skipAllowance - skipped)

  const dateLabel = now.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })
  const initials = state.profile.name.split(' ').map(value => value[0]).slice(0, 2).join('').toUpperCase() || 'A'

  return (
    <div className="flex flex-col pb-8 ledger-grid min-h-full">
      <header className="px-5 pb-4 relative" style={{ paddingTop: 'max(3rem, env(safe-area-inset-top))' }}>
        <p className="font-display text-sm text-fg-soft mb-0.5">{greetingWord()}</p>
        <h1 className="ledger-title font-bold text-[2.65rem] leading-none text-fg">My Day</h1>
        <p className="font-display text-sm text-muted-fg mt-1.5">{dateLabel}</p>
        <div className="absolute right-5 top-[max(3rem,env(safe-area-inset-top))] flex items-center gap-2">
          <button onClick={nav.onAlerts} className="relative w-9 h-9 rounded-full flex items-center justify-center text-fg active:bg-muted" aria-label="Notifications">
            <Bell size={18} strokeWidth={1.8} />
            {nav.unread > 0 && <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-danger" />}
          </button>
          <button onClick={nav.onSettings} className="w-9 h-9 rounded-full flex items-center justify-center text-fg active:bg-muted" aria-label="Settings">
            <Settings size={18} strokeWidth={1.8} />
          </button>
          <button onClick={nav.onProfile} className="w-9 h-9 rounded-full bg-primary text-white dark:text-[#062117] border border-primary/30 flex items-center justify-center text-xs font-bold shadow-sm" aria-label="Profile">{initials}</button>
        </div>
      </header>

      <section className="px-5 mb-4">
        <div className="grid grid-cols-7 gap-1.5">
          {week.map((date, index) => {
            const selected = date.toDateString() === now.toDateString()
            return <div key={date.toISOString()} className={`rounded-xl border py-2 text-center ${selected ? 'bg-primary text-white dark:text-[#062117] border-primary' : 'bg-card border-border'}`}>
              <p className={`text-[8px] font-bold uppercase ${selected ? 'opacity-80' : 'text-muted-fg'}`}>{DAY_LABELS[index]}</p>
              <p className="font-display font-bold text-sm leading-tight">{date.getDate()}</p>
              <span className={`block mx-auto mt-1 w-1.5 h-1.5 rounded-full ${selected ? 'bg-warning' : index % 3 === 1 ? 'bg-[#368DE8]' : index % 3 === 2 ? 'bg-success' : 'bg-border'}`} />
            </div>
          })}
        </div>
      </section>

      <section className="px-5 mb-5">
        <button onClick={() => onNavigate('attendance')} className="ledger-card w-full p-4 text-left active:scale-[0.99] transition-transform">
          <div className="flex items-center gap-4">
            <div className="relative w-[72px] h-[72px] shrink-0 rounded-full flex items-center justify-center" style={{ background: `conic-gradient(var(--primary) ${Math.min(100, overall) * 3.6}deg, var(--muted) 0deg)` }}>
              <div className="w-[56px] h-[56px] rounded-full bg-card flex items-center justify-center"><span className="font-display font-bold text-lg text-fg">{overall.toFixed(0)}%</span></div>
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-display font-bold text-lg text-fg">Attendance</p>
              <p className="text-xs text-fg-soft mt-1">{present} present out of {counted} counted classes</p>
            </div>
            <ChevronRight size={18} className="text-fg" />
          </div>
          <div className="grid grid-cols-2 gap-2 mt-4">
            <div className="bg-primary-soft rounded-xl px-3 py-2.5 border border-primary/10"><strong className="font-display text-lg text-primary">{skipsLeft}</strong><p className="text-[10px] text-fg-soft">skips left this semester</p></div>
            <div className="bg-muted rounded-xl px-3 py-2.5 border border-border"><strong className="font-display text-lg text-fg">{skipped}/{skipAllowance}</strong><p className="text-[10px] text-fg-soft">used</p></div>
          </div>
        </button>
      </section>

      <section className="px-5 mb-5">
        <div className="flex items-baseline justify-between mb-2.5">
          <h2 className="font-display font-bold text-xl text-fg">Today's Classes</h2>
          <button onClick={() => onNavigate('attendance')} className="text-xs font-semibold text-primary">{todaySlots.length} class{todaySlots.length === 1 ? '' : 'es'}</button>
        </div>
        {todaySlots.length === 0 ? (
          <div className="ledger-card px-4 py-6 text-center"><p className="font-display font-semibold text-fg">No classes today</p><p className="text-xs text-muted-fg mt-1">Your schedule is clear.</p></div>
        ) : (
          <div className="relative pl-[54px]">
            <div className="absolute left-[49px] top-4 bottom-4 w-px bg-border" />
            <div className="flex flex-col gap-2">
              {todaySlots.map(slot => {
                const subject = state.subjects.find(item => item.id === slot.subjectId)
                return <button key={slot.id} onClick={() => onNavigate('attendance')} className="relative ledger-card px-3.5 py-3 text-left flex items-center gap-3 active:scale-[0.99] transition-transform">
                  <div className="absolute -left-[54px] top-1/2 -translate-y-1/2 w-10 text-left"><p className="font-display text-sm text-fg">{slot.startTime}</p><p className="text-[9px] text-muted-fg">P{slot.period}</p></div>
                  <span className="absolute -left-[8px] top-1/2 -translate-y-1/2 w-2.5 h-2.5 rounded-full ring-4 ring-bg" style={{ backgroundColor: subject?.color || 'var(--primary)' }} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2"><span className="text-[11px] text-fg-soft">P{slot.period}</span><strong className="text-sm text-fg truncate">{subject?.shortName || subject?.name}</strong></div>
                    <p className="text-[10px] text-muted-fg truncate">{slot.room || 'Room TBA'}{slot.teacher ? ` · ${slot.teacher}` : ''}</p>
                  </div>
                  <ChevronRight size={15} className="text-muted-fg shrink-0" />
                </button>
              })}
            </div>
          </div>
        )}
      </section>

      <section className="px-5 mb-5 grid grid-cols-2 gap-2.5">
        <QuickCard icon={<ClipboardCheck size={17} />} color="text-warning" title="Assignments" detail={`${pending} Pending`} sub={`${done} Done`} onClick={() => onNavigate('assignments')} />
        <QuickCard icon={<CalendarDays size={17} />} color="text-primary" title="Schedule" detail="This Week" sub={`${state.timetable.length} periods`} onClick={() => onNavigate('attendance')} />
        <QuickCard icon={<Bell size={17} />} color="text-danger" title="Reminders" detail={activeReminders ? `${activeReminders} active` : 'No reminders'} sub={activeReminders ? 'Stay prepared' : 'All clear'} onClick={nav.onAlerts} />
        <QuickCard icon={<Trophy size={17} />} color="text-warning" title="Competitions" detail={activeCompetitions ? `${activeCompetitions} upcoming` : 'Explore events'} sub={activeCompetitions ? 'Open now' : 'Nothing pending'} onClick={() => onNavigate('competitions')} />
      </section>

      <section className="px-5">
        <button onClick={() => onNavigate('expense')} className="ledger-card w-full px-4 py-3.5 flex items-center gap-3 text-left active:scale-[0.99] transition-transform">
          <div className="w-9 h-9 rounded-lg bg-primary-soft flex items-center justify-center text-primary"><Wallet size={17} /></div>
          <div className="flex-1"><p className="font-display font-bold text-base text-fg">Expenses</p><p className="text-[10px] text-muted-fg">Track your spending</p></div>
          <p className="font-display font-bold text-fg">₹{monthSpend.toLocaleString('en-IN')}</p>
          <ChevronRight size={15} className="text-muted-fg" />
        </button>
      </section>
    </div>
  )
}

function QuickCard({ icon, color, title, detail, sub, onClick }: { icon: React.ReactNode; color: string; title: string; detail: string; sub: string; onClick: () => void }) {
  return <button onClick={onClick} className="ledger-card p-3.5 text-left active:scale-[0.98] transition-transform">
    <div className="flex items-center gap-2 mb-2"><span className={color}>{icon}</span><p className="font-display font-bold text-sm text-fg">{title}</p><ChevronRight size={13} className="text-muted-fg ml-auto" /></div>
    <p className="text-xs font-semibold text-fg-soft">{detail}</p><p className="text-[10px] text-muted-fg mt-0.5">{sub}</p>
  </button>
}
