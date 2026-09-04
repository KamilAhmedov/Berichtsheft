import * as React from 'react'
import {
  ChevronLeft,
  ChevronRight,
  CopyPlus,
  FileDown,
  Lightbulb,
  Plus,
  Trash2,
} from 'lucide-react'
import type { DayEntry, DayKind, EntryMode, EntryStatus, WeekEntry } from '../../shared/types'
import { formatDateRange, fromISODate } from '../../shared/dates'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
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
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useApp } from '@/hooks/useApp'
import {
  addTrailingDay,
  clampHours,
  makeDays,
  mergeFromPrevious,
  removeTrailingDay,
  totalHours,
} from '@/lib/weeks'
import { cn } from '@/lib/utils'

type Field = 'company' | 'school' | 'instruction'

const FIELD_LABELS = {
  company: 'fieldCompany',
  school: 'fieldSchool',
  instruction: 'fieldInstruction',
} as const

/** An diesen Tagen wird nichts geleistet — Text und Stunden werden gesperrt. */
const ABSENCE: DayKind[] = ['vacation', 'sick', 'holiday', 'off']

/* --------------------------------------------------------------- Tageszeile -- */

function DayRow({
  day,
  locale,
  onChange,
}: {
  day: DayEntry
  locale: string
  onChange: (day: DayEntry) => void
}) {
  const { t, templates } = useApp()
  const date = fromISODate(day.date)
  const absent = ABSENCE.includes(day.kind)

  // Bausteine des passenden Bereichs — an einem Schultag die Schulbausteine.
  const snippets = templates.filter((tpl) =>
    day.kind === 'school' ? tpl.field === 'school' : tpl.field === 'company',
  )

  const kindLabels: Record<DayKind, string> = {
    company: t('dayKindCompany'),
    school: t('dayKindSchool'),
    vacation: t('dayKindVacation'),
    sick: t('dayKindSick'),
    holiday: t('dayKindHoliday'),
    off: t('dayKindOff'),
  }

  return (
    <div
      className={cn(
        'grid grid-cols-[88px_1fr] gap-3 rounded-lg border p-3 transition-colors',
        absent ? 'bg-muted/50' : 'bg-card',
      )}
    >
      <div className="pt-1">
        <div className="text-sm font-medium capitalize">
          {date.toLocaleDateString(locale, { weekday: 'short' })}
        </div>
        <div className="text-xs text-muted-foreground">
          {date.toLocaleDateString(locale, { day: '2-digit', month: '2-digit' })}
        </div>
      </div>

      <div className="min-w-0 space-y-2">
        <div className="flex gap-2">
          <Select
            value={day.kind}
            onValueChange={(v) => {
              const kind = v as DayKind
              const isAbsent = ABSENCE.includes(kind)
              onChange({ ...day, kind, text: isAbsent ? '' : day.text, hours: isAbsent ? 0 : day.hours })
            }}
          >
            <SelectTrigger className="h-8 w-40 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(kindLabels) as DayKind[]).map((k) => (
                <SelectItem key={k} value={k} className="text-xs">
                  {kindLabels[k]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Input
            type="number"
            min={0}
            max={24}
            step={0.5}
            value={day.hours || ''}
            disabled={absent}
            placeholder={t('hoursShort')}
            onChange={(e) => onChange({ ...day, hours: clampHours(Number(e.target.value)) })}
            className="h-8 w-24 text-right text-xs"
          />
        </div>

        {!absent && (
          <>
            <Textarea
              value={day.text}
              onChange={(e) => onChange({ ...day, text: e.target.value })}
              placeholder={t('dayPlaceholder')}
              className="min-h-[62px] text-sm"
            />
            {snippets.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {snippets.map((tpl) => (
                  <button
                    key={tpl.id}
                    type="button"
                    onClick={() =>
                      onChange({
                        ...day,
                        text: day.text.trim() ? `${day.text.trimEnd()}\n${tpl.text}` : tpl.text,
                      })
                    }
                    className="rounded-md bg-secondary px-2 py-0.5 text-[11px] text-secondary-foreground transition-colors hover:bg-accent"
                  >
                    <Plus className="mr-1 inline h-3 w-3" />
                    {tpl.title}
                  </button>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

/* -------------------------------------------------------- Wochenfeld (Text) -- */

function ReportField({
  field,
  label,
  value,
  onChange,
}: {
  field: Field
  label: string
  value: string
  onChange: (value: string) => void
}) {
  const { t, templates } = useApp()
  const forField = templates.filter((tpl) => tpl.field === field)

  return (
    <div className="space-y-2">
      <Label htmlFor={field}>{label}</Label>

      <Textarea
        id={field}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="min-h-[110px]"
      />

      {forField.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs text-muted-foreground">{t('insertTemplate')}:</span>
          {forField.map((tpl) => (
            <button
              key={tpl.id}
              type="button"
              onClick={() => onChange(value.trim() ? `${value.trimEnd()}\n${tpl.text}` : tpl.text)}
              className="rounded-md bg-secondary px-2 py-0.5 text-xs text-secondary-foreground transition-colors hover:bg-accent"
            >
              <Plus className="mr-1 inline h-3 w-3" />
              {tpl.title}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

/* ------------------------------------------------- Stunden je Wochentag -- */

/**
 * In der Wochenerfassung werden die Stunden trotzdem je Tag gepflegt — genau
 * das erwartet die Stundenspalte des Vordrucks neben den Wochentagen.
 */
function WeekHours({
  days,
  locale,
  onChange,
}: {
  days: DayEntry[]
  locale: string
  onChange: (days: DayEntry[]) => void
}) {
  const { t } = useApp()

  return (
    <div className="space-y-2">
      <div>
        <Label>{t('hoursPerDay')}</Label>
        <p className="mt-0.5 text-xs text-muted-foreground">{t('hoursPerDayHint')}</p>
      </div>
      <div className="flex flex-wrap gap-2">
        {days.map((day, index) => (
          <div key={day.date} className="w-[74px]">
            <div className="mb-1 text-center text-xs text-muted-foreground">
              {fromISODate(day.date).toLocaleDateString(locale, { weekday: 'short' })}
            </div>
            <Input
              type="number"
              min={0}
              max={24}
              step={0.5}
              value={day.hours || ''}
              onChange={(e) =>
                onChange(
                  days.map((d, i) =>
                    i === index ? { ...d, hours: clampHours(Number(e.target.value)) } : d,
                  ),
                )
              }
              className="h-8 text-center text-sm"
            />
          </div>
        ))}
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ Editor -- */

export function WeekEditor({
  entry,
  isNew,
  previous,
  onClose,
  onStep,
}: {
  entry: WeekEntry
  isNew: boolean
  /** Der Bericht der Vorwoche, falls vorhanden — für „Vorwoche übernehmen“. */
  previous: WeekEntry | null
  onClose: () => void
  /** −1 oder +1: eine Woche zurück oder vor, ohne den Dialog zu verlassen. */
  onStep: (delta: number) => void
}) {
  const { t, locale, settings, saveEntry, removeEntry, toast } = useApp()
  const [draft, setDraft] = React.useState<WeekEntry>(entry)
  const [confirmDelete, setConfirmDelete] = React.useState(false)
  const [confirmDiscard, setConfirmDiscard] = React.useState(false)
  /** Merkt sich die Richtung, wenn vor dem Blaettern noch gefragt werden muss. */
  const [pendingStep, setPendingStep] = React.useState<number | null>(null)
  const [busy, setBusy] = React.useState(false)

  React.useEffect(() => setDraft(entry), [entry])

  const daily = draft.mode === 'daily'
  const dirty = JSON.stringify(draft) !== JSON.stringify(entry)
  const total = totalHours(draft)

  const set = <K extends keyof WeekEntry>(key: K, value: WeekEntry[K]) =>
    setDraft((d) => ({ ...d, [key]: value }))

  const days = draft.days?.length ? draft.days : makeDays(fromISODate(draft.startDate))

  // Wochentexte, die aus einer früheren Wochenerfassung stammen. Im Tagesmodus
  // bleiben sie sichtbar und bearbeitbar, damit nichts unerreichbar wird.
  const carriedOver: Field[] = daily
    ? (['company', 'school', 'instruction'] as Field[]).filter((f) => draft[f].trim().length > 0)
    : []

  function updateDay(index: number, day: DayEntry) {
    set(
      'days',
      days.map((d, i) => (i === index ? day : d)),
    )
  }

  /** Genau einen Tag anhaengen oder wegnehmen — nie mehrere auf einmal. */
  function addDay() {
    set('days', addTrailingDay(days, draft.startDate))
  }

  function removeDay() {
    set('days', removeTrailingDay(days))
  }

  /** Alle Arbeitstage auf denselben Wert setzen — spart fuenf Eingaben. */
  function fillHours(value: number) {
    set(
      'days',
      days.map((d) =>
        ABSENCE.includes(d.kind) ? d : { ...d, hours: value },
      ),
    )
  }

  /** Übernimmt die Texte der Vorwoche — der Alltag wiederholt sich oft. */
  function copyPrevious() {
    if (!previous) {
      toast(t('copyPreviousNone'), 'info')
      return
    }
    setDraft((d) => mergeFromPrevious({ ...d, days }, previous))
    toast(t('copyPreviousDone'), 'info')
  }

  const handleSave = React.useCallback(async () => {
    setBusy(true)
    await saveEntry(draft)
    setBusy(false)
    toast(t('toastSaved'))
    onClose()
  }, [draft, saveEntry, t, toast, onClose])

  // Strg+S speichert, wie in jedem Windows-Programm.
  React.useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.ctrlKey && event.key.toLowerCase() === 's') {
        event.preventDefault()
        void handleSave()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [handleSave])

  /**
   * Beim Blaettern mit ungesicherten Aenderungen erst fragen. Frueher waren die
   * Pfeile in diesem Fall einfach gesperrt — ohne Hinweis, warum.
   */
  function step(delta: number) {
    if (dirty) setPendingStep(delta)
    else onStep(delta)
  }

  async function saveThenStep() {
    const delta = pendingStep
    setPendingStep(null)
    if (delta === null) return
    setBusy(true)
    await saveEntry(draft)
    setBusy(false)
    onStep(delta)
  }

  function requestClose() {
    if (dirty) setConfirmDiscard(true)
    else onClose()
  }

  async function handleDelete() {
    await removeEntry(draft.id)
    toast(t('toastDeleted'))
    setConfirmDelete(false)
    onClose()
  }

  async function handlePdf() {
    setBusy(true)
    await saveEntry(draft)
    try {
      const path = await window.api.exportPdf({
        entryIds: [draft.id],
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

  const statusLabels: Record<EntryStatus, string> = {
    draft: t('statusDraft'),
    submitted: t('statusSubmitted'),
    signed: t('statusSigned'),
  }

  return (
    <>
      <Dialog open onOpenChange={(open) => !open && requestClose()}>
        <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
          <DialogHeader>
            <div className="flex items-start justify-between gap-4 pr-8">
              <div>
                <DialogTitle>{isNew ? t('editorTitleNew') : t('editorTitleEdit')}</DialogTitle>
                <DialogDescription className="mt-1">
                  KW {String(draft.isoWeek).padStart(2, '0')} / {draft.isoYear} ·{' '}
                  {formatDateRange(draft.startDate, draft.endDate, locale)}
                  {dirty && (
                    <span className="ml-2 text-warning">· {t('unsavedChanges')}</span>
                  )}
                </DialogDescription>
              </div>

              <div className="flex shrink-0 gap-1">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button variant="ghost" size="icon" onClick={() => step(-1)}>
                      <ChevronLeft />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>{t('prevWeek')}</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button variant="ghost" size="icon" onClick={() => step(1)}>
                      <ChevronRight />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>{t('nextWeek')}</TooltipContent>
                </Tooltip>
              </div>
            </div>
          </DialogHeader>

          <div className="space-y-5">
            <div className="flex flex-wrap items-end gap-3">
              <div className="w-32 space-y-2">
                <Label htmlFor="trainingYear">{t('fieldTrainingYear')}</Label>
                <Input
                  id="trainingYear"
                  type="number"
                  min={1}
                  max={4}
                  value={draft.trainingYear}
                  onChange={(e) => set('trainingYear', Number(e.target.value) || 1)}
                />
              </div>

              <div className="w-44 space-y-2">
                <Label>{t('fieldStatus')}</Label>
                <Select value={draft.status} onValueChange={(v) => set('status', v as EntryStatus)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(Object.keys(statusLabels) as EntryStatus[]).map((s) => (
                      <SelectItem key={s} value={s}>
                        {statusLabels[s]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="w-40 space-y-2">
                <Label>{t('entryModeLabel')}</Label>
                <Select
                  value={draft.mode}
                  onValueChange={(v) => set('mode', v as EntryMode)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="daily">{t('entryModeDaily')}</SelectItem>
                    <SelectItem value="weekly">{t('entryModeWeekly')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <Button variant="outline" size="sm" onClick={copyPrevious} className="mb-px">
                <CopyPlus />
                {t('copyPrevious')}
              </Button>
            </div>

            <div className="flex items-start gap-2 rounded-lg bg-primary/5 px-3.5 py-2.5 text-xs leading-relaxed text-muted-foreground">
              <Lightbulb className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
              <span>{daily ? t('tipDaily') : t('tipWeekly')}</span>
            </div>

            {daily ? (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-medium">{t('dailySection')}</h3>
                  <div className="flex items-center gap-1">
                    <Button variant="ghost" size="sm" onClick={() => fillHours(8)}>
                      {t('fillHours').replace('{n}', '8')}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={removeDay}
                      disabled={days.length <= 5}
                    >
                      {t('removeLastDay')}
                    </Button>
                    <Button variant="ghost" size="sm" onClick={addDay} disabled={days.length >= 7}>
                      {t('addDay')}
                    </Button>
                  </div>
                </div>
                {days.map((day, index) => (
                  <DayRow
                    key={day.date}
                    day={day}
                    locale={locale}
                    onChange={(next) => updateDay(index, next)}
                  />
                ))}

                {carriedOver.length > 0 && (
                  <div className="space-y-5 rounded-lg border border-dashed p-4">
                    <p className="text-xs text-muted-foreground">{t('carriedOverHint')}</p>
                    {carriedOver.map((field) => (
                      <ReportField
                        key={field}
                        field={field}
                        label={t(FIELD_LABELS[field])}
                        value={draft[field]}
                        onChange={(v) => set(field, v)}
                      />
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-5">
                <div className="flex items-start justify-between gap-4 rounded-lg border p-3.5">
                  <WeekHours
                    days={days}
                    locale={locale}
                    onChange={(next) => set('days', next)}
                  />
                  <div className="flex shrink-0 items-center gap-1">
                    <Button variant="ghost" size="sm" onClick={() => fillHours(8)}>
                      {t('fillHours').replace('{n}', '8')}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={removeDay}
                      disabled={days.length <= 5}
                    >
                      −
                    </Button>
                    <Button variant="ghost" size="sm" onClick={addDay} disabled={days.length >= 7}>
                      +
                    </Button>
                  </div>
                </div>

                <ReportField
                  field="company"
                  label={t('fieldCompany')}
                  value={draft.company}
                  onChange={(v) => set('company', v)}
                />
                <ReportField
                  field="school"
                  label={t('fieldSchool')}
                  value={draft.school}
                  onChange={(v) => set('school', v)}
                />
                <ReportField
                  field="instruction"
                  label={t('fieldInstruction')}
                  value={draft.instruction}
                  onChange={(v) => set('instruction', v)}
                />
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="notes">
                {t('fieldNotes')}{' '}
                <span className="font-normal text-muted-foreground">— {t('fieldNotesHint')}</span>
              </Label>
              <Textarea
                id="notes"
                value={draft.notes}
                onChange={(e) => set('notes', e.target.value)}
                className="min-h-[70px]"
              />
            </div>

            <div className="flex items-center justify-between rounded-lg bg-muted/60 px-4 py-2.5 text-sm">
              <span>{t('totalHours')}</span>
              <span className="font-semibold">
                {total.toLocaleString(locale, { maximumFractionDigits: 1 })} {t('hoursShort')}
              </span>
            </div>
          </div>

          <DialogFooter className="items-center justify-between sm:justify-between">
            <div className="flex gap-2">
              {!isNew && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setConfirmDelete(true)}
                  className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                >
                  <Trash2 />
                  {t('delete')}
                </Button>
              )}
              <Button variant="ghost" size="sm" onClick={handlePdf} disabled={busy}>
                <FileDown />
                {t('exportThisWeek')}
              </Button>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={requestClose}>
                {t('cancel')}
              </Button>
              <Button onClick={handleSave} disabled={busy}>
                {t('save')}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{t('deleteWeekConfirm')}</DialogTitle>
            <DialogDescription>{t('deleteWeekWarning')}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmDelete(false)}>
              {t('cancel')}
            </Button>
            <Button variant="destructive" onClick={handleDelete}>
              {t('delete')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={pendingStep !== null} onOpenChange={(open) => !open && setPendingStep(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{t('unsavedNavigate')}</DialogTitle>
            <DialogDescription>{t('unsavedNavigateText')}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPendingStep(null)}>
              {t('cancel')}
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                const delta = pendingStep
                setPendingStep(null)
                if (delta !== null) onStep(delta)
              }}
            >
              {t('discard')}
            </Button>
            <Button onClick={saveThenStep} disabled={busy}>
              {t('saveAndGo')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={confirmDiscard} onOpenChange={setConfirmDiscard}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{t('unsavedTitle')}</DialogTitle>
            <DialogDescription>{t('unsavedText')}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmDiscard(false)}>
              {t('cancel')}
            </Button>
            <Button variant="destructive" onClick={onClose}>
              {t('discard')}
            </Button>
            <Button onClick={handleSave}>{t('save')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
