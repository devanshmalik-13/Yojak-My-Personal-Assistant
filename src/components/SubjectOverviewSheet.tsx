import { useEffect, useMemo, useState } from 'react'
import { ArrowLeft, BookOpen, CalendarDays, ChevronRight, Clock, FileText, MapPin, Paperclip, UserRound } from 'lucide-react'
import { useApp } from '../store'
import type { Assignment, FileAttachment } from '../types'
import { calculateStatistics } from '../services/attendanceService'
import { localToday } from '../services/validation'
import { openSavedFile } from '../native/fileOpener'
import { ProgressBar, Sheet } from './ui'

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
type SubjectTab = 'overview' | 'schedule' | 'assignments' | 'resources'

export default function SubjectOverviewSheet({ subjectId, onClose }: { subjectId: string | null; onClose: () => void }) {
  const { state } = useApp()
  const [tab, setTab] = useState<SubjectTab>('overview')
  const [selectedAssignmentId, setSelectedAssignmentId] = useState<string | null>(null)
  const [fileError, setFileError] = useState('')
  useEffect(() => { setTab('overview'); setSelectedAssignmentId(null); setFileError('') }, [subjectId])

  const subject = state.subjects.find(item => item.id === subjectId)
  const assignments = state.assignments.filter(item => item.subjectId === subjectId)
  const pending = assignments.filter(item => item.status !== 'completed').sort((a, b) => a.deadline.localeCompare(b.deadline))
  const done = assignments.filter(item => item.status === 'completed').sort((a, b) => (b.completedAt ?? b.deadline).localeCompare(a.completedAt ?? a.deadline))
  const slots = state.timetable.filter(slot => slot.subjectId === subjectId).sort((a, b) => a.dayOfWeek - b.dayOfWeek || a.period - b.period)
  const attendance = subjectId ? calculateStatistics(state.attendanceRecords, [subjectId]).bySubject[0] : undefined
  const selectedAssignment = state.assignments.find(item => item.id === selectedAssignmentId) ?? null
  const files = useMemo(() => assignments.flatMap(item => item.files.map(file => ({ file, assignment: item }))), [assignments])

  const semesterWeeks = (() => {
    const start = new Date(`${state.timetableActiveFrom}T00:00:00`)
    const end = new Date(`${state.timetableActiveTo}T00:00:00`)
    return Number.isFinite(start.getTime()) && Number.isFinite(end.getTime()) && end > start
      ? Math.max(1, Math.round((end.getTime() - start.getTime()) / (7 * 86400000)))
      : 16
  })()
  const allowed = Math.floor(slots.length * semesterWeeks * (1 - state.attendanceThreshold / 100))
  const used = state.attendanceRecords.filter(item => item.subjectId === subjectId && item.status === 'absent').length
  const left = Math.max(0, allowed - used)

  const openFile = async (file: FileAttachment) => {
    setFileError('')
    try { await openSavedFile(file) }
    catch (error) { setFileError(error instanceof Error ? error.message : 'The file could not be opened') }
  }

  return (
    <>
      <Sheet open={!!subject} onClose={onClose} className="h-[96dvh]">
        {subject && <div className="min-h-full ledger-grid">
          <div className="sticky top-0 z-10 bg-card/95 backdrop-blur-xl border-b border-border">
            <div className="px-4 pt-2 pb-3 flex items-center gap-3">
              <button onClick={onClose} className="w-9 h-9 rounded-full bg-muted flex items-center justify-center text-fg"><ArrowLeft size={18} /></button>
              <div className="w-10 h-10 rounded-xl bg-primary-soft flex items-center justify-center text-primary"><BookOpen size={20} /></div>
              <div className="min-w-0 flex-1"><h2 className="font-display font-bold text-xl text-fg truncate">{subject.name}</h2><p className="text-xs text-muted-fg">{subject.shortName}</p></div>
            </div>
            <div className="grid grid-cols-4 px-3">
              {(['overview', 'schedule', 'assignments', 'resources'] as SubjectTab[]).map(value => <button key={value} onClick={() => setTab(value)} className={`py-2.5 text-[11px] capitalize border-b-2 transition-colors ${tab === value ? 'text-primary border-primary font-bold' : 'text-fg-soft border-transparent'}`}>{value}</button>)}
            </div>
          </div>

          <div className="px-5 py-5 pb-10">
            {(tab === 'overview' || tab === 'schedule') && tab === 'overview' && <>
              <section className="ledger-card p-4 mb-4">
                <p className="font-display font-bold text-base text-fg mb-3">Attendance</p>
                <div className="flex items-center gap-4">
                  <div className="relative w-[74px] h-[74px] rounded-full flex items-center justify-center shrink-0" style={{ background: `conic-gradient(var(--primary) ${Math.min(100, attendance?.pct ?? 0) * 3.6}deg, var(--muted) 0deg)` }}><div className="w-[57px] h-[57px] rounded-full bg-card flex items-center justify-center"><span className="font-display font-bold text-xl text-fg">{(attendance?.pct ?? 0).toFixed(0)}%</span></div></div>
                  <div className="flex-1"><p className="text-sm text-fg"><strong>{attendance?.present ?? 0}</strong> / {attendance?.total ?? 0}</p><p className="text-xs text-muted-fg">present classes</p><ProgressBar value={attendance?.pct ?? 0} threshold={state.attendanceThreshold} height="h-1.5" className="mt-2" /></div>
                </div>
                <div className="grid grid-cols-2 gap-2 mt-4"><div className="bg-primary-soft border border-primary/10 rounded-xl px-3 py-2.5"><strong className="font-display text-lg text-primary">{left}</strong><p className="text-[10px] text-fg-soft">skips left this semester</p></div><div className="bg-muted border border-border rounded-xl px-3 py-2.5"><strong className="font-display text-lg text-fg">{used} / {allowed}</strong><p className="text-[10px] text-fg-soft">used</p></div></div>
              </section>
              <ScheduleSection slots={slots.slice(0, 5)} />
              <AssignmentGroup title="Pending" assignments={pending} empty="No pending assignments." onOpen={setSelectedAssignmentId} />
              <AssignmentGroup title="Done" assignments={done} empty="No completed assignments." onOpen={setSelectedAssignmentId} />
            </>}

            {tab === 'schedule' && <ScheduleSection slots={slots} />}
            {tab === 'assignments' && <><AssignmentGroup title="Pending & overdue" assignments={pending} empty="No pending assignments." onOpen={setSelectedAssignmentId} /><AssignmentGroup title="Done" assignments={done} empty="No completed assignments." onOpen={setSelectedAssignmentId} /></>}
            {tab === 'resources' && <section><div className="flex items-baseline justify-between mb-3"><h3 className="font-display font-bold text-xl text-fg">Resources</h3><span className="text-xs text-muted-fg">{files.length} files</span></div>{fileError && <p className="text-xs text-danger bg-danger/10 rounded-xl px-3 py-2 mb-2">{fileError}</p>}{files.length === 0 ? <Empty text="No assignment files yet." /> : <div className="flex flex-col gap-2">{files.map(({ file, assignment }) => <button key={file.id} onClick={() => void openFile(file)} className="ledger-card px-4 py-3 flex items-center gap-3 text-left"><div className="w-9 h-9 rounded-lg bg-primary-soft flex items-center justify-center text-primary"><FileText size={17} /></div><div className="min-w-0 flex-1"><p className="text-sm font-semibold text-fg truncate">{file.name}</p><p className="text-[10px] text-muted-fg truncate">{assignment.name}</p></div><span className="text-xs font-semibold text-primary">Open</span></button>)}</div>}</section>}
          </div>
        </div>}
      </Sheet>

      <Sheet open={!!selectedAssignment} onClose={() => { setSelectedAssignmentId(null); setFileError('') }} title="Assignment Details">
        {selectedAssignment && <div className="px-5 py-5 pb-10 ledger-grid">
          <div className="ledger-card p-4 mb-5"><p className="text-xs text-primary font-semibold mb-1">{subject?.name}</p><h2 className="font-display font-bold text-xl text-fg">{selectedAssignment.name}</h2><div className="flex items-center gap-1.5 text-xs text-muted-fg mt-2"><CalendarDays size={12} />Due {formatDate(selectedAssignment.deadline)}</div><span className={`inline-block text-[10px] font-bold px-2 py-1 rounded-full mt-3 ${selectedAssignment.status === 'completed' ? 'bg-success/10 text-success' : selectedAssignment.deadline < localToday() ? 'bg-danger/10 text-danger' : 'bg-warning/10 text-warning'}`}>{selectedAssignment.status === 'completed' ? `Completed${selectedAssignment.completedAt ? ` · ${formatDate(selectedAssignment.completedAt)}` : ''}` : selectedAssignment.deadline < localToday() ? 'Overdue' : 'Pending'}</span></div>
          <p className="text-xs font-semibold text-muted-fg uppercase tracking-wide mb-2">Notes</p><p className="text-sm text-fg-soft ledger-card px-4 py-3 mb-5 whitespace-pre-wrap">{selectedAssignment.notes || 'No notes added.'}</p>
          <p className="text-xs font-semibold text-muted-fg uppercase tracking-wide mb-2">Attachments ({selectedAssignment.files.length})</p>{fileError && <p className="text-xs text-danger bg-danger/10 rounded-xl px-3 py-2 mb-2">{fileError}</p>}{selectedAssignment.files.length === 0 ? <Empty text="No files attached." /> : <div className="flex flex-col gap-2">{selectedAssignment.files.map(file => <button key={file.id} onClick={() => void openFile(file)} className="ledger-card flex items-center gap-3 px-4 py-3 text-left"><FileText size={16} className="text-primary shrink-0" /><span className="text-sm text-fg flex-1 truncate">{file.name}</span><span className="text-xs text-primary font-semibold">Open</span></button>)}</div>}
        </div>}
      </Sheet>
    </>
  )
}

function ScheduleSection({ slots }: { slots: ReturnType<typeof useApp>['state']['timetable'] }) {
  return <section className="mb-5"><div className="flex items-baseline justify-between mb-3"><h3 className="font-display font-bold text-xl text-fg">Weekly Schedule</h3><span className="text-xs text-muted-fg">{slots.length} periods</span></div>{slots.length === 0 ? <Empty text="No scheduled periods." /> : <div className="ledger-card overflow-hidden">{slots.map((slot, index) => <div key={slot.id} className={`grid grid-cols-[56px_1fr_auto] items-center gap-3 px-3 py-3 ${index > 0 ? 'border-t border-border' : ''}`}><div><p className="text-[10px] font-bold uppercase text-primary">{DAYS[slot.dayOfWeek - 1].slice(0, 3)}</p><p className="font-display text-xs text-fg">P{slot.period}</p></div><div className="min-w-0"><p className="text-sm font-semibold text-fg">Period {slot.period}</p><div className="flex gap-2 text-[10px] text-muted-fg">{slot.room && <span className="flex items-center gap-1"><MapPin size={9} />{slot.room}</span>}{slot.teacher && <span className="flex items-center gap-1 truncate"><UserRound size={9} />{slot.teacher}</span>}</div></div><p className="font-display text-xs text-fg-soft">{slot.startTime}</p></div>)}</div>}</section>
}

function AssignmentGroup({ title, assignments, empty, onOpen }: { title: string; assignments: Assignment[]; empty: string; onOpen: (id: string) => void }) {
  return <section className="mb-5"><div className="flex items-baseline justify-between mb-2"><h3 className="font-display font-bold text-lg text-fg">{title}</h3><span className="text-xs text-muted-fg">{assignments.length}</span></div>{assignments.length === 0 ? <Empty text={empty} /> : <div className="ledger-card overflow-hidden">{assignments.map((assignment, index) => <button key={assignment.id} onClick={() => onOpen(assignment.id)} className={`w-full px-4 py-3 text-left flex items-center gap-3 ${index > 0 ? 'border-t border-border' : ''}`}><div className="min-w-0 flex-1"><p className="text-sm font-semibold text-fg truncate">{assignment.name}</p><p className="text-[10px] text-muted-fg mt-1 flex items-center gap-1"><Clock size={10} />{assignment.status === 'completed' ? `Completed${assignment.completedAt ? ` · ${formatDate(assignment.completedAt)}` : ''}` : `Due ${formatDate(assignment.deadline)}`}</p></div>{assignment.files.length > 0 && <span className="flex items-center gap-1 text-xs text-muted-fg"><Paperclip size={11} />{assignment.files.length}</span>}<ChevronRight size={15} className="text-muted-fg" /></button>)}</div>}</section>
}

function Empty({ text }: { text: string }) { return <p className="text-sm text-muted-fg bg-muted border border-dashed border-border rounded-xl px-4 py-4 text-center">{text}</p> }
function formatDate(value: string) { return new Date(`${value}T00:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) }
