import * as React from 'react'
import {
  BookOpenCheck,
  CalendarDays,
  LayoutDashboard,
  Settings2,
  StickyNote,
  UserRound,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useApp } from '@/hooks/useApp'
import type { TranslationKey } from '@/i18n'

export type View = 'dashboard' | 'weeks' | 'templates' | 'profile' | 'settings'

const NAV: Array<{ id: View; icon: React.ElementType; label: TranslationKey }> = [
  { id: 'dashboard', icon: LayoutDashboard, label: 'navDashboard' },
  { id: 'weeks', icon: CalendarDays, label: 'navWeeks' },
  { id: 'templates', icon: StickyNote, label: 'navTemplates' },
  { id: 'profile', icon: UserRound, label: 'navProfile' },
  { id: 'settings', icon: Settings2, label: 'navSettings' },
]

/**
 * Rahmen der App: eigene Titelleiste (das Fenster hat keine native mehr) und
 * links die Navigation. Der rechte Bereich scrollt, der Rahmen bleibt stehen.
 */
export function Shell({
  view,
  onNavigate,
  children,
}: {
  view: View
  onNavigate: (view: View) => void
  children: React.ReactNode
}) {
  const { t, profile } = useApp()

  return (
    <div className="flex h-full flex-col bg-background">
      <header className="drag-region flex h-10 shrink-0 items-center gap-2 border-b border-border/60 px-4">
        <BookOpenCheck className="h-4 w-4 text-primary" />
        <span className="text-[13px] font-semibold tracking-tight">{t('appName')}</span>
        <span className="text-[13px] text-muted-foreground">— {t('appTagline')}</span>
      </header>

      <div className="flex min-h-0 flex-1">
        <nav className="flex w-56 shrink-0 flex-col border-r border-border/60 bg-muted/40 p-3">
          <div className="flex flex-col gap-1">
            {NAV.map(({ id, icon: Icon, label }) => (
              <button
                key={id}
                onClick={() => onNavigate(id)}
                className={cn(
                  'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                  view === id
                    ? 'bg-background text-foreground shadow-sm ring-1 ring-border'
                    : 'text-muted-foreground hover:bg-background/60 hover:text-foreground',
                )}
              >
                <Icon className="h-4 w-4 shrink-0" />
                {t(label)}
              </button>
            ))}
          </div>

          <div className="mt-auto px-3 pb-1 pt-4">
            <div className="truncate text-sm font-medium">{profile.fullName || '—'}</div>
            <div className="truncate text-xs text-muted-foreground">
              {profile.occupation || t('appTagline')}
            </div>
          </div>
        </nav>

        <main className="min-w-0 flex-1 overflow-y-auto">
          <div className="mx-auto w-full max-w-4xl animate-fade-in px-8 py-7">{children}</div>
        </main>
      </div>
    </div>
  )
}

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string
  description?: string
  actions?: React.ReactNode
}) {
  return (
    <div className="mb-6 flex items-start justify-between gap-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  )
}
