import * as React from 'react'
import { TooltipProvider } from '@/components/ui/tooltip'
import { Shell, type View } from '@/components/Shell'
import { Dashboard } from '@/components/Dashboard'
import { WeeksView } from '@/components/WeeksView'
import { StatsView } from '@/components/StatsView'
import { TemplatesView } from '@/components/TemplatesView'
import { ProfileView } from '@/components/ProfileView'
import { SettingsView } from '@/components/SettingsView'
import { Toaster } from '@/components/Toaster'
import { AppProvider, useApp } from '@/hooks/useApp'
import { daysBetween } from '../shared/dates'

/** Erinnert ans Backup, wenn der letzte Export zu lange her ist. */
function useBackupReminder(): void {
  const { ready, settings, entries, t, toast, saveSettings } = useApp()
  const shown = React.useRef(false)

  React.useEffect(() => {
    if (!ready || shown.current || entries.length === 0) return
    if (settings.backupReminderDays <= 0) return

    const last = settings.lastBackupAt ? new Date(settings.lastBackupAt) : null
    const overdue =
      !last || daysBetween(last, new Date()) >= settings.backupReminderDays
    if (!overdue) return

    shown.current = true
    toast(`${t('backupNagTitle')} — ${t('backupNagText')}`, 'info', {
      label: t('backupNagAction'),
      run: () => {
        void window.api.exportBackup().then((path) => {
          // Den Zeitstempel auch in der Oberfläche nachziehen, damit die
          // Erinnerung nicht bis zum nächsten Start bestehen bleibt.
          if (path) void saveSettings({ lastBackupAt: new Date().toISOString() })
        })
      },
    })
  }, [ready, settings, entries.length, t, toast, saveSettings])
}

function Workspace() {
  const { ready } = useApp()
  const [view, setView] = React.useState<View>('dashboard')
  const [pendingWeek, setPendingWeek] = React.useState<{
    isoYear: number
    isoWeek: number
  } | null>(null)

  useBackupReminder()

  function openWeek(isoYear: number, isoWeek: number) {
    setPendingWeek({ isoYear, isoWeek })
    setView('weeks')
  }

  if (!ready) {
    return <div className="h-full bg-background" />
  }

  return (
    <Shell view={view} onNavigate={setView}>
      {view === 'dashboard' && <Dashboard onNavigate={setView} onOpenWeek={openWeek} />}
      {view === 'weeks' && (
        <WeeksView pendingWeek={pendingWeek} onPendingHandled={() => setPendingWeek(null)} />
      )}
      {view === 'stats' && <StatsView />}
      {view === 'templates' && <TemplatesView />}
      {view === 'profile' && <ProfileView />}
      {view === 'settings' && <SettingsView />}
    </Shell>
  )
}

export function App() {
  return (
    <AppProvider>
      <TooltipProvider delayDuration={300}>
        <Workspace />
        <Toaster />
      </TooltipProvider>
    </AppProvider>
  )
}
