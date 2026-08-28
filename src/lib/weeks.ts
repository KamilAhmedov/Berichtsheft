import type { DayEntry, Profile, WeekEntry } from '../../shared/types'
import {
  addDays,
  fromISODate,
  getISOWeek,
  isoWeekStart,
  toISODate,
  trainingYearFor,
  weekId,
  weekRange,
} from '../../shared/dates'

/** Montag bis Freitag als leere Tageszeilen — die Regelarbeitswoche. */
export function makeDays(monday: Date, count = 5): DayEntry[] {
  return Array.from({ length: count }, (_, i) => ({
    date: toISODate(addDays(monday, i)),
    kind: 'company' as const,
    text: '',
    hours: 0,
  }))
}

/** Ein leerer Bericht für eine bestimmte Kalenderwoche. */
export function makeEntry(isoYear: number, isoWeek: number, profile: Profile): WeekEntry {
  const monday = isoWeekStart(isoYear, isoWeek)
  const sunday = addDays(monday, 6)
  const start = profile.startDate ? fromISODate(profile.startDate) : monday
  return {
    id: weekId(isoYear, isoWeek),
    isoYear,
    isoWeek,
    startDate: toISODate(monday),
    endDate: toISODate(sunday),
    trainingYear: trainingYearFor(monday, start, profile.durationYears),
    company: '',
    school: '',
    instruction: '',
    days: makeDays(monday),
    notes: '',
    status: 'draft',
    createdAt: '',
    updatedAt: '',
  }
}

/** Die Stunden stehen bei den Tagen — in beiden Erfassungsarten. */
export function totalHours(e: WeekEntry): number {
  return (e.days ?? []).reduce((sum, d) => sum + (d.hours || 0), 0)
}

export function isEmptyEntry(e: WeekEntry): boolean {
  const dayText = (e.days ?? []).some((d) => d.text.trim())
  return !e.company.trim() && !e.school.trim() && !e.instruction.trim() && !dayText
}

/** Kurzfassung fuer die Listenansicht — erste gefuellte Zeile, egal aus welchem Feld. */
export function entrySummary(e: WeekEntry): string {
  const fromDay = (e.days ?? []).find((d) => d.text.trim())?.text
  const source = e.company.trim() || fromDay || e.school.trim() || e.instruction.trim()
  return source ? source.split('\n')[0] : ''
}

/** Alle Wochen der Ausbildung — Grundlage für Fortschritt und Lücken. */
export function plannedWeeks(profile: Profile): Array<{ isoYear: number; isoWeek: number }> {
  if (!profile.startDate) return []
  const start = fromISODate(profile.startDate)
  const end = new Date(
    start.getFullYear() + Math.floor(profile.durationYears),
    start.getMonth() + Math.round((profile.durationYears % 1) * 12),
    start.getDate(),
  )
  return weekRange(start, addDays(end, -1))
}

/**
 * Vergangene Wochen ohne Eintrag. Die laufende Woche zählt nicht als Lücke —
 * die schreibt man üblicherweise erst am Freitag.
 */
export function missingWeeks(
  profile: Profile,
  entries: WeekEntry[],
  today = new Date(),
): Array<{ isoYear: number; isoWeek: number }> {
  const current = getISOWeek(today)
  const currentId = weekId(current.isoYear, current.isoWeek)
  const filled = new Set(entries.filter((e) => !isEmptyEntry(e)).map((e) => e.id))
  return plannedWeeks(profile).filter((w) => {
    const id = weekId(w.isoYear, w.isoWeek)
    return id < currentId && !filled.has(id)
  })
}

export function currentWeek(today = new Date()): { isoYear: number; isoWeek: number } {
  return getISOWeek(today)
}
