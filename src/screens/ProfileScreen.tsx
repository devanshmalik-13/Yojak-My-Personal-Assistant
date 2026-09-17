import { useState, useRef } from 'react'
import { ChevronRight, Edit3, RotateCcw, Camera, Settings } from 'lucide-react'
import { useApp } from '../store'
import type { UserProfile, Gender } from '../types'
import { Dialog, Sheet } from '../components/ui'
import { localFileService } from '../services/fileService'
import { validateProfile } from '../services/profileService'

const GENDER_LABELS: Record<Gender, string> = {
  male: 'Male',
  female: 'Female',
  other: 'Other',
  prefer_not_to_say: 'Prefer not to say',
}

const genderOptions: { value: Gender; label: string }[] = [
  { value: 'male', label: 'Male' },
  { value: 'female', label: 'Female' },
  { value: 'other', label: 'Other' },
  { value: 'prefer_not_to_say', label: 'Prefer not to say' },
]

const semesters = ['1st','2nd','3rd','4th','5th','6th','7th','8th']
const currentYear = new Date().getFullYear()
const years = Array.from({ length: 21 }, (_, i) => String(currentYear - 10 + i))

interface ProfileScreenProps {
  onBack: () => void
  onSettings: () => void
}

export default function ProfileScreen({ onBack, onSettings }: ProfileScreenProps) {
  const { state, dispatch } = useApp()
  const [editSheet, setEditSheet] = useState(false)
  const [resetDialog, setResetDialog] = useState(false)
  const [formError, setFormError] = useState('')
  const avatarInputRef = useRef<HTMLInputElement>(null)

  const [form, setForm] = useState<UserProfile>(state.profile)
  const set = (key: keyof UserProfile, val: string) => setForm(f => key === 'yearOfEntry' && Number(f.expectedYearOfPassing) < Number(val) ? { ...f, yearOfEntry: val, expectedYearOfPassing: val } : ({ ...f, [key]: val }))

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    try {
      const saved = await localFileService.save('profile', 'local-user', file)
      await dispatch({ type: 'UPDATE_PROFILE', profile: { ...state.profile, avatar: saved.url, avatarLocalPath: saved.localPath } })
    } catch (error) { setFormError(error instanceof Error ? error.message : 'Could not save avatar') }
    finally { e.target.value = '' }
  }

  const save = () => {
    const errors = validateProfile(form)
    if (Object.keys(errors).length) { setFormError(Object.values(errors)[0]!); return }
    dispatch({ type: 'UPDATE_PROFILE', profile: form })
    setFormError('')
    setEditSheet(false)
  }

  const p = state.profile
  const initials = p.name.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase() || '?'

  return (
    <div className="flex flex-col pb-8 min-h-full">
      {/* Header */}
      <div className="px-5 safe-top pb-6">
        <div className="flex items-center gap-3 mb-4">
          <button onClick={onBack} className="p-2 -ml-2 text-muted-fg">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M19 12H5M12 5l-7 7 7 7" />
            </svg>
          </button>
          <h1 className="font-display font-bold text-xl text-fg flex-1">Profile</h1>
          <button onClick={onSettings} className="w-9 h-9 rounded-xl bg-muted border border-border flex items-center justify-center text-fg-soft" aria-label="Settings"><Settings size={16} /></button>
        </div>

        {/* Avatar + name */}
        <div className="flex flex-col items-center py-6">
          <div className="relative mb-3">
            <div className="w-20 h-20 rounded-full bg-primary/20 flex items-center justify-center overflow-hidden">
              {p.avatar
                ? <img src={p.avatar} alt="Avatar" className="w-full h-full object-cover" />
                : <span className="font-display font-bold text-2xl text-primary">{initials}</span>}
            </div>
            <button onClick={() => avatarInputRef.current?.click()}
              className="absolute -bottom-1 -right-1 w-7 h-7 rounded-full bg-primary flex items-center justify-center shadow-md active:opacity-80 transition-opacity">
              <Camera size={13} className="text-white" />
            </button>
            <input ref={avatarInputRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handleAvatarUpload} />
          </div>
          <h2 className="font-display font-bold text-xl text-fg">{p.name || 'No name set'}</h2>
          <p className="text-sm text-muted-fg mt-0.5">{p.course || 'Course not set'}</p>
          <button
            onClick={() => { setForm(state.profile); setEditSheet(true) }}
            className="flex items-center gap-2 mt-4 bg-primary/10 text-primary px-4 py-2 rounded-xl text-sm font-semibold"
          >
            <Edit3 size={14} /> Edit Profile
          </button>
        </div>
      </div>

      {/* Info Sections */}
      <div className="px-5 flex flex-col gap-4">
        <InfoSection title="Personal Information">
          <InfoRow label="Full Name" value={p.name} />
          <InfoRow label="Phone" value={p.phone} />
          <InfoRow label="Gender" value={GENDER_LABELS[p.gender]} />
          <InfoRow label="Gmail" value={p.gmail || '—'} />
        </InfoSection>

        <InfoSection title="College Information">
          <InfoRow label="College" value={p.college} />
          <InfoRow label="Course" value={p.course} />
          <InfoRow label="Semester" value={p.semester} />
          <InfoRow label="Section" value={p.section} />
          <InfoRow label="Year of Entry" value={p.yearOfEntry} />
          <InfoRow label="Expected Passing" value={p.expectedYearOfPassing} />
        </InfoSection>

        {/* Actions */}
        <div className="bg-card border border-border rounded-2xl overflow-hidden">
          <button
            onClick={() => setResetDialog(true)}
            className="w-full flex items-center gap-3 px-5 py-4 text-left hover:bg-danger/5 transition-colors"
          >
            <RotateCcw size={18} className="text-danger" />
            <div className="flex-1">
              <span className="font-medium text-sm text-danger">Reset App</span>
              <p className="text-xs text-muted-fg">Removes all data</p>
            </div>
            <ChevronRight size={16} className="text-danger" />
          </button>
        </div>
      </div>

      {/* Edit Sheet */}
      <Sheet open={editSheet} onClose={() => setEditSheet(false)} title="Edit Profile">
        <div className="px-5 py-4 pb-8 flex flex-col gap-4">
          {formError && <p className="text-sm text-danger bg-danger/10 px-3 py-2 rounded-xl">{formError}</p>}
          <div>
            <label className="block text-xs font-medium text-muted-fg mb-1.5">Full Name</label>
            <input className="w-full px-4 py-3 rounded-xl border border-border bg-muted text-fg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
              value={form.name} onChange={e => set('name', e.target.value)} />
          </div>
          <div>
            <label className="block text-xs font-medium text-muted-fg mb-1.5">Phone</label>
            <input type="tel" className="w-full px-4 py-3 rounded-xl border border-border bg-muted text-fg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
              value={form.phone} onChange={e => set('phone', e.target.value)} />
          </div>
          <div>
            <label className="block text-xs font-medium text-muted-fg mb-1.5">Gender</label>
            <div className="grid grid-cols-2 gap-2">
              {genderOptions.map(opt => (
                <button key={opt.value} onClick={() => set('gender', opt.value)}
                  className={`px-3 py-2.5 rounded-xl border text-sm font-medium transition-all ${form.gender === opt.value ? 'border-primary bg-primary/10 text-primary' : 'border-border bg-muted text-fg'}`}>
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-muted-fg mb-1.5">Gmail</label>
            <input type="email" className="w-full px-4 py-3 rounded-xl border border-border bg-muted text-fg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
              value={form.gmail} onChange={e => set('gmail', e.target.value)} />
          </div>
          <div>
            <label className="block text-xs font-medium text-muted-fg mb-1.5">College</label>
            <input className="w-full px-4 py-3 rounded-xl border border-border bg-muted text-fg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
              value={form.college} onChange={e => set('college', e.target.value)} />
          </div>
          <div>
            <label className="block text-xs font-medium text-muted-fg mb-1.5">Course</label>
            <input className="w-full px-4 py-3 rounded-xl border border-border bg-muted text-fg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
              value={form.course} onChange={e => set('course', e.target.value)} />
          </div>
          <div>
            <label className="block text-xs font-medium text-muted-fg mb-1.5">Semester</label>
            <div className="flex gap-2 flex-wrap">
              {semesters.map(s => (
                <button key={s} onClick={() => set('semester', s)}
                  className={`px-3 py-2 rounded-xl border text-sm font-medium transition-all ${form.semester === s ? 'border-primary bg-primary/10 text-primary' : 'border-border bg-muted text-fg'}`}>
                  {s}
                </button>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-muted-fg mb-1.5">Section</label>
              <input className="w-full px-4 py-3 rounded-xl border border-border bg-muted text-fg focus:outline-none"
                value={form.section} onChange={e => set('section', e.target.value)} />
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-fg mb-1.5">Year of Entry</label>
              <select value={form.yearOfEntry} onChange={e => set('yearOfEntry', e.target.value)}
                className="w-full px-4 py-3 rounded-xl border border-border bg-muted text-fg focus:outline-none">
                {years.map(y => <option key={y} value={y}>{y}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-muted-fg mb-1.5">Expected Year of Passing</label>
            <select value={form.expectedYearOfPassing} onChange={e => set('expectedYearOfPassing', e.target.value)}
              className="w-full px-4 py-3 rounded-xl border border-border bg-muted text-fg focus:outline-none focus:ring-2 focus:ring-primary/30">
              {years.filter(y => Number(y) >= Number(form.yearOfEntry)).map(y => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
          <button onClick={save} className="w-full py-4 bg-primary text-white font-semibold rounded-2xl shadow-md shadow-primary/25 active:opacity-90 transition-all">
            Save Changes
          </button>
        </div>
      </Sheet>

      <Dialog
        open={resetDialog}
        onClose={() => setResetDialog(false)}
        title="Reset App?"
        message="This will permanently delete all your data — attendance, assignments, competitions, expenses, and reminders. This cannot be undone."
        confirmLabel="Reset Everything"
        confirmVariant="danger"
        onConfirm={() => dispatch({ type: 'RESET_APP' })}
      />
    </div>
  )
}

function InfoSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs font-semibold text-muted-fg uppercase tracking-wide mb-2 px-1">{title}</p>
      <div className="bg-card border border-border rounded-2xl overflow-hidden">
        {children}
      </div>
    </div>
  )
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between px-5 py-3.5 border-b border-border last:border-0">
      <span className="text-sm text-muted-fg">{label}</span>
      <span className="text-sm font-medium text-fg text-right max-w-[60%] truncate">{value || '—'}</span>
    </div>
  )
}
