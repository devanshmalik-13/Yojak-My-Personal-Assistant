import { useState, useMemo, useRef, useEffect } from 'react'
import { ChevronLeft, ChevronRight, AlertTriangle, Upload, Calendar, Camera, Trash2 } from 'lucide-react'
import { useApp, useAttendanceStats, uid } from '../store'
import type { AttendanceStatus } from '../types'
import { ProgressBar, SectionHeader, Sheet, Snackbar, Dialog } from '../components/ui'
import ScreenHeader, { type HeaderNav } from '../components/ScreenHeader'
import ChangeTimetableFlow from '../components/ChangeTimetableFlow'
import { formatLocalDate } from '../services/validation'
import { getCurrentTimetableSubjects } from '../services/timetableService'
import { useBackHandler } from '../hooks/useBackHandler'
import SubjectOverviewSheet from '../components/SubjectOverviewSheet'

const DAY_NAMES  = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun']
const FULL_DAYS  = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday']

function getWeekDates(weekOffset: number) {
  const today = new Date()
  const dow = today.getDay()
  const monday = new Date(today)
  monday.setDate(today.getDate() - (dow === 0 ? 6 : dow - 1) + weekOffset * 7)
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday)
    d.setDate(monday.getDate() + i)
    return d
  })
}

const STATUS_CONFIG: Record<AttendanceStatus, { label: string; dot: string; text: string; bg: string; border: string }> = {
  present:   { label:'Present',   dot:'bg-success',    text:'text-success',    bg:'bg-success/10',    border:'border-success/20'  },
  absent:    { label:'Absent',    dot:'bg-danger',     text:'text-danger',     bg:'bg-danger/10',     border:'border-danger/20'   },
  cancelled: { label:'Cancelled', dot:'bg-muted-fg',   text:'text-muted-fg',  bg:'bg-muted',         border:'border-border'      },
  changed:   { label:'Changed',   dot:'bg-warning',    text:'text-warning',   bg:'bg-warning/10',    border:'border-warning/20'  },
  unmarked:  { label:'Unmarked',  dot:'bg-muted-fg',   text:'text-muted-fg',  bg:'bg-muted',         border:'border-border'      },
}

function StatusBadge({ status }: { status: AttendanceStatus }) {
  const c = STATUS_CONFIG[status]
  return (
    <span className={`inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full ${c.text} ${c.bg}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${c.dot}`} />
      {c.label}
    </span>
  )
}

export default function AttendanceScreen({ nav }: { nav: HeaderNav }) {
  const { state, dispatch } = useApp()
  const { overall, present, counted, bySubject, impact } = useAttendanceStats(state)
  const [weekOffset, setWeekOffset]   = useState(0)
  const [selectedDay, setSelectedDay] = useState<Date | null>(null)
  const [showSubjects, setShowSubjects] = useState(false)
  const [subjectDetailId, setSubjectDetailId] = useState<string | null>(null)
  const [clearDialog, setClearDialog] = useState(false)
  const [changeSheet, setChangeSheet] = useState<{ date: string; subjectId: string } | null>(null)
  const [changeSearch, setChangeSearch] = useState('')
  const [snack, setSnack]             = useState('')
  const [lastAction, setLastAction]   = useState<{ date: string; subjectId: string; prevStatus: AttendanceStatus } | null>(null)
  const snackTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => () => { if (snackTimer.current) clearTimeout(snackTimer.current) }, [])

  const showSnack = (msg: string) => {
    setSnack(msg)
    if (snackTimer.current) clearTimeout(snackTimer.current)
    snackTimer.current = setTimeout(() => setSnack(''), 4000)
  }
  const [showChangeTimetable, setShowChangeTimetable] = useState(false)
  useBackHandler(showChangeTimetable, () => { setShowChangeTimetable(false); return true })
  const currentSubjects = useMemo(
    () => getCurrentTimetableSubjects(state.subjects, state.timetable),
    [state.subjects, state.timetable],
  )

  const weekDates = useMemo(() => getWeekDates(weekOffset), [weekOffset])
  const today     = new Date()
  const threshold = state.attendanceThreshold

  const t = threshold / 100

  // ── Semester-wide skip budget ──────────────────────────────────────────────
  // Total periods per week from timetable
  const periodsPerWeek = state.timetable.length
  // Semester duration in weeks from stored dates
  const semStart = new Date(state.timetableActiveFrom)
  const semEnd   = new Date(state.timetableActiveTo)
  const hasConfiguredSemester = Number.isFinite(semStart.getTime()) && Number.isFinite(semEnd.getTime()) && semEnd > semStart
  const semWeeks = hasConfiguredSemester
    ? Math.max(1, Math.round((semEnd.getTime() - semStart.getTime()) / (7 * 86400000)))
    : 16
  const totalSemesterClasses = periodsPerWeek * semWeeks
  // Max skippable for whole semester at current threshold
  const totalSkippable = Math.floor(totalSemesterClasses * (1 - t))
  // Already skipped (absent only — cancelled doesn't count against you)
  const alreadySkipped = state.attendanceRecords.filter(r => r.status === 'absent').length
  const skipsLeft = Math.max(0, totalSkippable - alreadySkipped)

  // Classes needed to recover if below threshold (based on actual records so far)
  const classesNeeded = overall < threshold
    ? Math.ceil((t * counted - present) / (1 - t))
    : 0

  const getDateStr  = (d: Date) => formatLocalDate(d)
  const getRecord   = (date: string, subjectId: string) =>
    state.attendanceRecords.find(r => r.date === date && r.subjectId === subjectId)
  const getDaySlots = (date: Date) => {
    const dow = date.getDay() === 0 ? 7 : date.getDay()
    return state.timetable.filter(t => t.dayOfWeek === dow).sort((a, b) => a.period - b.period)
  }

  const markAttendance = (date: string, subjectId: string, status: AttendanceStatus) => {
    const existing = getRecord(date, subjectId)
    setLastAction({ date, subjectId, prevStatus: existing?.status || 'unmarked' })
    dispatch({ type: 'MARK_ATTENDANCE', record: { id: uid(), date, subjectId, status } })
    showSnack(`Marked ${STATUS_CONFIG[status].label}`)
  }

  const undoMark = () => {
    if (!lastAction) return
    dispatch({ type: 'MARK_ATTENDANCE', record: { id: uid(), ...lastAction, status: lastAction.prevStatus } })
    setSnack(''); setLastAction(null)
  }

  const filteredSubjects = changeSearch
    ? currentSubjects.filter(s =>
        s.name.toLowerCase().includes(changeSearch.toLowerCase()) ||
        s.shortName.toLowerCase().includes(changeSearch.toLowerCase())
      )
    : currentSubjects

  /* ── Show change timetable flow ── */
  if (showChangeTimetable) {
    return <ChangeTimetableFlow onClose={() => setShowChangeTimetable(false)} />
  }

  /* ── Timetable not set up ── */
  if (!state.timetableSetup) {
    return (
      <div className="flex flex-col min-h-full">
        <ScreenHeader title="Attendance" {...nav} />
        <div className="flex-1 flex flex-col items-center justify-center px-8 text-center py-12">
          <div className="w-20 h-20 rounded-3xl bg-primary/10 flex items-center justify-center mb-5">
            <Calendar size={36} className="text-primary" />
          </div>
          <h2 className="font-display font-bold text-xl text-fg mb-2">Set up your timetable</h2>
          <p className="text-sm text-muted-fg mb-6 max-w-xs">Upload your timetable to start tracking attendance. PDF, PNG or JPG.</p>
          <div className="bg-primary-soft border border-primary/15 rounded-2xl p-4 text-left mb-6 w-full max-w-xs">
            <p className="text-xs text-fg-soft">
              💡 <strong className="text-fg">Tip:</strong> Upload a clear screenshot or a single-page PDF for best results.
            </p>
          </div>
          <button
            onClick={() => setShowChangeTimetable(true)}
            className="flex items-center gap-3 bg-primary text-white font-semibold py-4 px-8 rounded-2xl shadow-lg shadow-primary/25 active:opacity-90 transition-all">
            <Upload size={18} /> Upload Timetable
          </button>
        </div>
      </div>
    )
  }

  const changeTimetableBtn = (
    <div className="flex items-center gap-1">
      {state.attendanceRecords.length > 0 && <button onClick={() => setClearDialog(true)} className="w-8 h-8 min-[390px]:w-9 min-[390px]:h-9 rounded-2xl bg-danger/10 text-danger flex items-center justify-center" aria-label="Remove all attendance data"><Trash2 size={15} /></button>}
      <button
        onClick={() => setShowChangeTimetable(true)}
        className="w-9 h-9 rounded-2xl bg-muted flex items-center justify-center text-muted-fg active:bg-border transition-colors"
        aria-label="Change timetable"
      >
        <Camera size={16} strokeWidth={2} />
      </button>
    </div>
  )

  return (
    <div className="flex flex-col">
      <ScreenHeader title="Attendance" {...nav} action={changeTimetableBtn} />

      {/* ── Overall card ── */}
      <div className="mx-5 mb-4">
        <div className="bg-card border border-border rounded-2xl p-5 card-shadow">
          <div className="flex items-end justify-between mb-3">
            <div>
              <p className="label-micro text-muted-fg mb-2">Overall Attendance</p>
              <div className="flex items-baseline gap-0.5">
                <span className="font-display font-black text-fg num-tight" style={{ fontSize: '3.2rem' }}>{overall.toFixed(1)}</span>
                <span className="font-display font-bold text-2xl text-muted-fg ml-0.5">%</span>
              </div>
            </div>
            {overall < threshold ? (
              <div className="flex items-center gap-1.5 bg-danger/10 text-danger px-3 py-1.5 rounded-full border border-danger/15">
                <AlertTriangle size={12} strokeWidth={2.5} />
                <span className="text-xs font-bold">Below {threshold}%</span>
              </div>
            ) : overall < threshold + 5 ? (
              <div className="flex items-center gap-1.5 bg-warning/10 text-warning px-3 py-1.5 rounded-full border border-warning/15">
                <AlertTriangle size={12} strokeWidth={2.5} />
                <span className="text-xs font-bold">Near limit</span>
              </div>
            ) : (
              <div className="flex items-center gap-1.5 bg-success/10 text-success px-3 py-1.5 rounded-full border border-success/15">
                <span className="text-xs font-bold">✓ On track</span>
              </div>
            )}
          </div>
          <ProgressBar value={overall} threshold={threshold} height="h-3" />
          <div className="flex items-center justify-between mt-3 pt-3 border-t border-border">
            <p className="text-xs text-muted-fg">
              {state.attendanceRecords.filter(r => r.status === 'present').length} present ·{' '}
              {state.attendanceRecords.filter(r => r.status === 'absent').length} absent ·{' '}
              {state.attendanceRecords.filter(r => r.status === 'cancelled').length} cancelled
            </p>
          </div>
          <div className="mt-3 bg-primary-soft rounded-xl px-3 py-2.5">
            <p className="text-xs text-fg-soft">
              Each class changes your attendance by <strong className="text-primary font-semibold">{impact.toFixed(2)}%</strong>
            </p>
          </div>
        </div>
      </div>

      {/* ── Semester skip budget box ── */}
      <div className="mx-5 mb-4">
        <div className={`border rounded-2xl p-4 ${skipsLeft === 0 ? 'bg-danger/10 border-danger/20' : skipsLeft <= 3 ? 'bg-warning/10 border-warning/20' : 'bg-card border-border card-shadow'}`}>
          {/* Header row */}
          <div className="flex items-center justify-between mb-3">
            <p className="label-micro text-muted-fg">Semester Skip Budget</p>
            <span className="text-[10px] text-muted-fg bg-muted px-2 py-0.5 rounded-full">{threshold}% threshold</span>
          </div>

          {/* Big number */}
          <div className="flex items-end gap-3 mb-3">
            <div>
              <span className={`font-display font-black num-tight leading-none ${
                skipsLeft === 0 ? 'text-danger' : skipsLeft <= 3 ? 'text-warning' : 'text-fg'
              }`} style={{ fontSize: '3.2rem' }}>{skipsLeft}</span>
              <span className="font-display font-semibold text-xl text-muted-fg ml-1">/ {totalSkippable}</span>
            </div>
            <p className="text-sm text-muted-fg mb-1 leading-tight">
              {skipsLeft === 0 ? 'skips used up' : `skip${skipsLeft !== 1 ? 's' : ''} remaining`}
            </p>
          </div>

          {/* Progress bar — skips used out of total */}
          <div className="h-2 bg-muted rounded-full overflow-hidden mb-3">
            <div
              className={`h-full rounded-full transition-all ${skipsLeft === 0 ? 'bg-danger' : skipsLeft <= 3 ? 'bg-warning' : 'bg-primary'}`}
              style={{ width: `${totalSkippable > 0 ? Math.min(100, (alreadySkipped / totalSkippable) * 100) : 100}%` }}
            />
          </div>

          {/* Stats row */}
          <div className="flex gap-4 text-xs text-muted-fg">
            <span><strong className="text-fg">{alreadySkipped}</strong> skipped</span>
            <span><strong className="text-fg">{totalSkippable}</strong> total allowed</span>
            <span><strong className="text-fg">{totalSemesterClasses}</strong> classes/sem</span>
          </div>

          {/* Warning / recovery message */}
          {skipsLeft === 0 && overall < threshold && (
            <div className="mt-3 pt-3 border-t border-danger/20">
              <p className="text-xs text-danger font-medium">
                Attend next <strong>{classesNeeded} consecutive</strong> class{classesNeeded !== 1 ? 'es' : ''} to recover to {threshold}%
              </p>
            </div>
          )}
          {skipsLeft === 0 && overall >= threshold && (
            <div className="mt-3 pt-3 border-t border-border">
              <p className="text-xs text-muted-fg">Any further absence will drop you below {threshold}%</p>
            </div>
          )}
        </div>
      </div>

      {/* ── Week selector ── */}
      <div className="flex items-center justify-between px-5 mb-3">
        <button onClick={() => setWeekOffset(w => w - 1)}
          className="p-2.5 rounded-2xl bg-card border border-border text-muted-fg active:bg-muted transition-colors">
          <ChevronLeft size={16} />
        </button>
        <div className="text-center">
          <p className="font-display font-semibold text-sm text-fg">
            {weekDates[0].toLocaleDateString('en-IN', { day:'numeric', month:'short' })} –{' '}
            {weekDates[6].toLocaleDateString('en-IN', { day:'numeric', month:'short' })}
          </p>
          <p className={`text-xs mt-0.5 ${weekOffset === 0 ? 'text-primary font-medium' : 'text-muted-fg'}`}>
            {weekOffset === 0 ? 'This Week' : `${Math.abs(weekOffset)} week${Math.abs(weekOffset) > 1 ? 's' : ''} ago`}
          </p>
        </div>
        <button
          onClick={() => setWeekOffset(w => Math.min(0, w + 1))}
          disabled={weekOffset >= 0}
          className={`p-2.5 rounded-2xl border border-border transition-colors ${weekOffset >= 0 ? 'opacity-25 bg-muted' : 'bg-card text-muted-fg active:bg-muted'}`}
        >
          <ChevronRight size={16} />
        </button>
      </div>

      {/* ── Day cards ── */}
      <div className="px-5 mb-5">
        <div className="flex gap-2.5 overflow-x-auto pb-1">
          {weekDates.map((date, i) => {
            const dateStr  = getDateStr(date)
            const isFuture = date > today
            const isToday  = dateStr === getDateStr(today)
            const slots    = getDaySlots(date)
            const records  = slots.map(s => getRecord(dateStr, s.subjectId))
            const present  = records.filter(r => r?.status === 'present').length
            const absent   = records.filter(r => r?.status === 'absent').length
            const allPct   = slots.length ? (present / Math.max(present + absent, 1)) * 100 : 0

            return (
              <button
                key={dateStr}
                onClick={() => !isFuture && setSelectedDay(date)}
                className={`flex-shrink-0 w-[110px] rounded-2xl p-3.5 border text-left transition-all active:scale-95 ${
                  isToday    ? 'border-primary/40 bg-primary-soft' :
                  isFuture   ? 'border-border bg-muted/40 opacity-50 pointer-events-none' :
                               'border-border bg-card card-shadow'
                }`}
              >
                <p className={`text-[10px] font-bold uppercase tracking-wider mb-0.5 ${isToday ? 'text-primary' : 'text-muted-fg'}`}>
                  {DAY_NAMES[i]}
                </p>
                <p className="font-display font-bold text-sm text-fg mb-2">
                  {date.toLocaleDateString('en-IN', { day:'numeric', month:'short' })}
                </p>
                {isFuture ? (
                  <p className="text-xs text-muted-fg">—</p>
                ) : slots.length === 0 ? (
                  <p className="text-xs text-muted-fg">No class</p>
                ) : (
                  <>
                    <div className="flex gap-0.5 mb-1.5">
                      {slots.map(s => {
                        const r = getRecord(dateStr, s.subjectId)
                        const st = r?.status || 'unmarked'
                        return (
                          <div key={s.id}
                            className={`flex-1 h-1 rounded-full ${
                              st === 'present' ? 'bg-success' :
                              st === 'absent'  ? 'bg-danger' :
                              st === 'cancelled' ? 'bg-muted-fg/30' :
                              'bg-border'
                            }`}
                          />
                        )
                      })}
                    </div>
                    <p className="text-xs text-muted-fg">{present}/{slots.filter(s => getRecord(dateStr, s.subjectId)?.status !== 'cancelled').length} present</p>
                  </>
                )}
              </button>
            )
          })}
        </div>
      </div>

      {/* ── Subject attendance + skip budget ── */}
      <div className="px-5 mb-6">
        <SectionHeader title="Subject Attendance" action="View All" onAction={() => setShowSubjects(true)} />
        <div className="flex flex-col gap-2.5">
          {bySubject.map(({ subject, present: sPres, total: sTotal, pct }) => {
            const st = threshold / 100
            // Per-subject semester classes
            const subjSlotsPerWeek = state.timetable.filter(sl => sl.subjectId === subject.id).length
            const subjSemTotal   = subjSlotsPerWeek * semWeeks
            const subjAllowed    = Math.floor(subjSemTotal * (1 - st))
            const subjSkipped    = state.attendanceRecords.filter(r => r.subjectId === subject.id && r.status === 'absent').length
            const subjSkipsLeft  = Math.max(0, subjAllowed - subjSkipped)
            const needMore       = pct < threshold
              ? Math.max(0, Math.ceil((st * sTotal - sPres) / (1 - st)))
              : 0
            return (
            <button key={subject.id} onClick={() => setSubjectDetailId(subject.id)} className="w-full bg-card border border-border rounded-2xl p-4 card-shadow text-left active:scale-[0.98] transition-transform">
              <div className="flex items-center gap-2.5 mb-2">
                <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: subject.color }} />
                <span className="font-semibold text-sm text-fg flex-1">{subject.shortName}</span>
                <span className="text-xs text-muted-fg">{sPres}/{sTotal}</span>
                <span className={`font-display font-bold text-base ${pct < threshold ? 'text-danger' : pct < threshold + 5 ? 'text-warning' : 'text-success'}`}>
                  {pct.toFixed(0)}%
                </span>
              </div>
              <ProgressBar value={pct} threshold={threshold} height="h-1.5" />
              {/* Skip budget row */}
              <div className="flex items-center justify-between mt-2 pt-2 border-t border-border/60">
                <p className={`text-[10px] font-semibold ${needMore > 0 ? 'text-danger' : subjSkipsLeft <= 1 ? 'text-warning' : 'text-muted-fg'}`}>
                  {needMore > 0
                    ? `Attend ${needMore} more to recover`
                    : subjSkipsLeft === 0
                    ? 'No skips left this semester'
                    : `${subjSkipsLeft} skip${subjSkipsLeft !== 1 ? 's' : ''} left this semester`}
                </p>
                <span className="text-[10px] text-muted-fg">{subjSkipped}/{subjAllowed} used</span>
              </div>
            </button>
            )
          })}
        </div>
      </div>

      {/* ── Day detail sheet ── */}
      <Sheet
        open={!!selectedDay}
        onClose={() => setSelectedDay(null)}
        title={selectedDay ? `${FULL_DAYS[(selectedDay.getDay() + 6) % 7]}, ${selectedDay.toLocaleDateString('en-IN', { day:'numeric', month:'long' })}` : ''}
      >
        {selectedDay && (
          <div className="px-5 py-4 pb-8">
            <div className="flex gap-2 mb-4">
              <button
                onClick={() => {
                  const dateStr = getDateStr(selectedDay)
                  getDaySlots(selectedDay).forEach(slot =>
                    markAttendance(dateStr, slot.subjectId, 'cancelled')
                  )
                }}
                className="flex-1 py-2.5 rounded-xl text-sm font-semibold border border-border text-muted-fg bg-muted active:bg-border transition-colors">
                Mark Holiday
              </button>
              <button
                onClick={() => {
                  const dateStr = getDateStr(selectedDay)
                  getDaySlots(selectedDay).forEach(slot =>
                    markAttendance(dateStr, slot.subjectId, 'absent')
                  )
                }}
                className="flex-1 py-2.5 rounded-xl text-sm font-semibold border border-border text-danger bg-danger/8 border-danger/20 active:bg-danger/15 transition-colors">
                All Absent
              </button>
            </div>

            <div className="flex flex-col gap-3">
              {getDaySlots(selectedDay).map(slot => {
                const dateStr = getDateStr(selectedDay)
                const record  = getRecord(dateStr, slot.subjectId)
                const status  = record?.status || 'unmarked'
                const subject = state.subjects.find(s => s.id === slot.subjectId)
                const actions: { s: AttendanceStatus; label: string }[] = [
                  { s:'present',   label:'✓ Yes'  },
                  { s:'absent',    label:'✗ No'   },
                  { s:'cancelled', label:'⊘ Off'  },
                  { s:'changed',   label:'↔ Swap' },
                ]

                return (
                  <div key={slot.id} className="bg-muted rounded-2xl p-4 border border-border">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded-full" style={{ backgroundColor: subject?.color }} />
                        <div>
                          <p className="font-semibold text-sm text-fg">{subject?.name}</p>
                          <p className="text-xs text-muted-fg">{slot.startTime} – {slot.endTime}{slot.room ? ` · Room ${slot.room}` : ''}</p>
                          {slot.teacher && <p className="text-[10px] text-muted-fg truncate">{slot.teacher}{slot.labGroup ? ` · Lab Group ${slot.labGroup}` : ''}</p>}
                          {status === 'changed' && record?.changedToSubjectId && (() => {
                            const changedTo = state.subjects.find(s => s.id === record.changedToSubjectId)
                            return changedTo
                              ? <p className="text-[10px] text-warning font-medium mt-0.5">→ {changedTo.shortName}</p>
                              : null
                          })()}
                        </div>
                      </div>
                      <StatusBadge status={status} />
                    </div>
                    <div className="grid grid-cols-4 gap-1.5">
                      {actions.map(({ s, label }) => (
                        <button
                          key={s}
                          onClick={() => {
                            if (s === 'changed') { setChangeSheet({ date: dateStr, subjectId: slot.subjectId }) }
                            else markAttendance(dateStr, slot.subjectId, s)
                          }}
                          className={`py-2.5 rounded-xl text-[11px] font-bold transition-all active:scale-95 ${
                            status === s
                              ? s === 'present'   ? 'bg-success text-white'
                              : s === 'absent'    ? 'bg-danger  text-white'
                              : s === 'cancelled' ? 'bg-muted-fg text-white'
                              : 'bg-warning text-white'
                              : 'bg-card border border-border text-fg-soft'
                          }`}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </Sheet>

      {/* ── Subject attendance full sheet ── */}
      <Sheet open={showSubjects} onClose={() => setShowSubjects(false)} title="Subject Attendance">
        <div className="px-5 py-4 pb-8 flex flex-col gap-4">
          {bySubject.map(({ subject, present, total, pct }) => {
            const needed = Math.max(0, Math.ceil((threshold / 100 * total - present) / (1 - threshold / 100)))
            return (
              <button key={subject.id} onClick={() => { setShowSubjects(false); setSubjectDetailId(subject.id) }} className="w-full bg-muted rounded-2xl p-4 border border-border text-left active:scale-[0.98] transition-transform">
                <div className="flex items-center gap-2.5 mb-3">
                  <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: subject.color }} />
                  <div className="flex-1">
                    <p className="font-semibold text-sm text-fg">{subject.name}</p>
                    <p className="text-xs text-muted-fg">{subject.shortName}</p>
                  </div>
                  <span className={`font-display font-bold text-2xl ${pct < threshold ? 'text-danger' : 'text-success'}`}>
                    {pct.toFixed(1)}%
                  </span>
                </div>
                <ProgressBar value={pct} threshold={threshold} height="h-2" />
                <div className="flex justify-between mt-2 text-xs text-muted-fg">
                  <span>{present} present · {total - present} absent · {total} total</span>
                  {pct < threshold && needed > 0 && <span className="text-danger font-semibold">Need {needed} more</span>}
                </div>
              </button>
            )
          })}
        </div>
      </Sheet>

      <SubjectOverviewSheet subjectId={subjectDetailId} onClose={() => setSubjectDetailId(null)} />

      {/* ── Changed class sheet ── */}
      <Sheet open={!!changeSheet} onClose={() => { setChangeSheet(null); setChangeSearch('') }} title="Change Class">
        {changeSheet && (
          <div className="px-5 py-4 pb-8">
            <p className="text-sm text-muted-fg mb-3">
              Replacing: <strong className="text-fg">{state.subjects.find(s => s.id === changeSheet.subjectId)?.name}</strong>
            </p>
            <input
              className="w-full px-4 py-3 rounded-xl border border-border bg-muted text-fg text-base mb-3 focus:outline-none focus:ring-2 focus:ring-primary/30 placeholder:text-muted-fg/50"
              placeholder="Search subjects..."
              value={changeSearch}
              onChange={e => setChangeSearch(e.target.value)}
              autoFocus
            />
            <div className="flex flex-col gap-2">
              {filteredSubjects.filter(s => s.id !== changeSheet.subjectId).map(subj => (
                <button key={subj.id}
                  onClick={() => {
                    dispatch({ type: 'MARK_ATTENDANCE', record: { id: uid(), date: changeSheet.date, subjectId: changeSheet.subjectId, status: 'changed', changedToSubjectId: subj.id } })
                    setChangeSheet(null); setChangeSearch('')
                    showSnack(`Changed to ${subj.shortName}`)
                  }}
                  className="flex items-center gap-3 p-4 bg-muted rounded-2xl border border-border text-left active:bg-border transition-colors"
                >
                  <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: subj.color }} />
                  <div>
                    <p className="font-semibold text-sm text-fg">{subj.name}</p>
                    <p className="text-xs text-muted-fg">{subj.shortName}</p>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}
      </Sheet>

      <Snackbar message={snack} show={!!snack} onUndo={lastAction ? undoMark : undefined} onDismiss={() => setSnack('')} />
      <Dialog open={clearDialog} onClose={() => setClearDialog(false)} title="Remove all attendance data?" message="This permanently removes every attendance record. Your current timetable will stay in place." confirmLabel="Remove All" confirmVariant="danger" onConfirm={() => { void dispatch({ type: 'CLEAR_ATTENDANCE' }); setClearDialog(false); setSelectedDay(null); showSnack('All attendance data removed') }} />
    </div>
  )
}
