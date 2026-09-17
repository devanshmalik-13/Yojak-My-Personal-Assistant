import { Bell, Search, Settings } from 'lucide-react'
import type { ReactNode } from 'react'

export interface HeaderNav {
  onSearch: () => void
  onAlerts: () => void
  onSettings: () => void
  onProfile: () => void
  unread: number
  name: string
}

interface ScreenHeaderProps extends HeaderNav {
  /** Greeting mode: shows "Good morning, Name" */
  greeting?: boolean
  /** Plain title mode */
  title?: string
  /** Extra button rendered to the left of the nav icons (e.g. + Add) */
  action?: ReactNode
  hideSearch?: boolean
}

function greeting() {
  const h = new Date().getHours()
  if (h < 12) return 'Good morning'
  if (h < 17) return 'Good afternoon'
  return 'Good evening'
}

export default function ScreenHeader({
  greeting: showGreeting,
  title,
  action,
  onSearch, onAlerts, onSettings, onProfile,
  unread, name, hideSearch = false,
}: ScreenHeaderProps) {
  const initials = name.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase() || '?'

  return (
    <div className="flex items-center gap-3 px-5 safe-top pb-4 border-b border-border/70 bg-bg/95 backdrop-blur-xl">
      {/* Left: title or greeting */}
      <div className="flex-1 min-w-0">
        {showGreeting ? (
          <>
            <p className="font-display text-sm text-fg-soft mb-0.5">{greeting()},</p>
            <h1 className="font-display font-bold text-fg leading-none truncate"
              style={{ fontSize: '2rem', letterSpacing: '-0.035em' }}>
              {name.split(' ')[0] || 'there'}
            </h1>
          </>
        ) : (
          <h1 className="font-display font-bold text-fg tracking-tight truncate text-2xl"
            style={{ letterSpacing: '-0.035em' }}>{title}</h1>
        )}
      </div>

      {/* Right: actions */}
      <div className="flex items-center gap-1 min-[390px]:gap-2 shrink-0">
        {action}

        {!hideSearch && <button
          onClick={onSearch}
          className="w-8 h-8 min-[390px]:w-9 min-[390px]:h-9 rounded-full bg-muted border border-border flex items-center justify-center text-fg-soft active:bg-border transition-colors"
          aria-label="Search"
        >
          <Search size={16} strokeWidth={2} />
        </button>}

        <button
          onClick={onAlerts}
          className="relative w-8 h-8 min-[390px]:w-9 min-[390px]:h-9 rounded-full bg-muted border border-border flex items-center justify-center text-fg-soft active:bg-border transition-colors"
          aria-label="Notifications"
        >
          <Bell size={16} strokeWidth={2} />
          {unread > 0 && (
            <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-danger" />
          )}
        </button>

        <button
          onClick={onSettings}
          className="w-8 h-8 min-[390px]:w-9 min-[390px]:h-9 rounded-full bg-muted border border-border flex items-center justify-center text-fg-soft active:bg-border transition-colors"
          aria-label="Settings"
        >
          <Settings size={16} strokeWidth={2} />
        </button>

        <button
          onClick={onProfile}
          className="w-8 h-8 min-[390px]:w-9 min-[390px]:h-9 rounded-full bg-primary flex items-center justify-center font-bold text-white dark:text-[#062117] text-xs active:opacity-70 transition-opacity"
          aria-label="Profile"
        >
          {initials}
        </button>
      </div>
    </div>
  )
}
