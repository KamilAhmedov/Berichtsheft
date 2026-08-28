import * as React from 'react'
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import type { DayKind, EntryStatus } from '../../shared/types'
import { Card, CardContent } from '@/components/ui/card'
import { PageHeader } from '@/components/Shell'
import { useApp } from '@/hooks/useApp'
import { useChartColors, type ChartColors } from '@/hooks/useChartColors'
import { isEmptyEntry, totalHours } from '@/lib/weeks'
import { fromISODate } from '../../shared/dates'

/* --------------------------------------------------------------- Bausteine */

function Figure({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="text-2xl font-semibold leading-tight tabular-nums">{value}</div>
        <div className="mt-1 text-xs text-muted-foreground">{label}</div>
        {hint && <div className="mt-0.5 text-[11px] text-muted-foreground/70">{hint}</div>}
      </CardContent>
    </Card>
  )
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card>
      <CardContent className="p-5">
        <h2 className="mb-4 text-sm font-medium">{title}</h2>
        {children}
      </CardContent>
    </Card>
  )
}

/** Einheitlicher Tooltip — Recharts bringt einen eigenen mit, der nicht zum Rest passt. */
function ChartTooltip({
  active,
  payload,
  label,
  unit,
}: {
  active?: boolean
  payload?: Array<{ name?: string; value?: number; color?: string }>
  label?: string
  unit: string
}) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-lg border bg-popover px-3 py-2 text-xs shadow-md">
      {label && <div className="mb-1 font-medium">{label}</div>}
      {payload.map((item, index) => (
        <div key={index} className="flex items-center gap-2">
          <span
            className="h-2 w-2 rounded-sm"
            style={{ background: item.color }}
            aria-hidden
          />
          <span className="text-muted-foreground">{item.name}</span>
          <span className="tabular-nums">
            {item.value} {unit}
          </span>
        </div>
      ))}
    </div>
  )
}

/** Kreisdiagramm mit Legende daneben — kompakter als eine Legende darunter. */
function Donut({
  data,
  colors,
  total,
  totalLabel,
  unit,
}: {
  data: Array<{ name: string; value: number; fill: string }>
  colors: ChartColors
  total: number
  totalLabel: string
  unit: string
}) {
  const shown = data.filter((d) => d.value > 0)
  if (!shown.length) return null

  return (
    <div className="flex items-center gap-5">
      <div className="relative h-[150px] w-[150px] shrink-0">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={shown}
              dataKey="value"
              nameKey="name"
              innerRadius={46}
              outerRadius={70}
              paddingAngle={2}
              stroke={colors.subtle}
              strokeWidth={2}
              isAnimationActive={false}
            >
              {shown.map((entry) => (
                <Cell key={entry.name} fill={entry.fill} />
              ))}
            </Pie>
            <Tooltip content={<ChartTooltip unit={unit} />} />
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <div className="text-lg font-semibold tabular-nums">{total}</div>
          <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
            {totalLabel}
          </div>
        </div>
      </div>

      <div className="min-w-0 flex-1 space-y-1.5">
        {shown.map((entry) => (
          <div key={entry.name} className="flex items-center gap-2 text-xs">
            <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: entry.fill }} />
            <span className="truncate">{entry.name}</span>
            <span className="ml-auto shrink-0 tabular-nums text-muted-foreground">
              {entry.value} · {Math.round((entry.value / total) * 100)}%
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ Ansicht */

export function StatsView() {
  const { t, locale, entries } = useApp()
  const colors = useChartColors()

  const filled = React.useMemo(() => entries.filter((e) => !isEmptyEntry(e)), [entries])

  /** Stunden je Kalendermonat, lückenlos vom ersten bis zum letzten Bericht. */
  const months = React.useMemo(() => {
    if (!filled.length) return []
    const byMonth = new Map<string, number>()
    for (const entry of filled) {
      const key = entry.startDate.slice(0, 7)
      byMonth.set(key, (byMonth.get(key) ?? 0) + totalHours(entry))
    }
    const keys = [...byMonth.keys()].sort()
    const out: Array<{ label: string; hours: number }> = []
    const cursor = fromISODate(`${keys[0]}-01`)
    const last = fromISODate(`${keys[keys.length - 1]}-01`)
    // Auch leere Monate zeigen, sonst täuscht der Verlauf.
    while (cursor <= last && out.length < 60) {
      const key = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}`
      out.push({
        label: cursor.toLocaleDateString(locale, { month: 'short', year: '2-digit' }),
        hours: Math.round((byMonth.get(key) ?? 0) * 10) / 10,
      })
      cursor.setMonth(cursor.getMonth() + 1)
    }
    return out
  }, [filled, locale])

  /** Aufsummierte Wochen über die Zeit — zeigt, ob man drangeblieben ist. */
  const cumulative = React.useMemo(() => {
    let sum = 0
    return filled.map((entry) => {
      sum += 1
      return {
        label: `KW ${String(entry.isoWeek).padStart(2, '0')}`,
        weeks: sum,
      }
    })
  }, [filled])

  const kindData = React.useMemo(() => {
    const counts = new Map<DayKind, number>()
    for (const entry of filled) {
      for (const day of entry.days ?? []) counts.set(day.kind, (counts.get(day.kind) ?? 0) + 1)
    }
    const spec: Array<[DayKind, string, string]> = [
      ['company', t('dayKindCompany'), colors.primary],
      ['school', t('dayKindSchool'), colors.success],
      ['vacation', t('dayKindVacation'), colors.warning],
      ['sick', t('dayKindSick'), colors.destructive],
      ['holiday', t('dayKindHoliday'), colors.muted],
      ['off', t('dayKindOff'), colors.border],
    ]
    return spec.map(([kind, name, fill]) => ({ name, value: counts.get(kind) ?? 0, fill }))
  }, [filled, t, colors])

  const statusData = React.useMemo(() => {
    const spec: Array<[EntryStatus, string, string]> = [
      ['draft', t('statusDraft'), colors.muted],
      ['submitted', t('statusSubmitted'), colors.primary],
      ['signed', t('statusSigned'), colors.success],
    ]
    return spec.map(([status, name, fill]) => ({
      name,
      value: entries.filter((e) => e.status === status).length,
      fill,
    }))
  }, [entries, t, colors])

  /** Längste ununterbrochene Folge ausgefüllter Wochen. */
  const longestRun = React.useMemo(() => {
    const ids = new Set(filled.map((e) => e.id))
    let best = 0
    let run = 0
    for (const entry of entries) {
      run = ids.has(entry.id) ? run + 1 : 0
      best = Math.max(best, run)
    }
    return best
  }, [entries, filled])

  const totalHoursSum = filled.reduce((sum, e) => sum + totalHours(e), 0)
  const average = filled.length ? totalHoursSum / filled.length : 0
  const number = (value: number) => value.toLocaleString(locale, { maximumFractionDigits: 1 })

  const axis = {
    stroke: colors.border,
    tick: { fill: colors.muted, fontSize: 11 },
    tickLine: false,
  }

  if (!filled.length) {
    return (
      <>
        <PageHeader title={t('statsTitle')} description={t('statsIntro')} />
        <Card className="p-10 text-center text-sm text-muted-foreground">{t('statsNoData')}</Card>
      </>
    )
  }

  const totalDays = kindData.reduce((sum, d) => sum + d.value, 0)

  return (
    <>
      <PageHeader title={t('statsTitle')} description={t('statsIntro')} />

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Figure label={t('statHoursTotal')} value={number(totalHoursSum)} />
        <Figure label={t('statWeeksFilled')} value={String(filled.length)} />
        <Figure label={t('statsAverage')} value={`${number(average)} ${t('hoursShort')}`} />
        <Figure label={t('statsLongest')} value={`${longestRun} ${t('statsWeeks')}`} />
      </div>

      <div className="mb-4">
        <Panel title={t('statsHoursPerMonth')}>
          <div className="h-[220px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={months} margin={{ top: 4, right: 4, bottom: 0, left: -18 }}>
                <CartesianGrid stroke={colors.border} vertical={false} />
                <XAxis dataKey="label" {...axis} axisLine={{ stroke: colors.border }} />
                <YAxis {...axis} axisLine={false} width={44} />
                <Tooltip
                  cursor={{ fill: colors.border, opacity: 0.35 }}
                  content={<ChartTooltip unit={t('hoursShort')} />}
                />
                <Bar
                  dataKey="hours"
                  name={t('hours')}
                  fill={colors.primary}
                  radius={[4, 4, 0, 0]}
                  maxBarSize={44}
                  isAnimationActive={false}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Panel>
      </div>

      <div className="mb-4 grid gap-4 lg:grid-cols-2">
        <Panel title={t('statsByKind')}>
          <Donut
            data={kindData}
            colors={colors}
            total={totalDays}
            totalLabel={t('statsDays')}
            unit={t('statsDays')}
          />
        </Panel>

        <Panel title={t('statsByStatus')}>
          <Donut
            data={statusData}
            colors={colors}
            total={entries.length}
            totalLabel={t('statsWeeks')}
            unit={t('statsWeeks')}
          />
        </Panel>
      </div>

      {cumulative.length > 1 && (
        <Panel title={t('statsProgressOverTime')}>
          <div className="h-[190px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={cumulative} margin={{ top: 4, right: 4, bottom: 0, left: -18 }}>
                <defs>
                  <linearGradient id="runGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={colors.primary} stopOpacity={0.35} />
                    <stop offset="100%" stopColor={colors.primary} stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke={colors.border} vertical={false} />
                <XAxis dataKey="label" {...axis} axisLine={{ stroke: colors.border }} />
                <YAxis {...axis} axisLine={false} width={44} allowDecimals={false} />
                <Tooltip content={<ChartTooltip unit={t('statsWeeks')} />} />
                <Area
                  type="monotone"
                  dataKey="weeks"
                  name={t('statWeeksFilled')}
                  stroke={colors.primary}
                  strokeWidth={2}
                  fill="url(#runGradient)"
                  isAnimationActive={false}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Panel>
      )}
    </>
  )
}
