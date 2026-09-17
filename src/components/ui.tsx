import { ReactNode, useEffect, useRef } from 'react'
import { X } from 'lucide-react'
import { useBackHandler } from '../hooks/useBackHandler'

// ── Progress Bar ──────────────────────────────────────────────────────────────

interface ProgressBarProps {
  value: number // 0–100
  threshold?: number
  className?: string
  height?: string
  color?: string
}

export function ProgressBar({ value, threshold, className = '', height = 'h-2.5', color }: ProgressBarProps) {
  const pct = Math.max(0, Math.min(100, value))
  const barColor = color || (
    threshold && value < threshold ? 'bg-danger' :
    threshold && value < threshold + 5 ? 'bg-warning' :
    'bg-primary'
  )
  return (
    <div className={`w-full ${height} rounded-full bg-muted overflow-hidden ${className}`}>
      <div
        className={`h-full rounded-full transition-all duration-500 ${barColor}`}
        style={{ width: `${pct}%` }}
      />
    </div>
  )
}

// ── Status Chip ───────────────────────────────────────────────────────────────

interface StatusChipProps {
  label: string
  variant: 'success' | 'danger' | 'warning' | 'info' | 'muted' | 'primary'
  size?: 'sm' | 'xs'
}

const chipColors: Record<string, string> = {
  success: 'bg-success/15 text-success',
  danger:  'bg-danger/15 text-danger',
  warning: 'bg-warning/15 text-warning',
  info:    'bg-blue-500/15 text-blue-600 dark:text-blue-400',
  muted:   'bg-muted text-muted-fg',
  primary: 'bg-primary/15 text-primary',
}

export function StatusChip({ label, variant, size = 'sm' }: StatusChipProps) {
  const sz = size === 'xs' ? 'text-[10px] px-1.5 py-0.5' : 'text-xs px-2 py-0.5'
  return (
    <span className={`inline-flex items-center rounded-full font-medium ${sz} ${chipColors[variant]}`}>
      {label}
    </span>
  )
}

// ── Bottom Sheet ──────────────────────────────────────────────────────────────

interface SheetProps {
  open: boolean
  onClose: () => void
  title?: string
  children: ReactNode
  className?: string
}

export function Sheet({ open, onClose, title, children, className = '' }: SheetProps) {
  useBackHandler(open, () => { onClose(); return true })
  useEffect(() => {
    if (open) document.body.style.overflow = 'hidden'
    else document.body.style.overflow = ''
    return () => { document.body.style.overflow = '' }
  }, [open])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end">
      <div className="absolute inset-0 bg-black/55 backdrop-blur-[3px]" onClick={onClose} />
      <div className={`relative bg-card rounded-t-3xl max-h-[92vh] border-t border-border flex flex-col anim-slideUp ledger-grid ${className}`}>
        {/* Handle */}
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 rounded-full bg-muted-fg/35" />
        </div>
        {/* Header */}
        {title && (
          <div className="flex items-center justify-between px-5 pt-2 pb-3 border-b border-border bg-card/90 backdrop-blur-xl">
            <h2 className="font-display font-bold text-xl text-fg">{title}</h2>
            <button onClick={onClose} className="p-1.5 rounded-full text-muted-fg hover:text-fg hover:bg-muted transition-colors">
              <X size={18} />
            </button>
          </div>
        )}
        <div className="overflow-y-auto flex-1 overscroll-contain">
          {children}
        </div>
      </div>
    </div>
  )
}

// ── Dialog ────────────────────────────────────────────────────────────────────

interface DialogProps {
  open: boolean
  onClose: () => void
  title: string
  message?: string
  children?: ReactNode
  confirmLabel?: string
  confirmVariant?: 'danger' | 'primary'
  onConfirm?: () => void
  cancelLabel?: string
}

export function Dialog({ open, onClose, title, message, children, confirmLabel, confirmVariant = 'primary', onConfirm, cancelLabel = 'Cancel' }: DialogProps) {
  useBackHandler(open, () => { onClose(); return true })
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-6">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-[2px]" onClick={onClose} />
      <div className="relative bg-card rounded-2xl w-full max-w-sm p-6 shadow-xl anim-scaleIn">
        <h2 className="font-display font-semibold text-lg text-fg mb-2">{title}</h2>
        {message && <p className="text-sm text-fg-soft leading-relaxed mb-4">{message}</p>}
        {children}
        {(onConfirm || cancelLabel) && (
          <div className="flex gap-3 mt-5">
            <button onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-border text-fg-soft font-medium text-sm hover:bg-muted transition-colors">
              {cancelLabel}
            </button>
            {onConfirm && (
              <button
                onClick={() => { onConfirm(); onClose() }}
                className={`flex-1 py-2.5 rounded-xl font-medium text-sm transition-colors ${
                  confirmVariant === 'danger'
                    ? 'bg-danger text-white hover:opacity-90'
                    : 'bg-primary text-white hover:opacity-90'
                }`}
              >
                {confirmLabel}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Snackbar ──────────────────────────────────────────────────────────────────

interface SnackbarProps {
  message: string
  show: boolean
  onUndo?: () => void
  onDismiss?: () => void
}

export function Snackbar({ message, show, onUndo, onDismiss }: SnackbarProps) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (show && onDismiss) {
      timer.current = setTimeout(onDismiss, 4000)
      return () => { if (timer.current) clearTimeout(timer.current) }
    }
  }, [show, onDismiss])

  if (!show) return null

  return (
    <div className="fixed bottom-24 left-4 right-4 z-50 flex items-center justify-between bg-fg text-bg rounded-xl px-4 py-3 shadow-lg anim-slideUp max-w-sm mx-auto">
      <span className="text-sm font-medium">{message}</span>
      {onUndo && (
        <button onClick={onUndo} className="text-primary font-semibold text-sm ml-4 shrink-0">
          UNDO
        </button>
      )}
    </div>
  )
}

// ── Card ──────────────────────────────────────────────────────────────────────

export function Card({ children, className = '', onClick }: { children: ReactNode; className?: string; onClick?: () => void }) {
  return (
    <div
      className={`bg-card rounded-2xl border border-border ${className} ${onClick ? 'cursor-pointer active:scale-[0.98] transition-transform' : ''}`}
      onClick={onClick}
    >
      {children}
    </div>
  )
}

// ── Section Header ────────────────────────────────────────────────────────────

export function SectionHeader({ title, action, onAction }: { title: string; action?: string; onAction?: () => void }) {
  return (
    <div className="flex items-center justify-between mb-3">
      <h2 className="font-display font-semibold text-base text-fg">{title}</h2>
      {action && (
        <button onClick={onAction} className="text-primary text-sm font-medium">
          {action}
        </button>
      )}
    </div>
  )
}

// ── Empty State ───────────────────────────────────────────────────────────────

export function EmptyState({ icon, title, subtitle }: { icon: ReactNode | string; title: string; subtitle?: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 px-6 text-center">
      <div className="text-4xl mb-3 opacity-50">{icon}</div>
      <p className="font-display font-semibold text-fg mb-1">{title}</p>
      {subtitle && <p className="text-sm text-muted-fg">{subtitle}</p>}
    </div>
  )
}

// ── Avatar ────────────────────────────────────────────────────────────────────

export function Avatar({ name, size = 'md', onClick }: { name: string; size?: 'sm' | 'md' | 'lg'; onClick?: () => void }) {
  const initials = name ? name.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase() : '?'
  const sz = size === 'sm' ? 'w-8 h-8 text-xs' : size === 'lg' ? 'w-14 h-14 text-xl' : 'w-10 h-10 text-sm'
  return (
    <button
      onClick={onClick}
      className={`${sz} rounded-full bg-primary/20 text-primary font-display font-semibold flex items-center justify-center shrink-0 transition-opacity active:opacity-70`}
    >
      {initials}
    </button>
  )
}

// ── Top App Bar ───────────────────────────────────────────────────────────────

interface TopBarProps {
  title?: string
  subtitle?: string
  onBack?: () => void
  right?: ReactNode
}

export function TopBar({ title, subtitle, onBack, right }: TopBarProps) {
  return (
    <div className="flex items-center gap-3 px-5 safe-top pb-3">
      {onBack && (
        <button onClick={onBack} className="p-1.5 -ml-1.5 text-muted-fg hover:text-fg transition-colors">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M19 12H5M12 5l-7 7 7 7" />
          </svg>
        </button>
      )}
      <div className="flex-1 min-w-0">
        {title && <h1 className="font-display font-bold text-lg text-fg leading-tight">{title}</h1>}
        {subtitle && <p className="text-xs text-muted-fg">{subtitle}</p>}
      </div>
      {right}
    </div>
  )
}

// ── Input ─────────────────────────────────────────────────────────────────────

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string
  error?: string
}

export function Input({ label, error, className = '', ...props }: InputProps) {
  return (
    <div className="w-full">
      {label && <label className="block text-xs font-medium text-muted-fg mb-1.5">{label}</label>}
      <input
        className={`w-full px-4 py-3 rounded-xl border bg-muted text-fg placeholder:text-muted-fg/60 text-base focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-colors ${error ? 'border-danger' : 'border-border'} ${className}`}
        {...props}
      />
      {error && <p className="text-xs text-danger mt-1">{error}</p>}
    </div>
  )
}

// ── Pill Button ───────────────────────────────────────────────────────────────

export function PillButton({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`px-4 py-1.5 rounded-full text-sm font-medium transition-all ${
        active ? 'bg-primary text-white' : 'bg-muted text-muted-fg hover:text-fg'
      }`}
    >
      {label}
    </button>
  )
}

// ── Segmented Control ─────────────────────────────────────────────────────────

export function Segmented({ options, value, onChange }: { options: string[]; value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex bg-muted rounded-xl p-1 gap-1">
      {options.map(opt => (
        <button
          key={opt}
          onClick={() => onChange(opt)}
          className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all ${
            value === opt ? 'bg-card text-fg shadow-sm' : 'text-muted-fg'
          }`}
        >
          {opt}
        </button>
      ))}
    </div>
  )
}

// ── Numeric Keypad ────────────────────────────────────────────────────────────

interface NumpadProps {
  value: string
  onChange: (v: string) => void
  onConfirm: () => void
}

export function Numpad({ value, onChange, onConfirm }: NumpadProps) {
  const keys = ['1','2','3','4','5','6','7','8','9','.','0','⌫']
  const press = (k: string) => {
    if (k === '⌫') onChange(value.slice(0, -1))
    else if (k === '.' && value.includes('.')) return
    else onChange(value + k)
  }
  return (
    <div className="grid grid-cols-3 gap-2">
      {keys.map(k => (
        <button
          key={k}
          onClick={() => press(k)}
          className={`py-4 rounded-xl text-lg font-semibold transition-colors active:scale-95 ${
            k === '⌫' ? 'text-muted-fg bg-muted' : 'bg-muted text-fg hover:bg-border'
          }`}
        >
          {k}
        </button>
      ))}
      <button
        onClick={onConfirm}
        className="col-span-3 py-4 rounded-xl bg-primary text-white font-semibold text-base transition-all active:opacity-90"
      >
        Add ✓
      </button>
    </div>
  )
}
