import { useState } from 'react'
import { ChevronRight, Camera, CheckCircle2 } from 'lucide-react'
import { useApp, uid } from '../store'
import type { UserProfile, Gender } from '../types'
import { Input } from '../components/ui'
import { validateProfile } from '../services/profileService'

type Step = 'namaste' | 'intro' | 'personal' | 'college' | 'done'

const genderOptions: { value: Gender; label: string; emoji: string }[] = [
  { value: 'male', label: 'Male', emoji: '👨‍🎓' },
  { value: 'female', label: 'Female', emoji: '👩‍🎓' },
  { value: 'other', label: 'Other', emoji: '🎓' },
  { value: 'prefer_not_to_say', label: 'Prefer not to say', emoji: '🙂' },
]

const semesters = ['1st', '2nd', '3rd', '4th', '5th', '6th', '7th', '8th']
const currentYear = new Date().getFullYear()
const years = Array.from({ length: 21 }, (_, i) => String(currentYear - 10 + i))

export default function Onboarding() {
  const { dispatch } = useApp()
  const [step, setStep] = useState<Step>('namaste')
  const [animKey, setAnimKey] = useState(0)

  const [form, setForm] = useState<UserProfile>({
    name: '', phone: '', gender: 'prefer_not_to_say', gmail: '', avatar: null,
    college: '', course: '', semester: '3rd', section: 'A',
    yearOfEntry: '2024', expectedYearOfPassing: '2028',
  })
  const [errors, setErrors] = useState<Record<string, string>>({})

  const set = (key: keyof UserProfile, val: string) => {
    setForm(f => {
      if (key === 'yearOfEntry' && Number(f.expectedYearOfPassing) < Number(val)) {
        return { ...f, yearOfEntry: val, expectedYearOfPassing: val }
      }
      return { ...f, [key]: val }
    })
    setErrors(e => ({ ...e, [key]: '' }))
  }

  const go = (next: Step) => {
    setAnimKey(k => k + 1)
    setTimeout(() => setStep(next), 50)
  }

  const validatePersonal = () => {
    const errs: Record<string, string> = {}
    if (!form.name.trim()) errs.name = 'Name is required'
    if (!form.phone.trim()) errs.phone = 'Phone number is required'
    if (form.phone && !/^\+?[0-9]{10,13}$/.test(form.phone.replace(/\s/g, ''))) {
      errs.phone = 'Enter a valid phone number'
    }
    if (form.gmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.gmail)) errs.gmail = 'Enter a valid email address'
    setErrors(errs)
    return Object.keys(errs).length === 0
  }

  const validateCollege = () => {
    const errs: Record<string, string> = {}
    if (!form.college.trim()) errs.college = 'College name is required'
    if (!form.course.trim()) errs.course = 'Course name is required'
    if (Number(form.expectedYearOfPassing) < Number(form.yearOfEntry)) {
      errs.expectedYearOfPassing = 'Passing year cannot be before joining year'
    }
    setErrors(errs)
    return Object.keys(errs).length === 0
  }

  const handleFinish = () => {
    const validation = validateProfile(form)
    if (Object.keys(validation).length) { setErrors(validation); go('college'); return }
    dispatch({ type: 'COMPLETE_ONBOARDING', profile: form })
  }

  const progressSteps: Step[] = ['personal', 'college']
  const currentProgress = progressSteps.indexOf(step)

  // ── Namaste ────────────────────────────────────────────────────────────────
  if (step === 'namaste') {
    return (
      <div className="flex flex-col min-h-dvh bg-bg px-8">
        {/* Top wordmark */}
        <div className="pt-16 pb-0">
          <p className="font-display font-medium text-xs tracking-[0.22em] uppercase text-muted-fg">My Personal</p>
          <p className="font-display font-bold text-xs tracking-[0.22em] uppercase text-primary">Assistant</p>
        </div>

        {/* Center hero */}
        <div key={animKey} className="flex-1 flex flex-col justify-center anim-fadeIn">
          {/* Abstract mark — two overlapping rounded squares */}
          <div className="relative w-16 h-16 mb-10">
            <div className="absolute inset-0 rounded-2xl bg-primary/20" style={{ transform: 'rotate(12deg)' }} />
            <div className="absolute inset-1 rounded-xl bg-primary/40" style={{ transform: 'rotate(-6deg)' }} />
            <div className="absolute inset-2.5 rounded-lg bg-primary flex items-center justify-center">
              <div className="w-3 h-3 rounded-full bg-white/70" />
            </div>
          </div>

          <h1 className="font-display font-bold text-fg leading-[1.05] mb-4"
            style={{ fontSize: 'clamp(2.6rem, 12vw, 3.5rem)', letterSpacing: '-0.03em' }}>
            Namaste.
          </h1>
          <p className="text-fg-soft text-base leading-relaxed max-w-[260px]">
            Your college life,<br />beautifully organised.
          </p>
        </div>

        {/* Bottom button — blended */}
        <div className="pb-12">
          <button
            onClick={() => go('intro')}
            className="w-full flex items-center justify-between bg-fg/[0.07] border border-fg/10 text-fg font-semibold py-4 px-6 rounded-2xl active:bg-fg/10 transition-colors"
          >
            <span>Get Started</span>
            <span className="w-7 h-7 rounded-full bg-primary flex items-center justify-center">
              <ChevronRight size={15} className="text-white" />
            </span>
          </button>
        </div>
      </div>
    )
  }

  // ── Intro ──────────────────────────────────────────────────────────────────
  if (step === 'intro') {
    return (
      <div className="flex flex-col items-center justify-center min-h-dvh bg-bg px-8 text-center">
        <div key={animKey} className="anim-fadeIn">
          <div className="w-20 h-20 rounded-3xl bg-primary/15 flex items-center justify-center mx-auto mb-6">
            <span className="text-4xl">🤖</span>
          </div>
          <h2 className="font-display font-bold text-3xl text-fg leading-tight">
            Hi, I'm
          </h2>
          <h1 className="font-display font-bold text-3xl text-primary leading-tight mb-4">
            My Personal Assistant
          </h1>
          <p className="text-fg-soft text-sm leading-relaxed max-w-xs mx-auto">
            I'll help you track attendance, assignments, competitions, reminders, and expenses — all in one place.
          </p>

          <div className="mt-8 grid grid-cols-2 gap-3 max-w-xs mx-auto text-left">
            {[
              ['📅', 'Attendance'],
              ['📚', 'Assignments'],
              ['🔔', 'Reminders'],
              ['🏆', 'Competitions'],
              ['💰', 'Expenses'],
              ['✨', 'All for you'],
            ].map(([icon, label]) => (
              <div key={label} className="flex items-center gap-2 bg-card border border-border rounded-xl px-3 py-2">
                <span className="text-base">{icon}</span>
                <span className="text-sm font-medium text-fg">{label}</span>
              </div>
            ))}
          </div>
        </div>

        <button
          onClick={() => go('personal')}
          className="mt-10 flex items-center gap-2 bg-primary text-white font-semibold py-4 px-8 rounded-2xl shadow-lg shadow-primary/25 active:scale-95 transition-all"
        >
          Let's Begin <ChevronRight size={18} />
        </button>
      </div>
    )
  }

  // ── Done ───────────────────────────────────────────────────────────────────
  if (step === 'done') {
    return (
      <div className="flex flex-col items-center justify-center min-h-dvh bg-bg px-8 text-center">
        <div key={animKey} className="anim-bounceIn">
          <div className="w-24 h-24 rounded-full bg-success/15 flex items-center justify-center mx-auto mb-6">
            <CheckCircle2 size={48} className="text-success" />
          </div>
          <p className="text-muted-fg text-base mb-2">You're all set!</p>
          <h1 className="font-display font-bold text-4xl text-fg">
            Hello, {form.name.split(' ')[0]}.
          </h1>
          <p className="text-fg-soft mt-3 text-sm max-w-xs mx-auto">
            Your personal assistant is ready. Let's make this semester count.
          </p>
        </div>
        <button
          onClick={handleFinish}
          className="mt-12 bg-fg/[0.07] border border-fg/10 text-fg font-semibold py-4 px-12 rounded-2xl active:bg-fg/10 transition-colors anim-fadeIn"
        >
          Enter App
        </button>
      </div>
    )
  }

  // ── Personal & College Forms ───────────────────────────────────────────────
  return (
    <div className="min-h-dvh bg-bg flex flex-col">
      {/* Progress */}
      <div className="px-5 pt-14 pb-4">
        <div className="flex gap-1.5 mb-6">
          {progressSteps.map((s, i) => (
            <div key={s} className={`flex-1 h-1.5 rounded-full transition-all ${i <= currentProgress ? 'bg-primary' : 'bg-muted'}`} />
          ))}
        </div>
        <p className="text-xs text-muted-fg font-medium uppercase tracking-wide">
          Step {currentProgress + 1} of {progressSteps.length}
        </p>
      </div>

      {/* Personal Information */}
      {step === 'personal' && (
        <div key={animKey} className="flex-1 px-5 anim-fadeIn">
          <h1 className="font-display font-bold text-2xl text-fg mb-1">Personal Information</h1>
          <p className="text-sm text-muted-fg mb-8">Let's start with your basic details.</p>

          <div className="flex flex-col gap-4">
            {/* Avatar placeholder */}
            <div className="flex justify-center mb-2">
              <div className="relative">
                <div className="w-20 h-20 rounded-full bg-primary/15 flex items-center justify-center">
                  <span className="font-display font-bold text-2xl text-primary">
                    {form.name ? form.name[0].toUpperCase() : '?'}
                  </span>
                </div>
                <button className="absolute -bottom-1 -right-1 w-7 h-7 rounded-full bg-primary flex items-center justify-center shadow">
                  <Camera size={13} className="text-white" />
                </button>
              </div>
            </div>

            <Input label="Full Name *" placeholder="e.g. Arjun Sharma" value={form.name} onChange={e => set('name', e.target.value)} error={errors.name} />
            <Input label="Phone Number *" placeholder="+91 98765 43210" type="tel" value={form.phone} onChange={e => set('phone', e.target.value)} error={errors.phone} />

            <div>
              <label className="block text-xs font-medium text-muted-fg mb-1.5">Gender</label>
              <div className="grid grid-cols-2 gap-2">
                {genderOptions.map(opt => (
                  <button
                    key={opt.value}
                    onClick={() => set('gender', opt.value)}
                    className={`flex items-center gap-2.5 px-3 py-3 rounded-xl border text-sm font-medium transition-all ${
                      form.gender === opt.value
                        ? 'border-primary bg-primary/10 text-primary'
                        : 'border-border bg-muted text-fg'
                    }`}
                  >
                    <span>{opt.emoji}</span>
                    <span>{opt.label}</span>
                  </button>
                ))}
              </div>
            </div>

            <Input label="Gmail (optional)" placeholder="you@gmail.com" type="email" value={form.gmail} onChange={e => set('gmail', e.target.value)} error={errors.gmail} />
          </div>
        </div>
      )}

      {/* College Information */}
      {step === 'college' && (
        <div key={animKey} className="flex-1 px-5 anim-fadeIn">
          <h1 className="font-display font-bold text-2xl text-fg mb-1">College Information</h1>
          <p className="text-sm text-muted-fg mb-8">Tell me about your academic details.</p>

          <div className="flex flex-col gap-4">
            <Input label="College Name *" placeholder="e.g. VJTI Mumbai" value={form.college} onChange={e => set('college', e.target.value)} error={errors.college} />
            <Input label="Course / Branch *" placeholder="e.g. B.E. Computer Engineering" value={form.course} onChange={e => set('course', e.target.value)} error={errors.course} />
            <Input label="Section" placeholder="e.g. A" value={form.section} onChange={e => set('section', e.target.value)} />

            <div>
              <label className="block text-xs font-medium text-muted-fg mb-1.5">Semester</label>
              <div className="flex gap-2 flex-wrap">
                {semesters.map(s => (
                  <button
                    key={s}
                    onClick={() => set('semester', s)}
                    className={`px-3 py-2 rounded-xl border text-sm font-medium transition-all ${
                      form.semester === s
                        ? 'border-primary bg-primary/10 text-primary'
                        : 'border-border bg-muted text-fg'
                    }`}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-muted-fg mb-1.5">Year of Entry</label>
                <select
                  value={form.yearOfEntry}
                  onChange={e => set('yearOfEntry', e.target.value)}
                  className="w-full px-4 py-3 rounded-xl border border-border bg-muted text-fg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                >
                  {years.map(y => <option key={y} value={y}>{y}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-muted-fg mb-1.5">Expected Passing</label>
                <select
                  value={form.expectedYearOfPassing}
                  onChange={e => set('expectedYearOfPassing', e.target.value)}
                  className="w-full px-4 py-3 rounded-xl border border-border bg-muted text-fg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                >
                  {years.filter(y => Number(y) >= Number(form.yearOfEntry)).map(y => <option key={y} value={y}>{y}</option>)}
                </select>
                {errors.expectedYearOfPassing && <p className="text-xs text-danger mt-1">{errors.expectedYearOfPassing}</p>}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Navigation */}
      <div className="px-5 py-6 flex gap-3 mt-4">
        {step !== 'personal' && (
          <button
            onClick={() => go(step === 'college' ? 'personal' : 'intro')}
            className="px-6 py-3.5 rounded-2xl border border-border text-fg-soft font-medium text-sm active:bg-muted transition-colors"
          >
            Back
          </button>
        )}
        <button
          onClick={() => {
            if (step === 'personal' && validatePersonal()) go('college')
            else if (step === 'college' && validateCollege()) go('done')
          }}
          className="flex-1 flex items-center justify-center gap-2 bg-primary text-white font-semibold py-3.5 rounded-2xl shadow-md shadow-primary/25 active:opacity-90 transition-all"
        >
          {step === 'college' ? 'Complete Setup' : 'Continue'}
          <ChevronRight size={18} />
        </button>
      </div>
    </div>
  )
}
