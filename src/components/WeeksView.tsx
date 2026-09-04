import * as React from 'react'
import { ChevronDown, FileDown, Plus, Search } from 'lucide-react'
import type { EntryStatus, WeekEntry } from '../../shared/types'
import {
  addDays,
  formatDateRange,
  fromISODate,
  getISOWeek,
  isoWeekStart,
  toISODate,
  weekId,
} from '../../shared/dates'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { PageHeader } from '@/components/Shell'
import { WeekEditor } from '@/components/WeekEditor'
import { useApp } from '@/hooks/useApp'
import {
  entrySummary,
  isEmptyEntry,
  makeEntry,
  missingWeeks,
  plannedWeeks,
  totalHours,
} from '@/lib/weeks'
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
    if (ids.length === 0 && entries.length === 0) return
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
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" disabled={busy || entries.length === 0}>
                  <FileDown />
                  {t('exportPdfMenu')}
                  <ChevronDown />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onSelect={() => exportPdf([])}>
                  <span>{t('exportEverything')}</span>
                  <span className="text-xs text-muted-foreground">
                    {t('exportCountWeeks').replace('{n}', String(entries.length))}
                  </span>
                </DropdownMenuItem>

                {years.length > 1 && <DropdownMenuSeparator />}
                {years.length > 1 && <DropdownMenuLabel>{t('exportTrainingYear')}</DropdownMenuLabel>}
                {years.length > 1 &&
                  years.map((year) => {
                    const ofYear = entries.filter((e) => e.trainingYear === year)
                    return (
                      <DropdownMenuItem
                        key={year}
                        onSelect={() => exportPdf(ofYear.map((e) => e.id))}
                      >
                        <span>
                          {t('exportTrainingYear')} {year}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {t('exportCountWeeks').replace('{n}', String(ofYear.length))}
                        </span>
                      </DropdownMenuItem>
                    )
                  })}

                {visible.length !== entries.length && <DropdownMenuSeparator />}
                {visible.length !== entries.length && (
                  <DropdownMenuItem
                    disabled={visible.length === 0}
                    onSelect={() => exportPdf(visible.map((e) => e.id))}
                  >
                    <span>{t('exportFiltered')}</span>
                    <span className="text-xs text-muted-foreground">
                      {t('exportCountWeeks').replace('{n}', String(visible.length))}
                    </span>
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
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
/**
 * Woche anlegen. Gefragt wird nach einem Datum, nicht nach einer
 * Kalenderwoche — kaum jemand weiss auswendig, in welcher KW er gerade ist.
 * Daneben stehen die offenen Wochen zum direkten Nachtragen.
 */
function NewWeekDialog({
  onClose,
  onPick,
}: {
  onClose: () => void
  onPick: (isoYear: number, isoWeek: number) => void
}) {
  const { t, locale, entries, profile } = useApp()

  const [date, setDate] = React.useState(() => toISODate(new Date()))

  const picked = React.useMemo(() => {
    const day = date ? fromISODate(date) : new Date()
    return getISOWeek(Number.isNaN(day.getTime()) ? new Date() : day)
  }, [date])

  const monday = isoWeekStart(picked.isoYear, picked.isoWeek)
  const taken = entries.some((e) => e.id === weekId(picked.isoYear, picked.isoWeek))

  /** Liegt die Woche ueberhaupt in der Ausbildungszeit? */
  const outside = React.useMemo(() => {
    const planned = plannedWeeks(profile)
    if (!planned.length) return false
    const id = weekId(picked.isoYear, picked.isoWeek)
    return !planned.some((w) => weekId(w.isoYear, w.isoWeek) === id)
  }, [profile, picked])

  /** Die letzten offenen Wochen — Nachtragen ist der haeufigste Fall. */
  const open = React.useMemo(
    () => missingWeeks(profile, entries).slice(-8).reverse(),
    [profile, entries],
  )

  const jump = (offsetWeeks: number) =>
    setDate(toISODate(addDays(new Date(), offsetWeeks * 7)))

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t('weekNew')}</DialogTitle>
          <DialogDescription>{t('newWeekDateHint')}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="week-date">{t('newWeekDate')}</Label>
            <div className="flex gap-2">
              <Input
                id="week-date"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="flex-1"
              />
              <Button variant="outline" size="sm" onClick={() => jump(0)}>
                {t('thisWeek')}
              </Button>
              <Button variant="outline" size="sm" onClick={() => jump(-1)}>
                {t('lastWeek')}
              </Button>
            </div>
          </div>

          <div className="rounded-lg border bg-muted/40 px-3.5 py-3">
            <div className="text-xs text-muted-foreground">{t('newWeekPreview')}</div>
            <div className="mt-0.5 font-medium">
              KW {String(picked.isoWeek).padStart(2, '0')} / {picked.isoYear}
            </div>
            <div className="mt-0.5 text-sm text-muted-foreground">
              {formatDateRange(toISODate(monday), toISODate(addDays(monday, 6)), locale)}
            </div>
          </div>

          {taken && <p className="text-sm text-warning">{t('weekTaken')}</p>}
          {!taken && outside && (
            <p className="text-sm text-muted-foreground">{t('weekOutsideTraining')}</p>
          )}

          {open.length > 0 && (
            <div className="space-y-2">
              <Label className="text-xs font-normal text-muted-foreground">
                {t('openWeeksPick')}
              </Label>
              <div className="flex flex-wrap gap-1.5">
                {open.map((w) => (
                  <button
                    key={weekId(w.isoYear, w.isoWeek)}
                    onClick={() => onPick(w.isoYear, w.isoWeek)}
                    className="rounded-md border border-warning/40 bg-warning/10 px-2.5 py-1 text-xs font-medium text-warning transition-colors hover:bg-warning/20"
                  >
                    KW {String(w.isoWeek).padStart(2, '0')} / {w.isoYear}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {t('cancel')}
          </Button>
          <Button onClick={() => onPick(picked.isoYear, picked.isoWeek)}>
            {taken ? t('edit') : t('add')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
