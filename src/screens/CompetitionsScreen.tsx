import { useState, useRef, useEffect } from 'react'
import { Plus, CalendarDays, Users, Check, Camera, Trash2, Paperclip } from 'lucide-react'
import { useApp, uid } from '../store'
import type { Competition, CompetitionType, FileAttachment } from '../types'
import { Sheet, Dialog, Snackbar, EmptyState, Segmented } from '../components/ui'
import ScreenHeader, { type HeaderNav } from '../components/ScreenHeader'
import { localFileService } from '../services/fileService'
import { localToday } from '../services/validation'
import { openSavedFile } from '../native/fileOpener'
import { DraftAttachmentList, SavedAttachmentList, type DraftAttachment } from '../components/AttachmentLists'

const TYPE_LABELS: Record<CompetitionType, string> = {
  hackathon: 'Hackathon', ctf: 'CTF', sports: 'Sports', other: 'Other',
}
const TYPE_EMOJIS: Record<CompetitionType, string> = {
  hackathon: '💻', ctf: '🔐', sports: '🏅', other: '🏆',
}

export default function CompetitionsScreen({ nav }: { nav: HeaderNav }) {
  const { state, dispatch } = useApp()
  const [tab, setTab] = useState('Upcoming')
  const [addSheet, setAddSheet] = useState(false)
  const [detailCompId, setDetailCompId] = useState<string | null>(null)
  const [addRoundSheet, setAddRoundSheet] = useState(false)
  const [deleteDialog, setDeleteDialog] = useState<string | null>(null)
  const [clearDialog, setClearDialog] = useState(false)
  const [celebration, setCelebration] = useState<Competition | null>(null)
  const [snack, setSnack] = useState('')
  const certInputRef = useRef<HTMLInputElement>(null)
  const promptCertInputRef = useRef<HTMLInputElement>(null)
  const documentInputRef = useRef<HTMLInputElement>(null)
  const snackTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => () => { if (snackTimer.current) clearTimeout(snackTimer.current) }, [])

  const [formName, setFormName] = useState('')
  const [formTeam, setFormTeam] = useState('')
  const [formType, setFormType] = useState<CompetitionType>('hackathon')
  const [formCustomType, setFormCustomType] = useState('')
  const [formDate, setFormDate] = useState('')
  const [formError, setFormError] = useState('')
  const [formFiles, setFormFiles] = useState<DraftAttachment[]>([])

  const [roundDate, setRoundDate] = useState('')
  const [roundLabel, setRoundLabel] = useState('')

  const detailComp = detailCompId ? state.competitions.find(c => c.id === detailCompId) ?? null : null

  // Sort by next upcoming round date, falling back to first round
  const sortedByNext = (list: Competition[]) =>
    [...list].sort((a, b) => {
      const aDate = (a.rounds.find(r => r.status === 'upcoming') ?? a.rounds[0])?.date ?? ''
      const bDate = (b.rounds.find(r => r.status === 'upcoming') ?? b.rounds[0])?.date ?? ''
      return aDate.localeCompare(bDate)
    })

  const upcoming = sortedByNext(state.competitions.filter(c => c.status === 'upcoming'))
  const completed = state.competitions.filter(c => c.status === 'completed')

  const show = (msg: string) => {
    setSnack(msg)
    if (snackTimer.current) clearTimeout(snackTimer.current)
    snackTimer.current = setTimeout(() => setSnack(''), 3500)
  }

  const resetForm = () => {
    setFormName(''); setFormTeam(''); setFormDate('')
    setFormCustomType(''); setFormError(''); setFormType('hackathon'); setFormFiles([])
  }

  const addCompetition = async () => {
    if (!formName.trim()) { setFormError('Competition name is required'); return }
    if (!formTeam.trim()) { setFormError('Team name is required'); return }
    if (formType === 'other' && !formCustomType.trim()) { setFormError('Custom competition type is required'); return }
    if (!formDate) { setFormError('Date is required'); return }
    if (formDate < localToday()) { setFormError('An upcoming competition cannot be in the past'); return }
    const competitionId = uid()
    const savedPaths: string[] = []
    const documents: FileAttachment[] = []
    try {
      for (const draft of formFiles) {
        const saved = await localFileService.save('competitions', competitionId, draft.file)
        savedPaths.push(saved.localPath)
        documents.push({ id: uid(), name: draft.name.trim() || draft.file.name, url: saved.url, localPath: saved.localPath, fileType: draft.file.type || 'application/octet-stream', size: draft.file.size })
      }
      const comp: Competition = {
      id: competitionId, name: formName.trim(), teamName: formTeam.trim(), type: formType,
      customType: formType === 'other' ? formCustomType : undefined,
      rounds: [{ id: uid(), label: 'Round 1', date: formDate, status: 'upcoming' }],
      status: 'upcoming', celebrationShown: false, documents,
      }
      await dispatch({ type: 'ADD_COMPETITION', competition: comp })
      setAddSheet(false); resetForm(); show('Competition added!')
    } catch (error) {
      await Promise.all(savedPaths.map(path => localFileService.delete(path)))
      setFormError(error instanceof Error ? error.message : 'The competition could not be saved')
    }
  }

  const addRound = () => {
    if (!detailCompId || !roundDate.trim() || !roundLabel.trim()) return
    if (roundDate < localToday()) { show('An upcoming round cannot be in the past'); return }
    dispatch({
      type: 'ADD_COMPETITION_ROUND',
      competitionId: detailCompId,
      round: { id: uid(), label: roundLabel, date: roundDate, status: 'upcoming' },
    })
    setAddRoundSheet(false); setRoundDate(''); setRoundLabel('')
    show('Round added!')
  }

  const toggleRound = (roundId: string) => {
    if (!detailComp) return
    const round = detailComp.rounds.find(r => r.id === roundId)
    if (!round) return
    const newStatus = round.status === 'completed' ? 'upcoming' : 'completed'
    dispatch({
      type: 'UPDATE_COMPETITION_ROUND',
      competitionId: detailComp.id,
      roundId,
      changes: { status: newStatus },
    })
    show(newStatus === 'completed' ? 'Round marked done' : 'Round marked upcoming')
  }

  const markComplete = () => {
    if (!detailCompId) return
    const comp = state.competitions.find(c => c.id === detailCompId)!
    dispatch({ type: 'UPDATE_COMPETITION', id: detailCompId, changes: { status: 'completed', celebrationShown: true } })
    setDetailCompId(null)
    setCelebration(comp)
  }

  const handleCertUpload = async (e: React.ChangeEvent<HTMLInputElement>, competitionId = detailCompId, closePrompt = false) => {
    const file = e.target.files?.[0]
    if (!file || !competitionId) return
    try {
      const saved = await localFileService.save('competitions', competitionId, file)
      await dispatch({
        type: 'UPDATE_COMPETITION',
        id: competitionId,
        changes: { certificate: { id: uid(), name: file.name, url: saved.url, localPath: saved.localPath, fileType: file.type, size: file.size } },
      })
      show('Certificate uploaded!')
      if (closePrompt) setCelebration(null)
    } catch (error) { show(error instanceof Error ? error.message : 'Certificate could not be saved') }
    finally { e.target.value = '' }
  }

  const addCompetitionDocument = async (competitionId: string, file: File) => {
    try {
      const saved = await localFileService.save('competitions', competitionId, file)
      await dispatch({ type: 'ADD_COMPETITION_FILE', competitionId, file: { id: uid(), name: file.name, url: saved.url, localPath: saved.localPath, fileType: file.type || 'application/octet-stream', size: file.size } })
      show('Document added')
    } catch (error) { show(error instanceof Error ? error.message : 'Document could not be added') }
  }

  const removeCompetitionFiles = async (fileIds: string[]) => {
    try { await dispatch({ type: 'DELETE_COMPETITION_FILES', fileIds }); show(`${fileIds.length} document${fileIds.length === 1 ? '' : 's'} removed`) }
    catch (error) { show(error instanceof Error ? error.message : 'Documents could not be removed') }
  }

  const renameCompetitionFile = async (fileId: string, name: string) => {
    try { await dispatch({ type: 'RENAME_COMPETITION_FILE', fileId, name }); show('Document renamed') }
    catch (error) { show(error instanceof Error ? error.message : 'Document could not be renamed') }
  }

  const formatDate = (d: string) =>
    new Date(d + 'T00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })

  return (
    <div className="flex flex-col pb-28 min-h-full">
      <ScreenHeader title="Competitions" {...nav} hideSearch action={
        <div className="flex items-center gap-1">
          {state.competitions.length > 0 && <button onClick={() => setClearDialog(true)} className="w-8 h-8 rounded-xl bg-danger/10 text-danger flex items-center justify-center" aria-label="Remove all competition data"><Trash2 size={14} /></button>}
          <button onClick={() => { resetForm(); setAddSheet(true) }} className="flex items-center gap-2 bg-primary text-white text-xs font-semibold p-2 min-[390px]:px-3 rounded-xl shadow-md shadow-primary/20 active:opacity-90 transition-all" aria-label="Add competition">
            <Plus size={14} /> <span className="hidden min-[390px]:inline">New</span>
          </button>
        </div>
      } />

      <div className="px-5 mb-5">
        <Segmented options={['Upcoming', 'Completed']} value={tab} onChange={setTab} />
      </div>

      <div className="px-5">
        {tab === 'Upcoming' && (
          upcoming.length === 0
            ? <EmptyState icon={<span>🏆</span>} title="No upcoming competitions" subtitle="Tap + New to add your first competition." />
            : <div className="flex flex-col gap-3">
                {upcoming.map(c => <CompCard key={c.id} comp={c} onClick={() => setDetailCompId(c.id)} />)}
              </div>
        )}
        {tab === 'Completed' && (
          completed.length === 0
            ? <EmptyState icon={<span>🎉</span>} title="No completed competitions yet" subtitle="Keep competing!" />
            : <div className="flex flex-col gap-3">
                {completed.map(c => <CompCard key={c.id} comp={c} onClick={() => setDetailCompId(c.id)} />)}
              </div>
        )}
      </div>

      {/* Add Competition Sheet */}
      <Sheet open={addSheet} onClose={() => { setAddSheet(false); resetForm() }} title="New Competition">
        <div className="px-5 py-4 pb-8 flex flex-col gap-4">
          {formError && <p className="text-sm text-danger bg-danger/10 px-3 py-2 rounded-xl">{formError}</p>}

          <Field label="Competition Name *">
            <input className={INPUT} placeholder="e.g. Code Sprint 2026" value={formName} onChange={e => setFormName(e.target.value)} />
          </Field>

          <Field label="Team Name *">
            <input className={INPUT} placeholder="e.g. Team Nexus" value={formTeam} onChange={e => setFormTeam(e.target.value)} />
          </Field>

          <Field label="Competition Type">
            <div className="grid grid-cols-2 gap-2">
              {(['hackathon', 'ctf', 'sports', 'other'] as CompetitionType[]).map(t => (
                <button key={t} onClick={() => setFormType(t)}
                  className={`flex items-center gap-2 px-3 py-3 rounded-xl border text-sm font-medium transition-all ${formType === t ? 'border-primary bg-primary/10 text-primary' : 'border-border bg-muted text-fg'}`}>
                  <span>{TYPE_EMOJIS[t]}</span><span>{TYPE_LABELS[t]}</span>
                </button>
              ))}
            </div>
            {formType === 'other' && (
              <input className={`${INPUT} mt-2`} placeholder="Describe the competition type..." value={formCustomType} onChange={e => setFormCustomType(e.target.value)} />
            )}
          </Field>

          <Field label="Competition Date *">
            <input type="date" min={localToday()} className={INPUT} value={formDate} onChange={e => setFormDate(e.target.value)} />
          </Field>

          <Field label="Files & photos (optional)">
            <label className="w-full py-3.5 rounded-xl border-2 border-dashed border-border text-primary text-sm font-semibold flex items-center justify-center gap-2 active:bg-muted cursor-pointer">
              <Paperclip size={16} /> Add competition documents
              <input type="file" multiple accept="image/*,application/pdf,.txt,.csv,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.zip" className="hidden"
                onChange={event => { const added = Array.from(event.target.files || []).map(file => ({ id: uid(), file, name: file.name })); setFormFiles(current => [...current, ...added]); event.target.value = '' }} />
            </label>
            <DraftAttachmentList items={formFiles} onChange={setFormFiles} />
          </Field>

          <button onClick={addCompetition} className="w-full py-4 bg-primary text-white font-semibold rounded-2xl shadow-md shadow-primary/25 active:opacity-90 transition-all mt-1">
            Add Competition
          </button>
        </div>
      </Sheet>

      {/* Competition Detail Sheet */}
      <Sheet open={!!detailComp} onClose={() => setDetailCompId(null)} title="Competition Details">
        {detailComp && (
          <div className="px-5 py-4 pb-8">
            <div className="bg-muted rounded-2xl p-4 mb-5">
              <div className="flex items-start gap-3">
                <span className="text-3xl">{TYPE_EMOJIS[detailComp.type]}</span>
                <div className="flex-1 min-w-0">
                  <h2 className="font-display font-bold text-lg text-fg leading-tight">{detailComp.name}</h2>
                  <div className="flex items-center gap-1.5 mt-1">
                    <Users size={12} className="text-muted-fg" />
                    <span className="text-sm text-muted-fg">{detailComp.teamName}</span>
                  </div>
                  <div className="flex flex-wrap gap-2 mt-2">
                    <span className="text-xs bg-primary/10 text-primary font-semibold px-2 py-0.5 rounded-full">
                      {detailComp.type === 'other' ? detailComp.customType : TYPE_LABELS[detailComp.type]}
                    </span>
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${detailComp.status === 'completed' ? 'bg-success/10 text-success' : 'bg-warning/10 text-warning'}`}>
                      {detailComp.status === 'completed' ? '✓ Completed' : '⏳ Upcoming'}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            <p className="label-micro text-muted-fg mb-3">Competition documents</p>
            <SavedAttachmentList files={detailComp.documents ?? []} label="Documents"
              onOpen={file => openSavedFile(file).catch(error => show(error instanceof Error ? error.message : 'The document could not be opened'))}
              onRename={renameCompetitionFile} onDelete={removeCompetitionFiles} />
            <button onClick={() => documentInputRef.current?.click()}
              className="w-full py-3.5 mb-5 rounded-2xl border border-primary/20 bg-primary/10 text-primary text-sm font-semibold flex items-center justify-center gap-2">
              <Paperclip size={16} /> Add Document
            </button>
            <input ref={documentInputRef} type="file" multiple accept="image/*,application/pdf,.txt,.csv,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.zip" className="hidden"
              onChange={event => { const files = Array.from(event.target.files || []); void Promise.all(files.map(file => addCompetitionDocument(detailComp.id, file))); event.target.value = '' }} />

            {/* Rounds timeline with per-round toggle */}
            <p className="label-micro text-muted-fg mb-3">Rounds</p>
            <div className="flex flex-col gap-2 mb-5">
              {detailComp.rounds.map((round, i) => (
                <div key={round.id} className="flex items-center gap-3 bg-muted rounded-2xl px-4 py-3">
                  <button
                    onClick={() => toggleRound(round.id)}
                    className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 transition-all active:scale-90 ${round.status === 'completed' ? 'bg-success' : 'bg-border border-2 border-muted-fg/30'}`}>
                    {round.status === 'completed'
                      ? <Check size={14} className="text-white" />
                      : <span className="text-xs text-muted-fg font-bold">{i + 1}</span>}
                  </button>
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-fg">{round.label}</p>
                    <p className="text-xs text-muted-fg flex items-center gap-1">
                      <CalendarDays size={10} /> {formatDate(round.date)}
                    </p>
                  </div>
                  <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${round.status === 'completed' ? 'bg-success/10 text-success' : 'bg-muted-fg/10 text-muted-fg'}`}>
                    {round.status === 'completed' ? 'Done' : 'Upcoming'}
                  </span>
                </div>
              ))}
            </div>

            {/* Certificate section */}
            {detailComp.status === 'completed' && (
              <div className="mb-5">
                <p className="label-micro text-muted-fg mb-3">Certificate</p>
                {detailComp.certificate ? (
                  <div>
                    {detailComp.certificate.fileType?.startsWith('image/') && (
                      <img src={detailComp.certificate.url} alt="Certificate" onClick={() => openSavedFile(detailComp.certificate!).catch(error => show(error instanceof Error ? error.message : 'The certificate could not be opened'))}
                        className="w-full max-h-48 object-contain bg-black/5 rounded-2xl mb-2" />
                    )}
                    <SavedAttachmentList files={[detailComp.certificate]} label="Certificate"
                      onOpen={file => openSavedFile(file).catch(error => show(error instanceof Error ? error.message : 'The certificate could not be opened'))}
                      onRename={renameCompetitionFile} onDelete={removeCompetitionFiles} />
                    <button onClick={() => certInputRef.current?.click()} className="w-full text-xs text-primary font-semibold py-2">Replace certificate</button>
                  </div>
                ) : (
                  <button onClick={() => certInputRef.current?.click()}
                    className="w-full py-4 rounded-2xl border-2 border-dashed border-border text-muted-fg text-sm flex items-center justify-center gap-2 active:bg-muted transition-colors">
                    <Camera size={16} /> Upload Certificate
                  </button>
                )}
                <input ref={certInputRef} type="file" accept="image/*,application/pdf"
                  className="hidden" onChange={event => void handleCertUpload(event, detailComp.id)} />
              </div>
            )}

            {/* Actions */}
            <div className="flex flex-col gap-3">
              {detailComp.status !== 'completed' && (
                <>
                  <button onClick={() => setAddRoundSheet(true)}
                    className="w-full py-3.5 rounded-2xl border border-border text-fg-soft font-semibold text-sm active:bg-muted transition-colors">
                    + Add Next Round
                  </button>
                  <button onClick={markComplete}
                    className="w-full py-3.5 bg-success text-white font-semibold rounded-2xl shadow-md shadow-success/20 active:opacity-90 transition-all">
                    Mark as Completed 🎉
                  </button>
                </>
              )}
              <button onClick={() => setDeleteDialog(detailComp.id)}
                className="w-full py-3 text-danger text-sm font-medium active:opacity-70 transition-opacity">
                Delete Competition
              </button>
            </div>
          </div>
        )}
      </Sheet>

      {/* Add Round Sheet */}
      <Sheet open={addRoundSheet} onClose={() => setAddRoundSheet(false)} title="Add Next Round">
        <div className="px-5 py-4 pb-8 flex flex-col gap-4">
          <Field label="Round Label">
            <input className={INPUT} placeholder="e.g. Round 2 / Finals / Semi-final" value={roundLabel} onChange={e => setRoundLabel(e.target.value)} />
          </Field>
          <Field label="Date *">
            <input type="date" min={localToday()} className={INPUT} value={roundDate} onChange={e => setRoundDate(e.target.value)} />
          </Field>
          <button onClick={addRound} className="w-full py-4 bg-primary text-white font-semibold rounded-2xl active:opacity-90 transition-all">
            Add Round
          </button>
        </div>
      </Sheet>

      <Dialog open={!!deleteDialog} onClose={() => setDeleteDialog(null)}
        title="Delete competition?"
        message="This will permanently remove this competition and all its rounds."
        confirmLabel="Delete" confirmVariant="danger"
        onConfirm={() => {
          dispatch({ type: 'DELETE_COMPETITION', id: deleteDialog! })
          setDetailCompId(null); setDeleteDialog(null)
          show('Competition deleted')
        }} />
      <Dialog open={clearDialog} onClose={() => setClearDialog(false)} title="Remove all competition data?" message="This permanently removes every competition, round, document, and saved certificate." confirmLabel="Remove All" confirmVariant="danger" onConfirm={() => { void dispatch({ type: 'CLEAR_COMPETITIONS' }); setClearDialog(false); setDetailCompId(null); show('All competition data removed') }} />

      {/* Celebration popup */}
      {celebration && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-6">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-[3px]" />
          <div className="relative bg-card rounded-3xl p-8 text-center w-full max-w-sm anim-bounceIn">
            <div className="text-6xl mb-4">🎉</div>
            <h2 className="font-display font-bold text-2xl text-fg mb-1">Competition Done!</h2>
            <p className="text-fg-soft text-sm mb-1">{celebration.name}</p>
            <p className="text-fg-soft text-sm mb-2">{celebration.teamName}</p>
            <div className="text-4xl my-5">🥳</div>
            <p className="text-fg-soft mb-5 font-medium">Do you have a certificate to add?</p>
            <div className="flex flex-col gap-2">
              <button onClick={() => promptCertInputRef.current?.click()}
                className="w-full py-4 bg-primary text-white font-display font-bold text-base rounded-2xl shadow-lg shadow-primary/30 active:opacity-90 transition-all">
                Add Certificate
              </button>
              <button onClick={() => setCelebration(null)} className="w-full py-3 text-sm text-muted-fg font-semibold">Not now</button>
            </div>
            <input ref={promptCertInputRef} type="file" accept="image/*,application/pdf" className="hidden"
              onChange={event => void handleCertUpload(event, celebration.id, true)} />
          </div>
        </div>
      )}

      <Snackbar message={snack} show={!!snack} onDismiss={() => setSnack('')} />
    </div>
  )
}

const INPUT = 'w-full px-4 py-3 rounded-xl border border-border bg-muted text-fg focus:outline-none focus:ring-2 focus:ring-primary/30 placeholder:text-muted-fg/50'

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-medium text-muted-fg mb-1.5">{label}</label>
      {children}
    </div>
  )
}

function CompCard({ comp, onClick }: { comp: Competition; onClick: () => void }) {
  const nextRound = comp.rounds.find(r => r.status === 'upcoming') ?? comp.rounds[comp.rounds.length - 1]
  const dateStr = nextRound
    ? new Date(nextRound.date + 'T00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
    : '—'

  return (
    <button onClick={onClick} className="bg-card border border-border rounded-2xl p-4 text-left active:scale-[0.98] transition-transform w-full">
      <div className="flex items-start gap-3">
        <div className="w-11 h-11 rounded-2xl bg-primary/10 flex items-center justify-center text-2xl shrink-0">
          {TYPE_EMOJIS[comp.type]}
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-display font-semibold text-sm text-fg leading-tight">{comp.name}</p>
          <p className="text-xs text-muted-fg mt-0.5">{comp.teamName}</p>
          <div className="flex items-center gap-1.5 mt-2">
            <CalendarDays size={11} className="text-muted-fg" />
            <span className="text-xs text-muted-fg">{dateStr}</span>
          </div>
          {comp.rounds.length > 1 && (
            <p className="text-[10px] text-muted-fg mt-0.5">
              {comp.rounds.filter(r => r.status === 'completed').length}/{comp.rounds.length} rounds done
            </p>
          )}
        </div>
        <div className="flex flex-col items-end gap-2 shrink-0">
          <span className={`text-[10px] font-bold px-2 py-1 rounded-full ${comp.status === 'completed' ? 'bg-success/10 text-success' : 'bg-warning/10 text-warning'}`}>
            {comp.status === 'completed' ? '✓ Done' : 'Upcoming'}
          </span>
          <span className="text-[10px] text-muted-fg bg-muted px-2 py-1 rounded-full">
            {comp.type === 'other' ? (comp.customType || 'Other') : TYPE_LABELS[comp.type]}
          </span>
        </div>
      </div>
    </button>
  )
}
