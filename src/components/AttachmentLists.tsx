import { useEffect, useState } from 'react'
import { Check, FileText, Pencil, Trash2, X } from 'lucide-react'
import type { FileAttachment } from '../types'

export interface DraftAttachment {
  id: string
  file: File
  name: string
}

export function DraftAttachmentList({ items, onChange }: {
  items: DraftAttachment[]
  onChange: (items: DraftAttachment[]) => void
}) {
  if (!items.length) return null
  return (
    <div className="mt-3 flex flex-col gap-2">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-fg">Draft documents ({items.length})</p>
      {items.map(item => (
        <div key={item.id} className="flex items-center gap-2 bg-muted rounded-xl px-3 py-2">
          <FileText size={15} className="text-primary shrink-0" />
          <input value={item.name} maxLength={120} aria-label={`Display name for ${item.file.name}`}
            onChange={event => onChange(items.map(current => current.id === item.id ? { ...current, name: event.target.value } : current))}
            className="min-w-0 flex-1 bg-card border border-border rounded-lg px-2 py-1.5 text-xs text-fg focus:outline-none focus:ring-2 focus:ring-primary/30" />
          <button type="button" onClick={() => onChange(items.filter(current => current.id !== item.id))}
            className="p-1.5 text-danger rounded-lg active:bg-danger/10" aria-label={`Remove ${item.name}`}><X size={14} /></button>
        </div>
      ))}
      <p className="text-[10px] text-muted-fg">Edit each name now, for example “Question Sheet” or “My Answers”.</p>
    </div>
  )
}

export function SavedAttachmentList({ files, label = 'Attachments', onOpen, onRename, onDelete }: {
  files: FileAttachment[]
  label?: string
  onOpen: (file: FileAttachment) => void
  onRename: (fileId: string, name: string) => void
  onDelete: (fileIds: string[]) => void
}) {
  const [selected, setSelected] = useState<string[]>([])
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingName, setEditingName] = useState('')
  useEffect(() => setSelected(current => current.filter(id => files.some(file => file.id === id))), [files])
  if (!files.length) return null
  const saveName = (file: FileAttachment) => {
    const name = editingName.trim()
    if (name && name !== file.name) onRename(file.id, name)
    setEditingId(null)
  }
  return (
    <div className="mb-5">
      <div className="flex items-center justify-between gap-2 mb-2">
        <p className="text-xs font-medium text-muted-fg">{label} ({files.length})</p>
        {selected.length > 0 && <button onClick={() => { onDelete(selected); setSelected([]) }}
          className="flex items-center gap-1 text-xs font-semibold text-danger bg-danger/10 px-2.5 py-1.5 rounded-lg"><Trash2 size={12} /> Remove selected ({selected.length})</button>}
      </div>
      {files.map(file => {
        const checked = selected.includes(file.id)
        return (
          <div key={file.id} className={`flex items-center gap-2 rounded-xl px-3 py-2.5 mb-2 border ${checked ? 'bg-primary/10 border-primary/30' : 'bg-muted border-transparent'}`}>
            <button onClick={() => setSelected(current => checked ? current.filter(id => id !== file.id) : [...current, file.id])}
              className={`w-6 h-6 rounded-lg border flex items-center justify-center shrink-0 ${checked ? 'bg-primary border-primary text-white' : 'bg-card border-border text-transparent'}`}
              aria-label={`${checked ? 'Unselect' : 'Select'} ${file.name}`}><Check size={13} /></button>
            <FileText size={15} className="text-primary shrink-0" />
            {editingId === file.id ? (
              <input autoFocus value={editingName} maxLength={120} onChange={event => setEditingName(event.target.value)}
                onKeyDown={event => { if (event.key === 'Enter') saveName(file); if (event.key === 'Escape') setEditingId(null) }}
                className="min-w-0 flex-1 bg-card border border-primary/30 rounded-lg px-2 py-1.5 text-xs text-fg" />
            ) : <button onClick={() => onOpen(file)} className="min-w-0 flex-1 text-sm text-fg truncate text-left">{file.name}</button>}
            {editingId === file.id ? (
              <button onClick={() => saveName(file)} className="p-1.5 text-success" aria-label="Save file name"><Check size={14} /></button>
            ) : (
              <button onClick={() => { setEditingId(file.id); setEditingName(file.name) }} className="p-1.5 text-muted-fg" aria-label={`Rename ${file.name}`}><Pencil size={13} /></button>
            )}
            <button onClick={() => onOpen(file)} className="text-xs text-primary font-semibold px-1">Open</button>
          </div>
        )
      })}
    </div>
  )
}
