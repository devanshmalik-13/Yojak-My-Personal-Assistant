import { useState, useRef } from 'react'
import {
  ChevronRight, ChevronLeft, CalendarDays, RotateCcw, BookmarkCheck,
  Pencil, Trash2, Plus, Camera, ImagePlus, X, ScanText, LoaderCircle,
  CheckCircle2, AlertCircle, FileText,
} from 'lucide-react'
import { useApp, uid } from '../store'
import type { Subject, TimetableSlot } from '../types'
import { localToday } from '../services/validation'
import { canScanTimetableOnDevice, recognizeTimetableDocument, scanTimetablePhoto } from '../native/timetableScanner'
import { parseTimetableOcr, selectTimetableLabGroup, type TimetableImageImport } from '../services/timetableImageParser'
import { useBackHandler } from '../hooks/useBackHandler'
import { getCurrentTimetableSubjects } from '../services/timetableService'

type KeepMode = 'all' | 'before-date' | 'fresh'
type Step = 'attendance' | 'cutoff' | 'timetable' | 'confirm'

const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const SUBJECT_COLORS = [
  '#8B5CF6', '#F97316', '#3B82F6', '#10B981', '#EC4899',
  '#F59E0B', '#EF4444', '#14B8A6', '#6366F1', '#84CC16',
]

function padTime(h: number) {
  return `${String(h).padStart(2, '0')}:00`
}

interface Props { onClose: () => void }

export default function ChangeTimetableFlow({ onClose }: Props) {
  const { state, dispatch } = useApp()

  // ── Step state ──
  const [step, setStep] = useState<Step>('attendance')

  // ── Attendance decision ──
  const [keepMode, setKeepMode] = useState<KeepMode>('all')
  const [cutoffDate, setCutoffDate] = useState(localToday)

  // ── Timetable editing (clone of current) ──
  const [subjects, setSubjects] = useState<Subject[]>(
    getCurrentTimetableSubjects(state.subjects, state.timetable).map(s => ({ ...s })),
  )
  const [timetable, setTimetable] = useState<TimetableSlot[]>(state.timetable.map(s => ({ ...s })))

  // ── Photo upload ──
  const [photoDataUrl, setPhotoDataUrl] = useState<string | null>(null)
  const [scanStatus, setScanStatus] = useState<'idle' | 'scanning' | 'complete' | 'error'>('idle')
  const [scanError, setScanError] = useState('')
  const [scanWarnings, setScanWarnings] = useState<string[]>([])
  const [scanSummary, setScanSummary] = useState('')
  const [selectedFileName, setSelectedFileName] = useState('')
  const [selectedDocumentData, setSelectedDocumentData] = useState<string | null>(null)
  const [pdfPage, setPdfPage] = useState(0)
  const [pdfPageCount, setPdfPageCount] = useState(1)
  const [pendingImport, setPendingImport] = useState<TimetableImageImport | null>(null)
  const [selectedLabGroup, setSelectedLabGroup] = useState<number | null>(null)
  const galleryInputRef = useRef<HTMLInputElement>(null)
  const cameraInputRef = useRef<HTMLInputElement>(null)
  const pdfInputRef = useRef<HTMLInputElement>(null)

  const applyRecognizedTimetable = (ocr: Awaited<ReturnType<typeof recognizeTimetableDocument>>, pageIndex = 0) => {
    if (ocr.previewDataUrl) setPhotoDataUrl(ocr.previewDataUrl)
    setPdfPage(ocr.pageIndex ?? pageIndex)
    setPdfPageCount(ocr.pageCount || 1)
    const imported = parseTimetableOcr(ocr, uid)
    setPendingImport(imported)
    setSubjects(imported.subjects)
    setTimetable(imported.timetable)
    setScanWarnings(imported.warnings)
    const source = ocr.sourceType === 'pdf' ? `PDF page ${(ocr.pageIndex ?? pageIndex) + 1}${(ocr.pageCount || 1) > 1 ? ` of ${ocr.pageCount}` : ''} · ` : ''
    const labPrompt = imported.labGroups.length ? ` · ${imported.labGroups.length} grouped lab slots—choose your group below` : ''
    setScanSummary(`${source}${imported.detectedDays.length} days · ${imported.subjects.length} subjects · ${imported.timetable.length} detected classes${labPrompt}`)
    setScanStatus('complete')
  }

  const analyzeDocument = async (documentData: string, isPdf: boolean, pageIndex = 0) => {
    setPhotoDataUrl(isPdf ? null : documentData)
    setScanStatus('scanning')
    setScanError('')
    setScanWarnings([])
    setScanSummary('')
    setPendingImport(null)
    setSelectedLabGroup(null)
    try {
      const ocr = await recognizeTimetableDocument(documentData, pageIndex)
      applyRecognizedTimetable(ocr, pageIndex)
    } catch (error) {
      setScanStatus('error')
      setScanError(error instanceof Error ? error.message : 'The timetable could not be analyzed.')
    }
  }

  const handleSmartPhoto = async () => {
    setPhotoDataUrl(null)
    setSelectedDocumentData(null)
    setSelectedFileName('Smart camera scan')
    setScanStatus('scanning')
    setScanError('')
    setScanWarnings([])
    setScanSummary('')
    setPendingImport(null)
    setSelectedLabGroup(null)
    try {
      const ocr = await scanTimetablePhoto()
      applyRecognizedTimetable(ocr)
    } catch (error) {
      setScanStatus('error')
      setScanError(error instanceof Error ? error.message : 'The timetable photo could not be analyzed.')
    }
  }

  const openCamera = () => {
    if (canScanTimetableOnDevice()) void handleSmartPhoto()
    else cameraInputRef.current?.click()
  }

  const handlePhotoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''

    const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')
    if (!isPdf && !['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      setScanStatus('error')
      setScanError('Choose a JPEG, PNG, WebP, or PDF timetable.')
      return
    }
    if (file.size > (isPdf ? 20 : 15) * 1024 * 1024) {
      setScanStatus('error')
      setScanError(isPdf ? 'Choose a PDF smaller than 20 MB.' : 'Choose an image smaller than 15 MB.')
      return
    }

    setSelectedFileName(file.name)
    try {
      const documentData = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = event => typeof event.target?.result === 'string'
          ? resolve(event.target.result)
          : reject(new Error('The selected image could not be read.'))
        reader.onerror = () => reject(new Error('The selected image could not be read.'))
        reader.readAsDataURL(file)
      })
      setSelectedDocumentData(documentData)
      setPdfPage(0)
      setPdfPageCount(1)
      await analyzeDocument(documentData, isPdf, 0)
    } catch (error) {
      setScanStatus('error')
      setScanError(error instanceof Error ? error.message : 'The timetable could not be analyzed.')
    }
  }

  const scanPdfPage = (page: number) => {
    if (!selectedDocumentData || page < 0 || page >= pdfPageCount) return
    void analyzeDocument(selectedDocumentData, true, page)
  }

  const chooseLabGroup = (group: number) => {
    if (!pendingImport) return
    const selected = selectTimetableLabGroup(pendingImport, group, uid)
    setSelectedLabGroup(group)
    setSubjects(selected.subjects)
    setTimetable(selected.timetable)
    setScanSummary(`${selected.detectedDays.length} days · Group ${group} · ${selected.subjects.length} subjects · ${selected.timetable.length} periods`)
  }

  // ── Subject form ──
  const [editingSubjectId, setEditingSubjectId] = useState<string | null>(null)
  const [newSubjectName, setNewSubjectName] = useState('')
  const [newSubjectShort, setNewSubjectShort] = useState('')
  const [newSubjectColor, setNewSubjectColor] = useState(SUBJECT_COLORS[0])
  const [subjectFormMode, setSubjectFormMode] = useState<'add' | 'edit'>('add')

  // ── Slot picker ──
  const [editingSlot, setEditingSlot] = useState<{ day: number; period: number } | null>(null)

  // ── Navigation ──
  const go = (next: Step) => setStep(next)

  const nextFromAttendance = () => {
    if (keepMode === 'before-date') go('cutoff')
    else go('timetable')
  }

  // ── Subject CRUD ──
  const openAddSubject = () => {
    setSubjectFormMode('add')
    setEditingSubjectId('__new__')
    setNewSubjectName('')
    setNewSubjectShort('')
    setNewSubjectColor(SUBJECT_COLORS[subjects.length % SUBJECT_COLORS.length])
  }

  const openEditSubject = (subj: Subject) => {
    setSubjectFormMode('edit')
    setEditingSubjectId(subj.id)
    setNewSubjectName(subj.name)
    setNewSubjectShort(subj.shortName)
    setNewSubjectColor(subj.color)
  }

  const saveSubject = () => {
    if (!newSubjectName.trim()) return
    const short = newSubjectShort.trim() || newSubjectName.trim().slice(0, 4).toUpperCase()
    if (subjectFormMode === 'add') {
      setSubjects(s => [...s, { id: uid(), name: newSubjectName.trim(), shortName: short, color: newSubjectColor }])
    } else if (editingSubjectId) {
      setSubjects(s => s.map(subj =>
        subj.id === editingSubjectId
          ? { ...subj, name: newSubjectName.trim(), shortName: short, color: newSubjectColor }
          : subj
      ))
    }
    setEditingSubjectId(null)
  }

  const deleteSubject = (id: string) => {
    setSubjects(s => s.filter(subj => subj.id !== id))
    setTimetable(t => t.filter(slot => slot.subjectId !== id))
  }

  // ── Slot CRUD ──
  const getSlotsForDay = (day: number) =>
    timetable.filter(s => s.dayOfWeek === day).sort((a, b) => a.period - b.period)

  const saveSlot = (day: number, period: number, details: Pick<TimetableSlot, 'subjectId' | 'startTime' | 'endTime' | 'room' | 'teacher'>) => {
    setTimetable(t => {
      const idx = t.findIndex(s => s.dayOfWeek === day && s.period === period)
      if (idx >= 0) {
        const next = [...t]; next[idx] = { ...next[idx], ...details }; return next
      }
      return [...t, {
        id: uid(), dayOfWeek: day, period, ...details,
      }]
    })
    setEditingSlot(null)
  }

  const removeSlot = (day: number, period: number) => {
    setTimetable(t => t.filter(s => !(s.dayOfWeek === day && s.period === period)))
    setEditingSlot(null)
  }

  const addPeriod = (day: number) => {
    const used = new Set(getSlotsForDay(day).map(slot => slot.period))
    const next = Array.from({ length: 12 }, (_, index) => index + 1).find(period => !used.has(period))
    if (!next) return
    setEditingSlot({ day, period: next })
  }

  // ── Confirm ──
  const confirm = () => {
    dispatch({
      type: 'CHANGE_TIMETABLE',
      keepMode,
      cutoffDate: keepMode === 'before-date' ? cutoffDate : undefined,
      timetable,
      subjects,
    })
    onClose()
  }

  // ── Derived ──
  const today = localToday()
  const totalRecords  = state.attendanceRecords.length
  const recordsBefore = state.attendanceRecords.filter(r => r.date < cutoffDate).length

  const totalSteps = keepMode === 'before-date' ? 4 : 3
  const stepNum: Record<Step, number> = {
    attendance: 1,
    cutoff:     2,
    timetable:  keepMode === 'before-date' ? 3 : 2,
    confirm:    keepMode === 'before-date' ? 4 : 3,
  }

  const keepOptions: {
    mode: KeepMode; icon: typeof BookmarkCheck
    title: string; desc: string
    selectedBg: string; selectedText: string; selectedBorder: string
  }[] = [
    {
      mode: 'all', icon: BookmarkCheck,
      title: 'Keep all past attendance',
      desc: 'Your previous records are preserved as-is. New timetable takes effect today.',
      selectedBg: 'bg-success/10', selectedText: 'text-success', selectedBorder: 'border-success/40',
    },
    {
      mode: 'before-date', icon: CalendarDays,
      title: 'Keep attendance before a date',
      desc: 'Choose a cutoff — records before it are kept, records from that date onwards are cleared.',
      selectedBg: 'bg-warning/10', selectedText: 'text-warning', selectedBorder: 'border-warning/40',
    },
    {
      mode: 'fresh', icon: RotateCcw,
      title: 'Reset and start fresh',
      desc: 'Clear all attendance records and begin tracking from today with the new timetable.',
      selectedBg: 'bg-danger/10', selectedText: 'text-danger', selectedBorder: 'border-danger/40',
    },
  ]

  const backStep = () => {
    if (step === 'attendance') { onClose(); return }
    if (step === 'cutoff')    { go('attendance'); return }
    if (step === 'timetable') { go(keepMode === 'before-date' ? 'cutoff' : 'attendance'); return }
    if (step === 'confirm')   { go('timetable') }
  }

  useBackHandler(true, () => {
    backStep()
    return true
  })

  return (
    <div className="min-h-dvh bg-bg flex flex-col anim-fadeUp">

      {/* ── Sticky header ── */}
      <div className="px-5 safe-top pb-4 flex items-center gap-3 border-b border-border bg-bg sticky top-0 z-10">
        <button onClick={backStep}
          className="w-9 h-9 rounded-2xl bg-muted flex items-center justify-center text-muted-fg active:opacity-60 shrink-0">
          <ChevronLeft size={18} />
        </button>
        <div className="flex-1 min-w-0">
          <p className="font-display font-bold text-lg text-fg leading-tight truncate">Change Timetable</p>
          <p className="text-[11px] text-muted-fg">
            Step {stepNum[step]} of {totalSteps} —{' '}
            {step === 'attendance' && 'Past Attendance'}
            {step === 'cutoff'    && 'Choose Cutoff Date'}
            {step === 'timetable' && 'Edit Timetable'}
            {step === 'confirm'   && 'Review & Confirm'}
          </p>
        </div>
        {/* Progress dots */}
        <div className="flex items-center gap-1 shrink-0">
          {Array.from({ length: totalSteps }).map((_, i) => (
            <div key={i} className={`h-1.5 rounded-full transition-all ${stepNum[step] - 1 === i ? 'w-5 bg-primary' : i < stepNum[step] - 1 ? 'w-1.5 bg-primary/40' : 'w-1.5 bg-border'}`} />
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">

        {/* ══════════════════════════════════════════════
            STEP 1 — Attendance handling
        ══════════════════════════════════════════════ */}
        {step === 'attendance' && (
          <div className="px-5 py-6 flex flex-col gap-4">
            <div className="mb-1">
              <h2 className="font-display font-semibold text-xl text-fg mb-1">What happens to your past attendance?</h2>
              <p className="text-sm text-muted-fg">
                You have <strong className="text-fg">{totalRecords} records</strong> across all subjects. Choose how to handle them.
              </p>
            </div>

            {keepOptions.map(opt => {
              const Icon = opt.icon
              const isSel = keepMode === opt.mode
              return (
                <button key={opt.mode} onClick={() => setKeepMode(opt.mode)}
                  className={`w-full text-left rounded-2xl border-2 p-4 transition-all active:scale-[0.98] ${
                    isSel ? `${opt.selectedBg} ${opt.selectedBorder}` : 'border-border bg-card'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 mt-0.5 ${isSel ? 'bg-current/10' : 'bg-muted'}`}>
                      <Icon size={18} className={isSel ? opt.selectedText : 'text-muted-fg'} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className={`font-semibold text-sm mb-0.5 ${isSel ? opt.selectedText : 'text-fg'}`}>{opt.title}</p>
                      <p className={`text-xs leading-relaxed ${isSel ? 'text-fg-soft' : 'text-muted-fg'}`}>{opt.desc}</p>
                    </div>
                    <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 mt-0.5 transition-all ${
                      isSel ? `${opt.selectedBorder} ${opt.selectedBg.replace('bg-', 'bg-')}` : 'border-border'
                    }`}>
                      {isSel && <svg width="10" height="10" viewBox="0 0 12 10" fill="none"><path d="M1 5l3.5 3.5L11 1" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className={opt.selectedText} /></svg>}
                    </div>
                  </div>
                </button>
              )
            })}

            <button onClick={nextFromAttendance}
              className="mt-2 w-full flex items-center justify-center gap-2 bg-primary text-white font-semibold py-4 rounded-2xl shadow-md shadow-primary/20 active:opacity-90 transition-all">
              Continue <ChevronRight size={18} />
            </button>
          </div>
        )}

        {/* ══════════════════════════════════════════════
            STEP 2 — Cutoff date (before-date only)
        ══════════════════════════════════════════════ */}
        {step === 'cutoff' && (
          <div className="px-5 py-6 flex flex-col gap-6">
            <div>
              <h2 className="font-display font-semibold text-xl text-fg mb-1">Choose a cutoff date</h2>
              <p className="text-sm text-muted-fg">
                Records <strong className="text-fg">before this date</strong> will be kept. Everything from this date onward is cleared.
              </p>
            </div>

            <div className="bg-card border border-border rounded-2xl p-5">
              <label className="block text-xs font-semibold text-muted-fg uppercase tracking-wide mb-3">Cutoff Date</label>
              <input type="date" max={today} value={cutoffDate}
                onChange={e => setCutoffDate(e.target.value)}
                className="w-full px-4 py-3 rounded-xl border border-border bg-muted text-fg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
            </div>

            {/* Impact preview */}
            <div className="flex gap-3">
              <div className="flex-1 bg-success/10 border border-success/20 rounded-2xl p-4 text-center">
                <p className="font-display font-bold text-2xl text-success">{recordsBefore}</p>
                <p className="text-xs text-success font-medium mt-0.5 opacity-70">records kept</p>
              </div>
              <div className="flex-1 bg-danger/10 border border-danger/20 rounded-2xl p-4 text-center">
                <p className="font-display font-bold text-2xl text-danger">{totalRecords - recordsBefore}</p>
                <p className="text-xs text-danger font-medium mt-0.5 opacity-70">records cleared</p>
              </div>
            </div>

            <div className="bg-muted border border-border rounded-xl px-4 py-3">
              <p className="text-xs text-fg-soft leading-relaxed">
                <strong className="text-fg">Note:</strong> Records from{' '}
                <strong className="text-fg">{new Date(cutoffDate + 'T00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}</strong>{' '}
                onwards will be permanently deleted.
              </p>
            </div>

            <button onClick={() => go('timetable')}
              className="w-full flex items-center justify-center gap-2 bg-primary text-white font-semibold py-4 rounded-2xl shadow-md shadow-primary/20 active:opacity-90 transition-all">
              Continue <ChevronRight size={18} />
            </button>
          </div>
        )}

        {/* ══════════════════════════════════════════════
            STEP 3 — Edit timetable
        ══════════════════════════════════════════════ */}
        {step === 'timetable' && (
          <div className="px-5 py-6 flex flex-col gap-6">
            <div>
              <h2 className="font-display font-semibold text-xl text-fg mb-1">Set up your new timetable</h2>
              <p className="text-sm text-muted-fg">Choose or take a photo and the app will generate your timetable automatically.</p>
            </div>

            {/* ── Photo upload ── */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <p className="font-semibold text-sm text-fg">Scan Timetable</p>
                <span className="text-[10px] font-semibold text-success bg-success/10 px-2 py-1 rounded-full">ON-DEVICE</span>
              </div>
              <input
                ref={galleryInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="hidden"
                onChange={handlePhotoChange}
              />
              <input
                ref={pdfInputRef}
                type="file"
                accept="application/pdf,.pdf"
                className="hidden"
                onChange={handlePhotoChange}
              />
              <input
                ref={cameraInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={handlePhotoChange}
              />

              {photoDataUrl || scanStatus !== 'idle' ? (
                <div className="rounded-2xl overflow-hidden border border-border bg-card">
                  <div className="relative bg-black/5 min-h-24 flex items-center justify-center">
                    {photoDataUrl ? <img src={photoDataUrl} alt="Selected timetable" className="w-full object-contain max-h-64" /> : <FileText size={36} className="text-primary/60" />}
                    <button
                      onClick={() => { setPhotoDataUrl(null); setSelectedFileName(''); setSelectedDocumentData(null); setPdfPage(0); setPdfPageCount(1); setPendingImport(null); setSelectedLabGroup(null); setScanStatus('idle'); setScanError(''); setScanWarnings([]) }}
                      className="absolute top-2 right-2 w-8 h-8 bg-black/65 backdrop-blur-sm text-white rounded-xl flex items-center justify-center active:opacity-70"
                      aria-label="Remove selected timetable image"
                    ><X size={14} /></button>
                  </div>
                  <div className="p-4">
                    {selectedFileName && <p className="text-[10px] text-muted-fg truncate mb-3">{selectedFileName}</p>}
                    {selectedDocumentData?.startsWith('data:application/pdf') && pdfPageCount > 1 && (
                      <div className="flex items-center justify-between rounded-xl bg-muted border border-border px-3 py-2 mb-3">
                        <button disabled={pdfPage === 0 || scanStatus === 'scanning'} onClick={() => scanPdfPage(pdfPage - 1)}
                          className="p-1.5 rounded-lg disabled:opacity-30 text-primary" aria-label="Scan previous PDF page"><ChevronLeft size={16} /></button>
                        <div className="text-center">
                          <p className="text-xs font-semibold text-fg">PDF page {pdfPage + 1} of {pdfPageCount}</p>
                          <p className="text-[10px] text-muted-fg">Choose the page containing your class grid</p>
                        </div>
                        <button disabled={pdfPage >= pdfPageCount - 1 || scanStatus === 'scanning'} onClick={() => scanPdfPage(pdfPage + 1)}
                          className="p-1.5 rounded-lg disabled:opacity-30 text-primary" aria-label="Scan next PDF page"><ChevronRight size={16} /></button>
                      </div>
                    )}
                    {scanStatus === 'scanning' && (
                      <div className="flex items-center gap-3 text-primary">
                        <LoaderCircle size={20} className="animate-spin shrink-0" />
                        <div><p className="font-semibold text-sm">Reading timetable…</p><p className="text-xs text-muted-fg mt-0.5">Detecting days, subjects, and periods on this device</p></div>
                      </div>
                    )}
                    {scanStatus === 'complete' && (
                      <div className="flex items-start gap-3">
                        <CheckCircle2 size={20} className="text-success shrink-0 mt-0.5" />
                        <div className="flex-1"><p className="font-semibold text-sm text-success">Timetable generated</p><p className="text-xs text-muted-fg mt-0.5">{scanSummary}. Review the generated schedule below before applying.</p></div>
                      </div>
                    )}
                    {scanStatus === 'complete' && pendingImport && pendingImport.labGroups.length > 0 && (
                      <div className="mt-4 rounded-xl border border-primary/25 bg-primary/5 p-3">
                        <p className="text-xs font-semibold text-fg">Which lab group are you in?</p>
                        <p className="text-[10px] text-muted-fg mt-1">Choose the group row shown in your timetable, counted from the top. Blank rows mean no class for that group.</p>
                        <div className="grid grid-cols-3 gap-2 mt-3">
                          {Array.from({ length: pendingImport.groupCount || 3 }, (_, index) => index + 1).map(group => (
                            <button key={group} onClick={() => chooseLabGroup(group)}
                              className={`py-2.5 rounded-xl text-xs font-semibold border ${selectedLabGroup === group ? 'bg-primary text-white border-primary' : 'bg-card text-fg border-border'}`}>
                              Group {group}
                            </button>
                          ))}
                        </div>
                        {selectedLabGroup && <div className="mt-3 space-y-1">
                          {pendingImport.labGroups.map(choice => <p key={`${choice.dayOfWeek}:${choice.period}`} className="text-xs text-muted-fg">
                            {DAY_NAMES[choice.dayOfWeek - 1]} · P{choice.period} · {choice.startTime}–{choice.endTime}: {choice.options[selectedLabGroup - 1]?.name || 'No class'}
                          </p>)}
                        </div>}
                      </div>
                    )}
                    {scanStatus === 'error' && (
                      <div className="flex items-start gap-3">
                        <AlertCircle size={20} className="text-danger shrink-0 mt-0.5" />
                        <div className="flex-1"><p className="font-semibold text-sm text-danger">Could not generate timetable</p><p className="text-xs text-muted-fg mt-0.5">{scanError}</p></div>
                      </div>
                    )}
                    <div className="grid grid-cols-3 gap-2 mt-4">
                      <button onClick={() => galleryInputRef.current?.click()} className="flex items-center justify-center gap-2 py-2.5 rounded-xl border border-border text-xs font-semibold text-fg active:bg-muted">
                        <ImagePlus size={14} /> Gallery
                      </button>
                      <button onClick={() => pdfInputRef.current?.click()} className="flex items-center justify-center gap-2 py-2.5 rounded-xl border border-border text-xs font-semibold text-fg active:bg-muted">
                        <FileText size={14} /> PDF
                      </button>
                      <button onClick={openCamera} className="flex items-center justify-center gap-2 py-2.5 rounded-xl border border-border text-xs font-semibold text-fg active:bg-muted">
                        <Camera size={14} /> Smart Scan
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="border-2 border-dashed border-border rounded-2xl p-4 bg-muted/40">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center shrink-0"><ScanText size={23} className="text-primary" /></div>
                    <div><p className="font-semibold text-sm text-fg">Import and generate</p><p className="text-xs text-muted-fg mt-0.5">Use a clear image or the original PDF</p></div>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <button onClick={() => galleryInputRef.current?.click()} className="flex items-center justify-center gap-2 bg-primary text-white text-xs font-semibold py-3 rounded-xl active:opacity-90">
                      <ImagePlus size={15} /> Gallery
                    </button>
                    <button onClick={() => pdfInputRef.current?.click()} className="flex items-center justify-center gap-2 bg-card border border-border text-fg text-xs font-semibold py-3 rounded-xl active:bg-muted">
                      <FileText size={15} /> PDF
                    </button>
                    <button onClick={openCamera} className="flex items-center justify-center gap-2 bg-card border border-border text-fg text-xs font-semibold py-3 rounded-xl active:bg-muted">
                      <Camera size={15} /> Smart Scan
                    </button>
                  </div>
                  <p className="text-[10px] text-muted-fg leading-relaxed mt-3">Android grants access only to the file you choose. Images, PDFs, and recognized text stay on this device.</p>
                </div>
              )}

              {scanWarnings.length > 0 && (
                <div className="mt-3 bg-warning/10 border border-warning/20 rounded-xl px-4 py-3">
                  {scanWarnings.map(warning => <p key={warning} className="text-xs text-warning leading-relaxed">• {warning}</p>)}
                </div>
              )}
            </div>

            {/* ── Subjects ── */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <p className="font-semibold text-sm text-fg">Subjects</p>
                <button onClick={openAddSubject} className="flex items-center gap-1 text-xs font-semibold text-primary active:opacity-70">
                  <Plus size={13} /> Add Subject
                </button>
              </div>

              <div className="flex flex-col gap-2">
                {subjects.map(subj => (
                  <div key={subj.id} className="flex items-center gap-3 bg-card border border-border rounded-2xl px-4 py-3">
                    <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: subj.color }} />
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm text-fg truncate">{subj.name}</p>
                      <p className="text-xs text-muted-fg">{subj.shortName}</p>
                    </div>
                    <button onClick={() => openEditSubject(subj)} className="p-1.5 text-muted-fg active:text-primary transition-colors">
                      <Pencil size={14} />
                    </button>
                    <button onClick={() => deleteSubject(subj.id)} className="p-1.5 text-muted-fg active:text-danger transition-colors">
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
              </div>

              {/* Inline subject form */}
              {editingSubjectId && (
                <div className="mt-3 bg-muted border border-border rounded-2xl p-4 flex flex-col gap-3">
                  <p className="font-semibold text-sm text-fg">{subjectFormMode === 'add' ? 'New Subject' : 'Edit Subject'}</p>
                  <input autoFocus
                    className="w-full px-3 py-2.5 rounded-xl border border-border bg-card text-fg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 placeholder:text-muted-fg/50"
                    placeholder="Subject name (e.g. Database Management)"
                    value={newSubjectName}
                    onChange={e => setNewSubjectName(e.target.value)} />
                  <input
                    className="w-full px-3 py-2.5 rounded-xl border border-border bg-card text-fg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 placeholder:text-muted-fg/50"
                    placeholder="Short name (e.g. DBMS)"
                    maxLength={6}
                    value={newSubjectShort}
                    onChange={e => setNewSubjectShort(e.target.value.toUpperCase())} />
                  <div>
                    <p className="text-xs text-muted-fg mb-2">Colour</p>
                    <div className="flex gap-2 flex-wrap">
                      {SUBJECT_COLORS.map(col => (
                        <button key={col} onClick={() => setNewSubjectColor(col)}
                          style={{ backgroundColor: col }}
                          className={`w-7 h-7 rounded-full transition-transform active:scale-90 ${newSubjectColor === col ? 'ring-2 ring-offset-2 ring-primary scale-110' : ''}`} />
                      ))}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => setEditingSubjectId(null)} className="flex-1 py-2.5 rounded-xl border border-border text-fg-soft text-sm font-medium active:bg-card transition-colors">
                      Cancel
                    </button>
                    <button onClick={saveSubject} className="flex-1 py-2.5 rounded-xl bg-primary text-white text-sm font-semibold active:opacity-90 transition-all">
                      {subjectFormMode === 'add' ? 'Add' : 'Save'}
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* ── Weekly schedule grid ── */}
            <div>
              <p className="font-semibold text-sm text-fg mb-3">Weekly Schedule</p>
              <div className="flex flex-col gap-3">
                {DAY_NAMES.map((dayLabel, di) => {
                  const dayNum = di + 1
                  const slots = getSlotsForDay(dayNum)
                  return (
                    <div key={dayLabel} className="bg-card border border-border rounded-2xl p-4">
                      <p className="font-display font-semibold text-xs uppercase tracking-wider text-muted-fg mb-3">{dayLabel}</p>
                      <div className="flex flex-col gap-2">
                        {slots.map(slot => {
                          const subj = subjects.find(s => s.id === slot.subjectId)
                          const isEditing = editingSlot?.day === dayNum && editingSlot?.period === slot.period
                          return (
                            <div key={slot.id}>
                              {isEditing ? (
                                <SlotEditor
                                  label={`Period ${slot.period}`}
                                  subjects={subjects}
                                  slot={slot}
                                  onSave={details => saveSlot(dayNum, slot.period, details)}
                                  onRemove={() => removeSlot(dayNum, slot.period)}
                                  onCancel={() => setEditingSlot(null)}
                                />
                              ) : (
                                <button onClick={() => setEditingSlot({ day: dayNum, period: slot.period })}
                                  className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl bg-muted border border-border text-left active:opacity-80 transition-opacity">
                                  <span className="text-xs text-muted-fg w-5 shrink-0">P{slot.period}</span>
                                  <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: subj?.color || '#ccc' }} />
                                  <div className="flex-1 min-w-0">
                                    <p className="text-sm font-medium text-fg truncate">{subj?.shortName || '—'}{slot.labGroup ? ` · G${slot.labGroup}` : ''}</p>
                                    {(slot.room || slot.teacher) && <p className="text-[10px] text-muted-fg truncate">{[slot.room, slot.teacher].filter(Boolean).join(' · ')}</p>}
                                  </div>
                                  <span className="text-[10px] text-muted-fg shrink-0">{slot.startTime}</span>
                                  <Pencil size={12} className="text-muted-fg shrink-0" />
                                </button>
                              )}
                            </div>
                          )
                        })}

                        {/* Add new period picker */}
                        {editingSlot?.day === dayNum && !slots.some(slot => slot.period === editingSlot.period) ? (
                          <SlotEditor
                            label={`New Period ${editingSlot.period}`}
                            subjects={subjects}
                            slot={{
                              subjectId: subjects[0]?.id || '',
                              startTime: padTime(8 + editingSlot.period),
                              endTime: padTime(9 + editingSlot.period),
                            }}
                            onSave={details => saveSlot(dayNum, editingSlot.period, details)}
                            onCancel={() => setEditingSlot(null)}
                          />
                        ) : (
                          <button onClick={() => addPeriod(dayNum)}
                            className="flex items-center gap-2 text-xs text-primary font-semibold px-3 py-2 rounded-xl border border-dashed border-primary/30 bg-primary/5 active:bg-primary/10 transition-colors">
                            <Plus size={13} /> Add period
                          </button>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>

            <button
              disabled={timetable.length === 0 || subjects.length === 0 || (!!pendingImport?.labGroups.length && !selectedLabGroup)}
              onClick={() => go('confirm')}
              className="w-full flex items-center justify-center gap-2 bg-primary disabled:bg-muted disabled:text-muted-fg text-white font-semibold py-4 rounded-2xl shadow-md shadow-primary/20 active:opacity-90 transition-all">
              {pendingImport?.labGroups.length && !selectedLabGroup ? 'Choose Lab Group First' : timetable.length === 0 ? 'Add At Least One Period' : 'Review Changes'} <ChevronRight size={18} />
            </button>
          </div>
        )}

        {/* ══════════════════════════════════════════════
            STEP 4 — Confirm
        ══════════════════════════════════════════════ */}
        {step === 'confirm' && (
          <div className="px-5 py-6 flex flex-col gap-5">
            <div>
              <h2 className="font-display font-semibold text-xl text-fg mb-1">Confirm changes</h2>
              <p className="text-sm text-muted-fg">Review what will happen before applying.</p>
            </div>

            {/* Attendance summary */}
            <div className="bg-card border border-border rounded-2xl overflow-hidden">
              <div className="px-4 py-3 border-b border-border bg-muted/50">
                <p className="text-xs font-semibold text-muted-fg uppercase tracking-wide">Past Attendance</p>
              </div>
              <div className="px-4 py-4">
                {keepMode === 'all' && (
                  <div className="flex items-start gap-3">
                    <div className="w-8 h-8 rounded-full bg-success/15 flex items-center justify-center shrink-0"><BookmarkCheck size={15} className="text-success" /></div>
                    <div>
                      <p className="font-medium text-sm text-fg">All {totalRecords} records preserved</p>
                      <p className="text-xs text-muted-fg mt-0.5">Nothing will be deleted from your history.</p>
                    </div>
                  </div>
                )}
                {keepMode === 'before-date' && (
                  <div className="flex items-start gap-3">
                    <div className="w-8 h-8 rounded-full bg-warning/15 flex items-center justify-center shrink-0"><CalendarDays size={15} className="text-warning" /></div>
                    <div>
                      <p className="font-medium text-sm text-fg">{recordsBefore} records kept · {totalRecords - recordsBefore} deleted</p>
                      <p className="text-xs text-muted-fg mt-0.5">
                        Records from <strong className="text-fg">{new Date(cutoffDate + 'T00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'long' })}</strong> onwards will be cleared.
                      </p>
                    </div>
                  </div>
                )}
                {keepMode === 'fresh' && (
                  <div className="flex items-start gap-3">
                    <div className="w-8 h-8 rounded-full bg-danger/15 flex items-center justify-center shrink-0"><RotateCcw size={15} className="text-danger" /></div>
                    <div>
                      <p className="font-medium text-sm text-fg">All {totalRecords} records will be cleared</p>
                      <p className="text-xs text-muted-fg mt-0.5">Attendance tracking restarts from today.</p>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Timetable summary */}
            <div className="bg-card border border-border rounded-2xl overflow-hidden">
              <div className="px-4 py-3 border-b border-border bg-muted/50">
                <p className="text-xs font-semibold text-muted-fg uppercase tracking-wide">New Timetable</p>
              </div>
              <div className="px-4 py-4 flex flex-col gap-2.5">
                <p className="text-xs text-muted-fg mb-1">{subjects.length} subjects · {timetable.length} total periods/week</p>
                {subjects.map(s => {
                  const count = timetable.filter(sl => sl.subjectId === s.id).length
                  return (
                    <div key={s.id} className="flex items-center gap-2.5">
                      <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: s.color }} />
                      <span className="text-sm text-fg flex-1 truncate">{s.name}</span>
                      <span className="text-xs text-muted-fg shrink-0">{count}×/week</span>
                    </div>
                  )
                })}
              </div>
            </div>

            <div className="flex flex-col gap-3 mt-1">
              <button onClick={confirm}
                className={`w-full py-4 rounded-2xl font-semibold text-white shadow-md active:opacity-90 transition-all ${
                  keepMode === 'fresh' ? 'bg-danger shadow-danger/20' : 'bg-primary shadow-primary/20'
                }`}>
                {keepMode === 'fresh' ? 'Reset & Apply New Timetable' : 'Apply New Timetable'}
              </button>
              <button onClick={onClose} className="w-full py-3 text-sm text-muted-fg font-medium active:opacity-60">
                Cancel, keep current timetable
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

/* ── Reusable period editor ── */
function SlotEditor({
  label, subjects, slot, onSave, onRemove, onCancel,
}: {
  label: string
  subjects: Subject[]
  slot: Pick<TimetableSlot, 'subjectId' | 'startTime' | 'endTime' | 'room' | 'teacher'>
  onSave: (details: Pick<TimetableSlot, 'subjectId' | 'startTime' | 'endTime' | 'room' | 'teacher'>) => void
  onRemove?: () => void
  onCancel: () => void
}) {
  const [subjectId, setSubjectId] = useState(slot.subjectId)
  const [startTime, setStartTime] = useState(slot.startTime)
  const [endTime, setEndTime] = useState(slot.endTime)
  const [room, setRoom] = useState(slot.room || '')
  const [teacher, setTeacher] = useState(slot.teacher || '')
  const valid = !!subjectId && !!startTime && !!endTime && startTime < endTime
  return (
    <div className="bg-muted rounded-xl p-3 border border-border">
      <p className="text-xs font-semibold text-fg mb-3">{label} details</p>
      <div className="flex flex-col gap-2.5">
        <select value={subjectId} onChange={event => setSubjectId(event.target.value)}
          className="w-full px-3 py-2.5 rounded-xl border border-border bg-card text-fg text-sm">
          <option value="" disabled>Choose subject</option>
          {subjects.map(subject => <option key={subject.id} value={subject.id}>{subject.name}</option>)}
        </select>
        <div className="grid grid-cols-2 gap-2">
          <label className="text-[10px] text-muted-fg">Starts
            <input type="time" value={startTime} onChange={event => setStartTime(event.target.value)} className="mt-1 w-full px-2 py-2 rounded-xl border border-border bg-card text-fg text-sm" />
          </label>
          <label className="text-[10px] text-muted-fg">Ends
            <input type="time" value={endTime} onChange={event => setEndTime(event.target.value)} className="mt-1 w-full px-2 py-2 rounded-xl border border-border bg-card text-fg text-sm" />
          </label>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <input value={room} onChange={event => setRoom(event.target.value)} placeholder="Room (optional)" className="px-3 py-2.5 rounded-xl border border-border bg-card text-fg text-sm" />
          <input value={teacher} onChange={event => setTeacher(event.target.value)} placeholder="Teacher (optional)" className="px-3 py-2.5 rounded-xl border border-border bg-card text-fg text-sm" />
        </div>
        {!valid && startTime && endTime && startTime >= endTime && <p className="text-[10px] text-danger">End time must be after start time.</p>}
        <button disabled={!valid} onClick={() => onSave({ subjectId, startTime, endTime, room: room.trim() || undefined, teacher: teacher.trim() || undefined })}
          className="w-full py-2.5 rounded-xl bg-primary disabled:bg-border disabled:text-muted-fg text-white text-sm font-semibold">Save period</button>
        {onRemove && (
          <button onClick={onRemove}
            className="flex items-center gap-2 px-3 py-2.5 rounded-xl text-danger text-sm font-medium active:bg-danger/5 transition-colors">
            <Trash2 size={13} /> Remove this period
          </button>
        )}
        <button onClick={onCancel} className="px-3 py-1.5 text-xs text-muted-fg font-medium active:opacity-60">
          Cancel
        </button>
      </div>
    </div>
  )
}
