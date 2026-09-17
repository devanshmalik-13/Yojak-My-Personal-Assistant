import { BookOpen, CalendarCheck2, Home, Trophy, Wallet } from 'lucide-react'
import type { NavTab } from '../types'

interface BottomNavProps {
  active: NavTab
  onChange: (tab: NavTab) => void
}

const MAIN_TABS: { id: NavTab; label: string; Icon: typeof Home }[] = [
  { id: 'home', label: 'Home', Icon: Home },
  { id: 'attendance', label: 'Attendance', Icon: BookOpen },
  { id: 'assignments', label: 'Assignments', Icon: CalendarCheck2 },
  { id: 'competitions', label: 'Events', Icon: Trophy },
  { id: 'expense', label: 'Money', Icon: Wallet },
]

export default function BottomNav({ active, onChange }: BottomNavProps) {
  return (
    <div>
      <nav className="border-t border-border bg-card/95 backdrop-blur-xl" style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 8px)' }}>
      <div className="flex items-end justify-around px-2 pt-2 pb-1">
        {MAIN_TABS.map(({ id, label, Icon }) => {
          const isActive = active === id
          return (
            <button
              key={id}
              onClick={() => onChange(id)}
              className="flex flex-col items-center gap-0.5 flex-1 transition-transform active:scale-90"
              aria-label={label}
            >
              <div className={`w-10 h-7 rounded-lg flex items-center justify-center transition-colors ${isActive ? 'bg-primary-soft' : ''}`}>
                <Icon
                  size={18}
                  strokeWidth={isActive ? 2.6 : 1.8}
                  className={isActive ? 'text-primary' : 'text-fg-soft'}
                />
              </div>
              <span className={`text-[9px] font-semibold ${isActive ? 'text-primary' : 'text-fg-soft'}`}>{label}</span>
            </button>
          )
        })}
      </div>
      </nav>
    </div>
  )
}
