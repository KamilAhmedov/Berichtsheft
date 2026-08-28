import * as React from 'react'
import { ArrowRight, CalendarClock, CheckCircle2, Clock, GraduationCap, TriangleAlert } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { PageHeader, type View } from '@/components/Shell'
import { useApp } from '@/hooks/useApp'
import { entrySummary, isEmptyEntry, missingWeeks, plannedWeeks, totalHours } from '@/lib/weeks'
import {
  addDays,
  formatDateRange,
  fromISODate,
  getISOWeek,
  isoWeekStart,
  toISODate,
  trainingYearFor,
  weekId,
} from '../../shared/dates'
import { cn } from '@/lib/utils'

function Stat({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: React.ElementType
  label: string
  value: string
  tone?: 'default' | 'warning'
}) {
  return (
    <Card>
      <CardContent className="flex items-center gap-3.5 p-4">
        <div
          className={cn(
            'flex h-10 w-10 shrink-0 items-center justify-center rounded-lg',
            tone === 'warning' ? 'bg-warning/15 text-warning' : 'bg-primary/10 text-primary',
          )}
        >
          <Icon className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <div className="text-xl font-semibold leading-tight">{value}</div>
          <div className="truncate text-xs text-muted-foreground">{label}</div>
        </div>
      </CardContent>
    </Card>
  )
}

export function Dashboard({
  onNavigate,
  onOpenWeek,
}: {
  onNavigate: (view: View) => void
  onOpenWeek: (isoYear: number, isoWeek: number) => void
}) {
  const { t, locale, profile, entries, settings } = useApp()

  const filled = React.useMemo(() => entries.filter((e) => !isEmptyEntry(e)), [entries])
  const missing = React.useMemo(() => missingWeeks(profile, entries), [profile, entries])
  const planned = React.useMemo(() => plannedWeeks(profile), [profile])
  const hoursSum = React.useMemo(
    () => filled.reduce((sum, e) => sum + totalHours(e, settings.entryMode), 0),
    [filled, settings.entryMode],
  )

  const now = new Date()
  const cw = getISOWeek(now)
  const cwId = weekId(cw.isoYear, cw.isoWeek)
  const currentEntry = entries.find((e) => e.id === cwId)
  const monday = isoWeekStart(cw.isoYear, cw.isoWeek)
  const currentRange = formatDateRange(toISODate(monday), toISODate(addDays(monday, 6)), locale)
  // Das Lehrjahr richtet sich nach dem heutigen Datum, nicht nach dem letzten
  // Eintrag — sonst stuende dort etwas Falsches, sobald man Wochen nachtraegt.
  const currentTrainingYear = profile.startDate
    ? trainingYearFor(now, fromISODate(profile.startDate), profile.durationYears)
    : 1

  const progress = planned.length ? Math.round((filled.length / planned.length) * 100) : 0
  const hasProfile = Boolean(profile.startDate && profile.fullName)

  return (
    <>
      <PageHeader
        title={
          profile.fullName
            ? `${t('dashboardHello')}, ${profile.fullName.split(' ')[0]}`
            : t('dashboardHelloAnon')
        }
        description={profile.occupation || undefined}
      />

      {!hasProfile && (
        <Card className="mb-6 border-primary/30 bg-primary/5">
          <CardContent className="flex items-start gap-4 p-5">
            <GraduationCap className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
            <div className="flex-1">
              <h2 className="font-medium">{t('setupNeeded')}</h2>
              <p className="mt-1 text-sm text-muted-foreground">{t('setupNeededText')}</p>
              <Button size="sm" className="mt-3" onClick={() => onNavigate('profile')}>
                {t('goToProfile')}
                <ArrowRight />
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat icon={CheckCircle2} label={t('statWeeksFilled')} value={String(filled.length)} />
        <Stat
          icon={TriangleAlert}
          label={t('statWeeksMissing')}
          value={String(missing.length)}
          tone={missing.length ? 'warning' : 'default'}
        />
        <Stat
          icon={Clock}
          label={t('statHoursTotal')}
          value={hoursSum.toLocaleString(locale, { maximumFractionDigits: 1 })}
        />
        <Stat icon={GraduationCap} label={t('statCurrentYear')} value={String(currentTrainingYear)} />
      </div>

      <Card className="mb-6">
        <CardContent className="p-5">
          <div className="mb-3 flex items-baseline justify-between">
            <h2 className="flex items-center gap-2 font-medium">
              <CalendarClock className="h-4 w-4 text-muted-foreground" />
              {t('currentWeek')} · KW {String(cw.isoWeek).padStart(2, '0')}
            </h2>
            <span className="text-sm text-muted-foreground">{currentRange}</span>
          </div>

          {currentEntry && !isEmptyEntry(currentEntry) ? (
            <>
              <p className="line-clamp-2 text-sm text-muted-foreground">{entrySummary(currentEntry)}</p>
              <Button
                variant="outline"
                size="sm"
                className="mt-3"
                onClick={() => onOpenWeek(cw.isoYear, cw.isoWeek)}
              >
                {t('continueEditing')}
              </Button>
            </>
          ) : (
            <>
              <p className="text-sm text-muted-foreground">{t('currentWeekEmpty')}</p>
              <Button size="sm" className="mt-3" onClick={() => onOpenWeek(cw.isoYear, cw.isoWeek)}>
                {t('writeNow')}
                <ArrowRight />
              </Button>
            </>
          )}
        </CardContent>
      </Card>

      {planned.length > 0 && (
        <Card className="mb-6">
          <CardContent className="p-5">
            <div className="mb-2 flex items-baseline justify-between text-sm">
              <span className="font-medium">{t('progress')}</span>
              <span className="text-muted-foreground">
                {filled.length} {t('progressOf')} {planned.length} {t('weeksUnit')} · {progress}%
              </span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-secondary">
              <div
                className="h-full rounded-full bg-primary transition-all duration-500"
                style={{ width: `${progress}%` }}
              />
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="p-5">
          <h2 className="font-medium">{t('missingWeeks')}</h2>
          {missing.length === 0 ? (
            <p className="mt-1 text-sm text-muted-foreground">{t('missingWeeksNone')}</p>
          ) : (
            <>
              <p className="mt-1 text-sm text-muted-foreground">{t('missingWeeksHint')}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {missing.slice(-24).map((w) => (
                  <button
                    key={weekId(w.isoYear, w.isoWeek)}
                    onClick={() => onOpenWeek(w.isoYear, w.isoWeek)}
                    className="rounded-md border border-warning/40 bg-warning/10 px-2.5 py-1 text-xs font-medium text-warning transition-colors hover:bg-warning/20"
                  >
                    KW {String(w.isoWeek).padStart(2, '0')} / {w.isoYear}
                  </button>
                ))}
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </>
  )
}
