import * as React from 'react'
import { Database, Download, FolderOpen, Upload } from 'lucide-react'
import type { EntryMode, Language, PdfLayout, StorageInfo, Theme } from '../../shared/types'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Separator } from '@/components/ui/separator'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { PageHeader } from '@/components/Shell'
import { useApp } from '@/hooks/useApp'
import { LANGUAGE_NAMES } from '@/i18n'
import { cn, formatBytes } from '@/lib/utils'

function Row({
  label,
  hint,
  children,
}: {
  label: string
  hint?: string
  children: React.ReactNode
}) {
  return (
    <div className="flex items-center justify-between gap-6 py-3">
      <div className="min-w-0">
        <div className="text-sm font-medium">{label}</div>
        {hint && <div className="mt-0.5 text-xs text-muted-foreground">{hint}</div>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  )
}

export function SettingsView() {
  const { t, locale, settings, saveSettings, applySnapshot, toast } = useApp()
  const [info, setInfo] = React.useState<StorageInfo | null>(null)
  const [confirmImport, setConfirmImport] = React.useState(false)
  const [busy, setBusy] = React.useState(false)

  const refreshInfo = React.useCallback(() => {
    window.api
      .storageInfo()
      .then(setInfo)
      .catch(() => setInfo(null))
  }, [])

  React.useEffect(refreshInfo, [refreshInfo])

  async function handleExport() {
    setBusy(true)
    try {
      const path = await window.api.exportBackup()
      if (path) {
        await saveSettings({ lastBackupAt: new Date().toISOString() })
        toast(t('toastBackupSaved'), 'success', {
          label: t('showInFolder'),
          run: () => void window.api.showItemInFolder(path),
        })
      }
    } catch (error) {
      toast(error instanceof Error ? error.message : t('errorGeneric'), 'error')
    }
    setBusy(false)
    refreshInfo()
  }

  async function handleImport() {
    setConfirmImport(false)
    setBusy(true)
    try {
      const snapshot = await window.api.importBackup()
      if (snapshot) {
        applySnapshot(snapshot)
        toast(t('toastImported'))
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : ''
      toast(message === 'INVALID_BACKUP' ? t('errorInvalidBackup') : message, 'error')
    }
    setBusy(false)
    refreshInfo()
  }

  const themes: Array<{ value: Theme; label: string }> = [
    { value: 'light', label: t('themeLight') },
    { value: 'dark', label: t('themeDark') },
    { value: 'system', label: t('themeSystem') },
  ]

  const modes: Array<{ value: EntryMode; label: string; hint: string }> = [
    { value: 'daily', label: t('entryModeDaily'), hint: t('entryModeDailyHint') },
    { value: 'weekly', label: t('entryModeWeekly'), hint: t('entryModeWeeklyHint') },
  ]

  const layouts: Array<{ value: PdfLayout; label: string; hint: string }> = [
    { value: 'classic', label: t('pdfClassic'), hint: t('pdfClassicHint') },
    { value: 'modern', label: t('pdfModern'), hint: t('pdfModernHint') },
  ]

  return (
    <>
      <PageHeader title={t('settingsTitle')} />

      <Card className="mb-4">
        <CardContent className="divide-y p-5 py-1">
          <Row label={t('settingsLanguage')}>
            <Select
              value={settings.language}
              onValueChange={(v) => saveSettings({ language: v as Language })}
            >
              <SelectTrigger className="w-44">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(LANGUAGE_NAMES) as Language[]).map((lang) => (
                  <SelectItem key={lang} value={lang}>
                    {LANGUAGE_NAMES[lang]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Row>

          <Row label={t('settingsTheme')}>
            <Select value={settings.theme} onValueChange={(v) => saveSettings({ theme: v as Theme })}>
              <SelectTrigger className="w-44">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {themes.map((theme) => (
                  <SelectItem key={theme.value} value={theme.value}>
                    {theme.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Row>
        </CardContent>
      </Card>

      <Card className="mb-4">
        <CardContent className="p-5">
          <h2 className="mb-3 text-sm font-medium">{t('entryModeLabel')}</h2>
          <div className="grid grid-cols-2 gap-3">
            {modes.map((mode) => (
              <button
                key={mode.value}
                onClick={() => saveSettings({ entryMode: mode.value })}
                className={cn(
                  'rounded-lg border p-4 text-left transition-colors',
                  settings.entryMode === mode.value
                    ? 'border-primary bg-primary/5 ring-1 ring-primary'
                    : 'hover:bg-accent/40',
                )}
              >
                <div className="text-sm font-medium">{mode.label}</div>
                <div className="mt-1 text-xs text-muted-foreground">{mode.hint}</div>
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card className="mb-4">
        <CardContent className="p-5">
          <h2 className="mb-3 text-sm font-medium">{t('settingsPdf')}</h2>
          <div className="grid grid-cols-2 gap-3">
            {layouts.map((layout) => (
              <button
                key={layout.value}
                onClick={() => saveSettings({ pdfLayout: layout.value })}
                className={cn(
                  'rounded-lg border p-4 text-left transition-colors',
                  settings.pdfLayout === layout.value
                    ? 'border-primary bg-primary/5 ring-1 ring-primary'
                    : 'hover:bg-accent/40',
                )}
              >
                <div className="text-sm font-medium">{layout.label}</div>
                <div className="mt-1 text-xs text-muted-foreground">{layout.hint}</div>
              </button>
            ))}
          </div>

        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-5">
          <h2 className="flex items-center gap-2 text-sm font-medium">
            <Database className="h-4 w-4 text-muted-foreground" />
            {t('settingsData')}
          </h2>
          <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{t('dataExplain')}</p>

          {info && (
            <div className="mt-4 space-y-1.5 rounded-lg bg-muted/60 p-3 text-xs">
              <div className="flex items-start justify-between gap-4">
                <span className="text-muted-foreground">{t('dataLocation')}</span>
                <span className="max-w-[60%] break-all text-right font-mono">{info.dataDir}</span>
              </div>
              <div className="flex justify-between gap-4">
                <span className="text-muted-foreground">{t('dataSize')}</span>
                <span>{formatBytes(info.dbSizeBytes)}</span>
              </div>
              <div className="flex justify-between gap-4">
                <span className="text-muted-foreground">{t('dataBackups')}</span>
                <span>{info.backupCount}</span>
              </div>
            </div>
          )}

          <div className="mt-3">
            <Button variant="outline" size="sm" onClick={() => void window.api.openDataDir()}>
              <FolderOpen />
              {t('openDataFolder')}
            </Button>
          </div>

          <Separator className="my-4" />

          <div className="divide-y">
            <Row label={t('exportBackup')} hint={t('exportBackupHint')}>
              <Button variant="outline" size="sm" onClick={handleExport} disabled={busy}>
                <Download />
                {t('exportBackup')}
              </Button>
            </Row>

            <Row label={t('importBackup')} hint={t('importBackupHint')}>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setConfirmImport(true)}
                disabled={busy}
              >
                <Upload />
                {t('importBackup')}
              </Button>
            </Row>

            <Row label={t('lastBackup')}>
              <span className="text-sm text-muted-foreground">
                {settings.lastBackupAt
                  ? new Date(settings.lastBackupAt).toLocaleDateString(locale, {
                      day: '2-digit',
                      month: '2-digit',
                      year: 'numeric',
                    })
                  : t('lastBackupNever')}
              </span>
            </Row>

            <Row label={t('backupReminder')} hint={t('backupReminderDays')}>
              <Input
                type="number"
                min={0}
                max={365}
                value={settings.backupReminderDays}
                onChange={(e) => saveSettings({ backupReminderDays: Number(e.target.value) || 0 })}
                className="w-20 text-right"
              />
            </Row>

            {info && (
              <Row label={t('aboutTitle')}>
                <span className="text-sm text-muted-foreground">
                  {t('version')} {info.appVersion}
                </span>
              </Row>
            )}
          </div>
        </CardContent>
      </Card>

      <Dialog open={confirmImport} onOpenChange={setConfirmImport}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{t('importConfirmTitle')}</DialogTitle>
            <DialogDescription>{t('importConfirmText')}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmImport(false)}>
              {t('cancel')}
            </Button>
            <Button onClick={handleImport}>{t('importBackup')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
