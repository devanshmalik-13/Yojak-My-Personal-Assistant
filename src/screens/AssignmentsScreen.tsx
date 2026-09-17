import { useState, useMemo, useRef, useEffect } from 'react'
import { Plus, Clock, CheckCircle2, AlertTriangle, ChevronRight, Paperclip, Calendar, Edit3, Trash2 } from 'lucide-react'
import { useApp, uid } from '../store'
import type { Assignment } from '../types'
import { Sheet, Dialog, Snackbar, EmptyState, SectionHeader, ProgressBar } from '../components/ui'
import ScreenHeader, { type HeaderNav } from '../components/ScreenHeader'
import { localFileService } from '../services/fileService'
import { localToday } from '../services/validation'
import { openSavedFile } from '../native/fileOpener'
import { useBackHandler } from '../hooks/useBackHandler'
import { DraftAttachmentList, SavedAttachmentList, type DraftAttachment } from '../components/AttachmentLists'

function daysUntil(deadline: string) {
  const now = new Date(); now.setHours(0, 0, 0, 0)
  const d = new Date(`${deadline}T00:00:00`); d.setHours(0, 0, 0, 0)
  return Math.round((d.getTime() - now.getTime()) / 86400000)
}

function effectiveStatus(a: Assignment): Assignment['status'] {
  if (a.status === 'completed') return 'completed'
  if (a.status === 'overdue') return 'overdue'
  if (daysUntil(a.deadline) < 0) return 'overdue'
  return 'pending'
}

function urgencyColor(a: Assignment) {
  const s = effectiveStatus(a)
  if (s === 'completed') return 'bg-success'
  if (s === 'overdue') return 'bg-danger'
  const d = daysUntil(a.deadline)
  if (d <= 1) return 'bg-danger'
  if (d <= 3) return 'bg-warning'
  return 'bg-success'
}

function deadlineLabel(a: Assignment) {
  if (a.status === 'completed') return `Submitted ${new Date(a.completedAt!).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}`
  const days = daysUntil(a.deadline)
  if (days < 0) return `Overdue by ${Math.abs(days)} day${Math.abs(days) !== 1 ? 's' : ''}`
  if (days === 0) return 'Due today'
  if (days === 1) return 'Due tomorrow'
  return `Due in ${days} days`
}

function deadlineTextColor(a: Assignment) {
  const s = effectiveStatus(a)
  if (s === 'completed') return 'text-success'
  if (s === 'overdue') return 'text-danger'
  const d = daysUntil(a.deadline)
  if (d <= 1) return 'text-danger'
  if (d <= 3) return 'text-warning'
  return 'text-muted-fg'
}

export default function AssignmentsScreen({ nav }: { nav: HeaderNav }) {
  const { state, dispatch } = useApp()
  const [view, setView] = useState<'dashboard' | 'subject'>('dashboard')
  const [selectedSubjectId, setSelectedSubjectId] = useState<string | null>(null)
  const [addSheet, setAddSheet] = useState(false)
  const [detailAssignment, setDetailAssignment] = useState<Assignment | null>(null)
  const [editSheet, setEditSheet] = useState<Assignment | null>(null)
  const [submitDialog, setSubmitDialog] = useState<string | null>(null)
  const [deleteDialog, setDeleteDialog] = useState<string | null>(null)
  const [clearDialog, setClearDialog] = useState(false)
  const [rescheduleSheet, setRescheduleSheet] = useState<string | null>(null)
  const [newDeadline, setNewDeadline] = useState('')
  const [tab, setTab] = useState<'pending' | 'completed'>('pending')
  const [snack, setSnack] = useState('')
  const [lastDeleted, setLastDeleted] = useState<Assignment | null>(null)
  const snackTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useBackHandler(view === 'subject', () => { setView('dashboard'); setSelectedSubjectId(null); return true })

  useEffect(() => () => { if (snackTimer.current) clearTimeout(snackTimer.current) }, [])

  const show = (msg: string) => {
    setSnack(msg)
    if (snackTimer.current) clearTimeout(snackTimer.current)
    snackTimer.current = setTimeout(() => setSnack(''), 4000)
  }

  // Add form
  const [formSubjectId, setFormSubjectId] = useState('')
  const [formName, setFormName] = useState('')
  const [formDeadline, setFormDeadline] = useState('')
  const [formNotes, setFormNotes] = useState('')
  const [formFiles, setFormFiles] = useState<DraftAttachment[]>([])
  const [formError, setFormError] = useState('')

  // Edit form (mirrors add)
  const [editSubjectId, setEditSubjectId] = useState('')
  const [editName, setEditName] = useState('')
  const [editDeadline, setEditDeadline] = useState('')
  const [editNotes, setEditNotes] = useState('')
  const [editError, setEditError] = useState('')

  useEffect(() => {
    setDetailAssignment(current => current ? state.assignments.find(assignment => assignment.id === current.id) ?? null : null)
  }, [state.assignments])

  const subjectStats = useMemo(() => state.subjects.map(subj => {
    const all = state.assignments.filter(a => a.subjectId === subj.id)
    const completed = all.filter(a => a.status === 'completed').length
    const pending = all.filter(a => effectiveStatus(a) === 'pending').length
    const overdue = all.filter(a => effectiveStatus(a) === 'overdue').length
    const pct = all.length ? (completed / all.length) * 100 : 0
    const urgency = overdue > 0 ? 'danger' : all.some(a => effectiveStatus(a) === 'pending' && daysUntil(a.deadline) <= 2) ? 'warning' : 'success'
    return { subj, all, completed, pending, overdue, pct, urgency }
  }).filter(({ completed, pending, overdue }) => tab === 'pending' ? pending + overdue > 0 : completed > 0), [state.assignments, state.subjects, tab])

  const currentSubjectIds = useMemo(() => new Set(state.subjects.map(subject => subject.id)), [state.subjects])

  const pendingList = state.assignments
    .filter(a => currentSubjectIds.has(a.subjectId) && effectiveStatus(a) !== 'completed')
    .sort((a, b) => new Date(a.deadline).getTime() - new Date(b.deadline).getTime())

  const completedList = state.assignments
    .filter(a => currentSubjectIds.has(a.subjectId) && a.status === 'completed')
    .sort((a, b) => new Date(b.completedAt || b.deadline).getTime() - new Date(a.completedAt || a.deadline).getTime())

  const resetAddForm = () => { setFormSubjectId(''); setFormName(''); setFormDeadline(localToday()); setFormNotes(''); setFormFiles([]); setFormError('') }

  const addAssignment = async () => {
    if (!formSubjectId) { setFormError('Please select a subject'); return }
    if (!formName.trim()) { setFormError('Assignment name is required'); return }
    if (!formDeadline) { setFormError('Deadline is required'); return }
    if (formDeadline < localToday()) { setFormError('A new assignment deadline cannot be in the past'); return }
    const assignmentId = uid()
    const savedPaths: string[] = []
    try {
      const files = []
      for (const draft of formFiles) {
        const file = draft.file
        const saved = await localFileService.save('assignments', assignmentId, file)
        savedPaths.push(saved.localPath)
        files.push({ id: uid(), name: draft.name.trim() || file.name, fileType: file.type || 'application/octet-stream', localPath: saved.localPath, url: saved.url, size: file.size })
      }
      await dispatch({ type: 'ADD_ASSIGNMENT', assignment: { id: assignmentId, name: formName.trim(), subjectId: formSubjectId, deadline: formDeadline, status: 'pending', files, notes: formNotes } })
      setAddSheet(false); resetAddForm(); show('Assignment added')
    } catch (error) {
      await Promise.all(savedPaths.map(path => localFileService.delete(path)))
      setFormError(error instanceof Error ? error.message : 'The assignment could not be saved')
    }
  }

  const openEdit = (a: Assignment) => {
    setEditSheet(a)
    setEditSubjectId(a.subjectId)
    setEditName(a.name)
    setEditDeadline(a.deadline)
    setEditNotes(a.notes || '')
    setEditError('')
    setDetailAssignment(null)
  }

  const saveEdit = () => {
    if (!editSheet) return
    if (!editSubjectId) { setEditError('Please select a subject'); return }
    if (!editName.trim()) { setEditError('Assignment name is required'); return }
    if (!editDeadline) { setEditError('Deadline is required'); return }
    dispatch({ type: 'UPDATE_ASSIGNMENT', id: editSheet.id, changes: { name: editName.trim(), subjectId: editSubjectId, deadline: editDeadline, notes: editNotes } })
    setEditSheet(null)
    show('Assignment updated')
  }

  const submitAssignment = (id: string) => {
    dispatch({ type: 'UPDATE_ASSIGNMENT', id, changes: { status: 'completed', completedAt: localToday() } })
    setDetailAssignment(null)
    show('Assignment submitted!')
  }

  const rescheduleAssignment = () => {
    if (!rescheduleSheet || !newDeadline) return
    if (newDeadline < localToday()) { show('The new deadline cannot be in the past'); return }
    dispatch({ type: 'UPDATE_ASSIGNMENT', id: rescheduleSheet, changes: { deadline: newDeadline, status: 'pending' } })
    setRescheduleSheet(null); setDetailAssignment(null)
    show('Assignment rescheduled')
  }

  const deleteAssignment = (id: string) => {
    const a = state.assignments.find(x => x.id === id)
    if (a) setLastDeleted(a)
    dispatch({ type: 'DELETE_ASSIGNMENT', id })
    setDetailAssignment(null)
    show('Assignment deleted')
  }

  const undoDelete = () => {
    if (lastDeleted) dispatch({ type: 'ADD_ASSIGNMENT', assignment: lastDeleted })
    setLastDeleted(null); setSnack('')
  }

  const addAttachment = async (assignmentId: string, file: File) => {
    try {
      const saved = await localFileService.save('assignments', assignmentId, file)
      await dispatch({ type: 'ADD_ASSIGNMENT_FILE', assignmentId, file: { id: uid(), name: file.name, fileType: file.type, localPath: saved.localPath, url: saved.url, size: file.size } })
      show('Attachment saved locally')
    } catch (error) { show(error instanceof Error ? error.message : 'Attachment could not be saved') }
  }

  const removeAttachments = async (fileIds: string[]) => {
    try { await dispatch({ type: 'DELETE_ASSIGNMENT_FILES', fileIds }); show(`${fileIds.length} attachment${fileIds.length === 1 ? '' : 's'} removed`) }
    catch (error) { show(error instanceof Error ? error.message : 'Attachments could not be removed') }
  }

  const renameAttachment = async (fileId: string, name: string) => {
    try { await dispatch({ type: 'RENAME_ASSIGNMENT_FILE', fileId, name }); show('Attachment renamed') }
    catch (error) { show(error instanceof Error ? error.message : 'Attachment could not be renamed') }
  }

  if (view === 'subject' && selectedSubjectId) {
    const stats = subjectStats.find(s => s.subj.id === selectedSubjectId)!
    const subjectAssignments = state.assignments.filter(a => a.subjectId === selectedSubjectId)
    const pending = subjectAssignments.filter(a => effectiveStatus(a) !== 'completed').sort((a, b) => new Date(a.deadline).getTime() - new Date(b.deadline).getTime())
    const completed = subjectAssignments.filter(a => a.status === 'completed')
    const selectedSubject = state.subjects.find(s => s.id === selectedSubjectId)

    return (
      <div className="flex flex-col pb-28 min-h-full">
        <ScreenHeader title={selectedSubject?.shortName || 'Subject'} {...nav} action={
          <button onClick={() => setView('dashboard')} className="flex items-center gap-1 text-primary text-sm font-medium active:opacity-70">
            <ChevronRight size={16} className="rotate-180" /> Back
          </button>
        } />
        <div className="px-5 pb-4">
          <div className="flex items-center gap-2.5 mb-4">
            <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: selectedSubject?.color }} />
            <h1 className="font-display font-bold text-xl text-fg">{selectedSubject?.name}</h1>
          </div>
          <div className="bg-card border border-border rounded-2xl p-4">
            <p className="text-xs text-muted-fg mb-1">{stats.completed} of {stats.all.length} assignments completed</p>
            <p className="font-display font-bold text-3xl text-fg mb-2">{stats.pct.toFixed(0)}%<span className="text-base text-muted-fg font-normal ml-1">complete</span></p>
            <ProgressBar value={stats.pct} height="h-2.5" color="bg-success" />
          </div>
        </div>
        <div className="px-5">
          {pending.length > 0 && (
            <div className="mb-5">
              <SectionHeader title="Pending & Overdue" />
              <div className="flex flex-col gap-3">
                {pending.map(a => <AssignmentCard key={a.id} assignment={a} subjects={state.subjects} onClick={() => setDetailAssignment(a)} />)}
              </div>
            </div>
          )}
          {completed.length > 0 && (
            <div>
              <SectionHeader title="Completed" />
              <div className="flex flex-col gap-3">
                {completed.map(a => <AssignmentCard key={a.id} assignment={a} subjects={state.subjects} onClick={() => setDetailAssignment(a)} />)}
              </div>
            </div>
          )}
          {stats.all.length === 0 && <EmptyState icon={<span>📭</span>} title="You're all caught up!" subtitle="No assignments for this subject." />}
        </div>
        <AssignmentDetailSheet assignment={detailAssignment} subjects={state.subjects} onClose={() => setDetailAssignment(null)} onAttach={addAttachment} onOpen={file => openSavedFile(file).catch(error => show(error instanceof Error ? error.message : 'The file could not be opened'))} onRemoveFiles={removeAttachments} onRenameFile={renameAttachment}
          onEdit={openEdit} onSubmit={id => setSubmitDialog(id)} onDelete={id => setDeleteDialog(id)} onReschedule={id => { setRescheduleSheet(id); setNewDeadline('') }} />
        <Dialogs submitDialog={submitDialog} deleteDialog={deleteDialog} onCloseSubmit={() => setSubmitDialog(null)} onCloseDelete={() => setDeleteDialog(null)} onSubmit={id => submitAssignment(id)} onDelete={id => deleteAssignment(id)} />
        <Snackbar message={snack} show={!!snack} onUndo={lastDeleted ? undoDelete : undefined} onDismiss={() => setSnack('')} />
      </div>
    )
  }

  return (
    <div className="flex flex-col pb-28 min-h-full">
      <ScreenHeader title="Assignments" {...nav} action={
        <div className="flex items-center gap-1">
          {state.assignments.length > 0 && <button onClick={() => setClearDialog(true)} className="w-8 h-8 rounded-xl bg-danger/10 text-danger flex items-center justify-center" aria-label="Remove all assignment data"><Trash2 size={14} /></button>}
          <button onClick={() => { resetAddForm(); setAddSheet(true) }}
            className="flex items-center gap-2 bg-primary text-white text-xs font-semibold p-2 min-[390px]:px-3 rounded-xl shadow-md shadow-primary/20 active:opacity-90 transition-all"
            aria-label="Add assignment">
            <Plus size={14} /> <span className="hidden min-[390px]:inline">Add</span>
          </button>
        </div>
      } />

      <div className="px-5 mb-4">
        <div className="flex bg-muted rounded-xl p-1 gap-1">
          {(['pending', 'completed'] as const).map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-all ${tab === t ? 'bg-card text-fg shadow-sm' : 'text-muted-fg'}`}>
              {t === 'pending' ? `Pending (${pendingList.length})` : `Done (${completedList.length})`}
            </button>
          ))}
        </div>
      </div>

      {subjectStats.length > 0 && <div className="px-5 mb-5">
        <SectionHeader title="By Subject" />
        <div className="grid grid-cols-2 gap-3">
          {subjectStats.map(({ subj, completed, pending, overdue, urgency }) => (
            <button key={subj.id} onClick={() => { setSelectedSubjectId(subj.id); setView('subject') }}
              className="bg-card border border-border rounded-2xl p-4 text-left active:scale-[0.97] transition-transform">
              <div className="flex items-center justify-between mb-2">
                <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: subj.color }} />
                <div className={`w-2.5 h-2.5 rounded-full ${urgency === 'danger' ? 'bg-danger' : urgency === 'warning' ? 'bg-warning' : 'bg-success'}`} />
              </div>
              <p className="font-semibold text-sm text-fg mb-0.5">{subj.shortName}</p>
              <p className="text-[10px] text-muted-fg mb-3 truncate">{subj.name}</p>
              {tab === 'completed' ? (
                <span className="text-[10px] bg-success/10 text-success font-semibold px-1.5 py-0.5 rounded-full">{completed} done</span>
              ) : pending + overdue > 0 ? (
                <div className="flex gap-1.5 flex-wrap">
                  {overdue > 0 && <span className="text-[10px] bg-danger/10 text-danger font-semibold px-1.5 py-0.5 rounded-full">{overdue} overdue</span>}
                  {pending > 0 && <span className="text-[10px] bg-warning/10 text-warning font-semibold px-1.5 py-0.5 rounded-full">{pending} pending</span>}
                </div>
              ) : (
                <span className="text-[10px] bg-success/10 text-success font-semibold px-1.5 py-0.5 rounded-full">All clear</span>
              )}
            </button>
          ))}
        </div>
      </div>}

      <div className="px-5">
        <SectionHeader title={tab === 'pending' ? 'Pending & Overdue' : 'Completed'} />
        {tab === 'pending' && (
          pendingList.length === 0
            ? <EmptyState icon={<span>🎉</span>} title="You're all caught up!" subtitle="No pending assignments right now." />
            : <div className="flex flex-col gap-3">{pendingList.map(a => <AssignmentCard key={a.id} assignment={a} subjects={state.subjects} onClick={() => setDetailAssignment(a)} />)}</div>
        )}
        {tab === 'completed' && (
          completedList.length === 0
            ? <EmptyState icon={<span>📭</span>} title="No completed assignments" subtitle="Submit an assignment to see it here." />
            : <div className="flex flex-col gap-3">{completedList.map(a => <AssignmentCard key={a.id} assignment={a} subjects={state.subjects} onClick={() => setDetailAssignment(a)} />)}</div>
        )}
      </div>

      {/* Add sheet */}
      <Sheet open={addSheet} onClose={() => { setAddSheet(false); setFormError('') }} title="Add Assignment">
        <div className="px-5 py-4 pb-8 flex flex-col gap-4">
          {formError && <p className="text-sm text-danger bg-danger/10 px-3 py-2 rounded-xl">{formError}</p>}
          <div>
            <label className="block text-xs font-medium text-muted-fg mb-1.5">Subject *</label>
            <select value={formSubjectId} onChange={e => setFormSubjectId(e.target.value)}
              className="w-full px-4 py-3 rounded-xl border border-border bg-muted text-fg focus:outline-none focus:ring-2 focus:ring-primary/30">
              <option value="">Select subject...</option>
              {state.subjects.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-muted-fg mb-1.5">Assignment Name *</label>
            <input className="w-full px-4 py-3 rounded-xl border border-border bg-muted text-fg focus:outline-none focus:ring-2 focus:ring-primary/30 placeholder:text-muted-fg/50"
              placeholder="e.g. ER Diagram for Library System" value={formName} onChange={e => setFormName(e.target.value)} />
          </div>
          <div>
            <label className="block text-xs font-medium text-muted-fg mb-1.5">Deadline *</label>
            <input type="date" min={localToday()} className="w-full px-4 py-3 rounded-xl border border-border bg-muted text-fg focus:outline-none focus:ring-2 focus:ring-primary/30"
              value={formDeadline} onChange={e => setFormDeadline(e.target.value)} />
          </div>
          <div>
            <label className="block text-xs font-medium text-muted-fg mb-1.5">Notes (optional)</label>
            <textarea className="w-full px-4 py-3 rounded-xl border border-border bg-muted text-fg focus:outline-none focus:ring-2 focus:ring-primary/30 placeholder:text-muted-fg/50 resize-none"
              placeholder="Any notes about this assignment..." rows={3} value={formNotes} onChange={e => setFormNotes(e.target.value)} />
          </div>
          <div>
            <label className="block text-xs font-medium text-muted-fg mb-1.5">Files & photos (optional)</label>
            <label className="w-full py-3.5 rounded-xl border-2 border-dashed border-border text-primary text-sm font-semibold flex items-center justify-center gap-2 active:bg-muted cursor-pointer">
              <Paperclip size={16} /> Add files or photos
              <input type="file" multiple accept="image/*,application/pdf,.txt,.csv,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.zip" className="hidden" onChange={event => { const added = Array.from(event.target.files || []).map(file => ({ id: uid(), file, name: file.name })); setFormFiles(current => [...current, ...added]); event.target.value = '' }} />
            </label>
            <DraftAttachmentList items={formFiles} onChange={setFormFiles} />
          </div>
          <button onClick={addAssignment} className="w-full py-4 bg-primary text-white font-semibold rounded-2xl shadow-md shadow-primary/25 active:opacity-90 transition-all">
            Add Assignment
          </button>
        </div>
      </Sheet>

      {/* Edit sheet */}
      <Sheet open={!!editSheet} onClose={() => setEditSheet(null)} title="Edit Assignment">
        <div className="px-5 py-4 pb-8 flex flex-col gap-4">
          {editError && <p className="text-sm text-danger bg-danger/10 px-3 py-2 rounded-xl">{editError}</p>}
          <div>
            <label className="block text-xs font-medium text-muted-fg mb-1.5">Subject *</label>
            <select value={editSubjectId} onChange={e => setEditSubjectId(e.target.value)}
              className="w-full px-4 py-3 rounded-xl border border-border bg-muted text-fg focus:outline-none focus:ring-2 focus:ring-primary/30">
              <option value="">Select subject...</option>
              {state.subjects.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-muted-fg mb-1.5">Assignment Name *</label>
            <input className="w-full px-4 py-3 rounded-xl border border-border bg-muted text-fg focus:outline-none focus:ring-2 focus:ring-primary/30"
              value={editName} onChange={e => setEditName(e.target.value)} />
          </div>
          <div>
            <label className="block text-xs font-medium text-muted-fg mb-1.5">Deadline *</label>
            <input type="date" className="w-full px-4 py-3 rounded-xl border border-border bg-muted text-fg focus:outline-none focus:ring-2 focus:ring-primary/30"
              value={editDeadline} onChange={e => setEditDeadline(e.target.value)} />
          </div>
          <div>
            <label className="block text-xs font-medium text-muted-fg mb-1.5">Notes (optional)</label>
            <textarea className="w-full px-4 py-3 rounded-xl border border-border bg-muted text-fg focus:outline-none focus:ring-2 focus:ring-primary/30 placeholder:text-muted-fg/50 resize-none"
              placeholder="Any notes..." rows={3} value={editNotes} onChange={e => setEditNotes(e.target.value)} />
          </div>
          <button onClick={saveEdit} className="w-full py-4 bg-primary text-white font-semibold rounded-2xl shadow-md shadow-primary/25 active:opacity-90 transition-all">
            Save Changes
          </button>
        </div>
      </Sheet>

      <AssignmentDetailSheet assignment={detailAssignment} subjects={state.subjects} onClose={() => setDetailAssignment(null)} onAttach={addAttachment} onOpen={file => openSavedFile(file).catch(error => show(error instanceof Error ? error.message : 'The file could not be opened'))} onRemoveFiles={removeAttachments} onRenameFile={renameAttachment}
        onEdit={openEdit} onSubmit={id => setSubmitDialog(id)} onDelete={id => setDeleteDialog(id)} onReschedule={id => { setRescheduleSheet(id); setNewDeadline('') }} />
      <Dialogs submitDialog={submitDialog} deleteDialog={deleteDialog} onCloseSubmit={() => setSubmitDialog(null)} onCloseDelete={() => setDeleteDialog(null)} onSubmit={id => submitAssignment(id)} onDelete={id => deleteAssignment(id)} />
      <Dialog open={clearDialog} onClose={() => setClearDialog(false)} title="Remove all assignment data?" message="This permanently removes every pending and completed assignment, including attachments." confirmLabel="Remove All" confirmVariant="danger" onConfirm={() => { void dispatch({ type: 'CLEAR_ASSIGNMENTS' }); setClearDialog(false); setDetailAssignment(null); show('All assignment data removed') }} />

      <Sheet open={!!rescheduleSheet} onClose={() => setRescheduleSheet(null)} title="Reschedule Assignment">
        <div className="px-5 py-4 pb-8 flex flex-col gap-4">
          <p className="text-sm text-muted-fg">Choose a new deadline for this assignment.</p>
          <div>
            <label className="block text-xs font-medium text-muted-fg mb-1.5">New Deadline *</label>
            <input type="date" min={localToday()} className="w-full px-4 py-3 rounded-xl border border-border bg-muted text-fg focus:outline-none focus:ring-2 focus:ring-primary/30"
              value={newDeadline} onChange={e => setNewDeadline(e.target.value)} />
          </div>
          <button onClick={rescheduleAssignment} className="w-full py-4 bg-primary text-white font-semibold rounded-2xl shadow-md shadow-primary/25 active:opacity-90 transition-all">
            Confirm Reschedule
          </button>
        </div>
      </Sheet>

      <Snackbar message={snack} show={!!snack} onUndo={lastDeleted ? undoDelete : undefined} onDismiss={() => setSnack('')} />
    </div>
  )
}

function AssignmentCard({ assignment: a, subjects, onClick }: { assignment: Assignment; subjects: { id: string; shortName: string; color: string }[]; onClick: () => void }) {
  const subj = subjects.find(s => s.id === a.subjectId)
  return (
    <button onClick={onClick} className="bg-card border border-border rounded-2xl p-4 text-left active:scale-[0.98] transition-transform w-full">
      <div className="flex items-start gap-3">
        <div className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${urgencyColor(a)}`} />
        <div className="flex-1 min-w-0">
          <p className="font-medium text-sm text-fg truncate">{a.name}</p>
          {subj && <p className="text-xs text-muted-fg mt-0.5">{subj.shortName}</p>}
          <div className="flex items-center gap-2 mt-2">
            <Clock size={11} className={deadlineTextColor(a)} />
            <span className={`text-xs font-medium ${deadlineTextColor(a)}`}>{deadlineLabel(a)}</span>
            {effectiveStatus(a) === 'overdue' && a.status !== 'completed' && (
              <span className="text-[10px] bg-danger/10 text-danger font-bold px-1.5 py-0.5 rounded-full">OVERDUE</span>
            )}
          </div>
        </div>
        {a.files.length > 0 && (
          <div className="flex items-center gap-1 text-muted-fg shrink-0">
            <Paperclip size={12} /><span className="text-xs">{a.files.length}</span>
          </div>
        )}
        <ChevronRight size={16} className="text-muted-fg shrink-0 mt-0.5" />
      </div>
    </button>
  )
}

function AssignmentDetailSheet({ assignment: a, subjects, onClose, onEdit, onSubmit, onDelete, onReschedule, onAttach, onOpen, onRemoveFiles, onRenameFile }: {
  assignment: Assignment | null
  subjects: { id: string; name: string; color: string }[]
  onClose: () => void
  onEdit: (a: Assignment) => void
  onSubmit: (id: string) => void
  onDelete: (id: string) => void
  onReschedule: (id: string) => void
  onAttach: (id: string, file: File) => void
  onOpen: (file: Assignment['files'][number]) => void
  onRemoveFiles: (fileIds: string[]) => void
  onRenameFile: (fileId: string, name: string) => void
}) {
  const attachmentRef = useRef<HTMLInputElement>(null)
  if (!a) return null
  const subj = subjects.find(s => s.id === a.subjectId)
  const isOverdue = effectiveStatus(a) === 'overdue'

  return (
    <Sheet open={!!a} onClose={onClose} title="Assignment Details">
      <div className="px-5 py-4 pb-8">
        <div className="bg-muted rounded-2xl p-4 mb-5">
          <div className="flex items-start gap-2 mb-2">
            {subj && <div className="w-2.5 h-2.5 rounded-full mt-0.5 shrink-0" style={{ backgroundColor: subj.color }} />}
            <span className="text-xs text-muted-fg font-medium">{subj?.name}</span>
          </div>
          <h2 className="font-display font-bold text-lg text-fg leading-tight">{a.name}</h2>
          <div className="flex items-center gap-2 mt-2">
            <Calendar size={13} className="text-muted-fg" />
            <span className="text-sm text-fg-soft">
              {new Date(`${a.deadline}T00:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}
            </span>
          </div>
          <div className="mt-2.5">
            <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${
              a.status === 'completed' ? 'bg-success/10 text-success' :
              isOverdue ? 'bg-danger/10 text-danger' :
              daysUntil(a.deadline) <= 1 ? 'bg-danger/10 text-danger' :
              daysUntil(a.deadline) <= 3 ? 'bg-warning/10 text-warning' :
              'bg-success/10 text-success'
            }`}>
              {deadlineLabel(a)}
            </span>
          </div>
        </div>

        {a.notes && (
          <div className="mb-4">
            <p className="text-xs font-medium text-muted-fg mb-1.5">Notes</p>
            <p className="text-sm text-fg-soft bg-muted rounded-xl px-4 py-3">{a.notes}</p>
          </div>
        )}

        <SavedAttachmentList files={a.files} onOpen={onOpen} onRename={onRenameFile} onDelete={onRemoveFiles} />

        <div className="flex flex-col gap-3">
          <button onClick={() => attachmentRef.current?.click()} className="w-full py-3.5 bg-primary/10 text-primary font-semibold rounded-2xl border border-primary/20 active:opacity-90 transition-all flex items-center justify-center gap-2">
            <Paperclip size={16} /> Add Attachment
          </button>
          <input ref={attachmentRef} type="file" accept=".pdf,.png,.jpg,.jpeg,.webp,.txt,.docx,.zip" className="hidden" onChange={event=>{const file=event.target.files?.[0];if(file)onAttach(a.id,file);event.target.value='' }} />
          {a.status !== 'completed' && (
            <button onClick={() => onSubmit(a.id)}
              className="w-full py-3.5 bg-primary text-white font-semibold rounded-2xl shadow-md shadow-primary/20 active:opacity-90 transition-all flex items-center justify-center gap-2">
              <CheckCircle2 size={16} /> Submit Assignment
            </button>
          )}
          {isOverdue && a.status !== 'completed' && (
            <button onClick={() => onReschedule(a.id)}
              className="w-full py-3.5 bg-warning/10 text-warning font-semibold rounded-2xl border border-warning/20 active:opacity-90 transition-all flex items-center justify-center gap-2">
              <Calendar size={16} /> Reschedule
            </button>
          )}
          <button onClick={() => onEdit(a)}
            className="w-full py-3.5 bg-muted text-fg-soft font-semibold rounded-2xl border border-border active:opacity-90 transition-all flex items-center justify-center gap-2">
            <Edit3 size={15} /> Edit Assignment
          </button>
          <button onClick={() => onDelete(a.id)}
            className="w-full py-3.5 bg-danger/10 text-danger font-semibold rounded-2xl border border-danger/20 active:opacity-90 transition-all">
            Delete Assignment
          </button>
        </div>
      </div>
    </Sheet>
  )
}

function Dialogs({ submitDialog, deleteDialog, onCloseSubmit, onCloseDelete, onSubmit, onDelete }: {
  submitDialog: string | null; deleteDialog: string | null
  onCloseSubmit: () => void; onCloseDelete: () => void
  onSubmit: (id: string) => void; onDelete: (id: string) => void
}) {
  return (
    <>
      <Dialog open={!!submitDialog} onClose={onCloseSubmit} title="Submit this assignment?"
        message="Once submitted, it will move from Pending to Completed." confirmLabel="Confirm Submission"
        onConfirm={() => submitDialog && onSubmit(submitDialog)} />
      <Dialog open={!!deleteDialog} onClose={onCloseDelete} title="Delete assignment?"
        message="This will permanently remove the assignment." confirmLabel="Delete" confirmVariant="danger"
        onConfirm={() => deleteDialog && onDelete(deleteDialog)} />
    </>
  )
}
