import * as React from 'react'
import { FileDown, Plus, Search } from 'lucide-react'
import type { EntryStatus, WeekEntry } from '../../shared/types'
import { addDays, formatDateRange, fromISODate, getISOWeek, weekId, weeksInISOYear } from '../../shared/dates'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
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
import { WeekEditor } from '@/components/WeekEditor'
import { useApp } from '@/hooks/useApp'
import { entrySummary, isEmptyEntry, makeEntry, totalHours } from '@/lib/weeks'
import { cn } from '@/lib/utils'

const STATUS_VARIANT: Record<EntryStatus, 'secondary' | 'default' | 'success'> = {
  draft: 'secondary',
  submitted: 'default',
  signed: 'success',
}

export function WeeksView({
  pendingWeek,
  onPendingHandled,
}: {
  pendingWeek: { isoYear: number; isoWeek: number } | null
  onPendingHandled: () => void
}) {
  const { t, locale, entries, profile, settings, toast } = useApp()

  const [query, setQuery] = React.useState('')
  const [yearFilter, setYearFilter] = React.useState('all')
  const [statusFilter, setStatusFilter] = React.useState('all')
  const [editing, setEditing] = React.useState<{ entry: WeekEntry; isNew: boolean } | null>(null)
  const [creating, setCreating] = React.useState(false)
  const [busy, setBusy] = React.useState(false)

  const statusLabels: Record<EntryStatus, string> = {
    draft: t('statusDraft'),
    submitted: t('statusSubmitted'),
    signed: t('statusSigned'),
  }

  const openWeek = React.useCallback(
    (isoYear: number, isoWeek: number) => {
      const existing = entries.find((e) => e.id === weekId(isoYear, isoWeek))
      setEditing({
        entry: existing ?? makeEntry(isoYear, isoWeek, profile, settings.entryMode),
        isNew: !existing,
      })
    },
    [entries, profile, settings.entryMode],
  )

  // Ein Klick auf der Übersicht springt direkt in die passende Woche.
  React.useEffect(() => {
    if (!pendingWeek) return
    openWeek(pendingWeek.isoYear, pendingWeek.isoWeek)
    onPendingHandled()
  }, [pendingWeek, openWeek, onPendingHandled])

  const years = React.useMemo(
    () => [...new Set(entries.map((e) => e.trainingYear))].sort(),
    [entries],
  )

  const visible = React.useMemo(() => {
    const q = query.trim().toLocaleLowerCase(locale)
    return entries
      .filter((e) => yearFilter === 'all' || e.trainingYear === Number(yearFilter))
      .filter((e) => statusFilter === 'all' || e.status === statusFilter)
      .filter((e) => {
        if (!q) return true
        return [e.company, e.school, e.instruction, e.notes, e.id, ...(e.days ?? []).map((d) => d.text)]
          .join(' ')
          .toLocaleLowerCase(locale)
          .includes(q)
      })
      .slice()
      .reverse()
  }, [entries, query, yearFilter, statusFilter, locale])

  /** Der gespeicherte Bericht der Woche davor — Vorlage für „Vorwoche übernehmen“. */
  const previousOf = React.useCallback(
    (entry: WeekEntry): WeekEntry | null => {
      const monday = addDays(fromISODate(entry.startDate), -7)
      const prev = getISOWeek(monday)
      return entries.find((e) => e.id === weekId(prev.isoYear, prev.isoWeek)) ?? null
    },
    [entries],
  )

  async function exportPdf(ids: string[]) {
    setBusy(true)
    try {
      const path = await window.api.exportPdf({
        entryIds: ids,
        layout: settings.pdfLayout,
        language: settings.language,
      })
      if (path) {
        toast(t('toastPdfSaved'), 'success', {
          label: t('showInFolder'),
          run: () => void window.api.showItemInFolder(path),
        })
      }
    } catch (error) {
      toast(error instanceof Error ? error.message : t('errorGeneric'), 'error')
    }
    setBusy(false)
  }

  return (
    <>
      <PageHeader
        title={t('weeksTitle')}
        actions={
          <>
            <Button
              variant="outline"
              onClick={() => exportPdf([])}
              disabled={busy || entries.length === 0}
            >
              <FileDown />
              {t('exportAllPdf')}
            </Button>
            <Button onClick={() => setCreating(true)}>
              <Plus />
              {t('weekNew')}
            </Button>
          </>
        }
      />

      <div className="mb-4 flex flex-wrap gap-2">
        <div className="relative min-w-[200px] flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('search')}
            className="pl-9"
          />
        </div>

        <Select value={yearFilter} onValueChange={setYearFilter}>
          <SelectTrigger className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">
              {t('filterYear')}: {t('all')}
            </SelectItem>
            {years.map((y) => (
              <SelectItem key={y} value={String(y)}>
                {t('filterYear')} {y}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">
              {t('filterStatus')}: {t('all')}
            </SelectItem>
            {(Object.keys(statusLabels) as EntryStatus[]).map((s) => (
              <SelectItem key={s} value={s}>
                {statusLabels[s]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {visible.length === 0 ? (
        <Card className="p-10 text-center text-sm text-muted-foreground">
          {entries.length === 0 ? t('weekEmpty') : t('weekNoMatch')}
        </Card>
      ) : (
        <div className="space-y-2">
          {visible.map((e) => (
            <button
              key={e.id}
              onClick={() => setEditing({ entry: e, isNew: false })}
              className={cn(
                'flex w-full items-center gap-4 rounded-xl border bg-card p-4 text-left transition-colors',
                'hover:border-primary/40 hover:bg-accent/40',
              )}
            >
              <div className="w-16 shrink-0 text-center">
                <div className="text-lg font-semibold leading-none">
                  {String(e.isoWeek).padStart(2, '0')}
                </div>
                <div className="mt-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
                  KW {e.isoYear}
                </div>
              </div>

              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium">
                  {isEmptyEntry(e) ? (
                    <span className="text-muted-foreground">—</span>
                  ) : (
                    entrySummary(e)
                  )}
                </div>
                <div className="mt-0.5 text-xs text-muted-foreground">
                  {formatDateRange(e.startDate, e.endDate, locale)} ·{' '}
                  {totalHours(e).toLocaleString(locale, {
                    maximumFractionDigits: 1,
                  })}{' '}
                  {t('hoursShort')}
                </div>
              </div>

              <Badge variant={STATUS_VARIANT[e.status]}>{statusLabels[e.status]}</Badge>
            </button>
          ))}
        </div>
      )}

      {editing && (
        <WeekEditor
          key={editing.entry.id}
          entry={editing.entry}
          isNew={editing.isNew}
          previous={previousOf(editing.entry)}
          onClose={() => setEditing(null)}
          onStep={(delta) => {
            const monday = addDays(fromISODate(editing.entry.startDate), delta * 7)
            const next = getISOWeek(monday)
            openWeek(next.isoYear, next.isoWeek)
          }}
        />
      )}

      {creating && (
        <NewWeekDialog
          onClose={() => setCreating(false)}
          onPick={(isoYear, isoWeek) => {
            setCreating(false)
            openWeek(isoYear, isoWeek)
          }}
        />
      )}
    </>
  )
}

/** Kleiner Dialog zur Auswahl von Jahr und Kalenderwoche. */
function NewWeekDialog({
  onClose,
  onPick,
}: {
  onClose: () => void
  onPick: (isoYear: number, isoWeek: number) => void
}) {
  const { t, entries } = useApp()
  const today = getISOWeek(new Date())
  const [year, setYear] = React.useState(today.isoYear)
  const [week, setWeek] = React.useState(today.isoWeek)

  const taken = entries.some((e) => e.id === weekId(year, week))
  const maxWeek = weeksInISOYear(year)

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{t('weekNew')}</DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="year">{t('fieldPeriod')}</Label>
            <Input
              id="year"
              type="number"
              value={year}
              min={2000}
              max={2100}
              onChange={(e) => setYear(Number(e.target.value) || today.isoYear)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="week">{t('fieldWeek')}</Label>
            <Input
              id="week"
              type="number"
              min={1}
              max={maxWeek}
              value={week}
              onChange={(e) =>
                setWeek(Math.min(maxWeek, Math.max(1, Number(e.target.value) || 1)))
              }
            />
          </div>
        </div>

        {taken && <p className="mt-3 text-sm text-warning">{t('weekTaken')}</p>}

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {t('cancel')}
          </Button>
          <Button onClick={() => onPick(year, week)}>{taken ? t('edit') : t('add')}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
