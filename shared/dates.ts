/**
 * ISO-8601 Kalenderwochen. Bewusst ohne Abhängigkeit implementiert:
 * Die Regeln sind überschaubar und so bleibt das Bundle klein.
 */

const DAY = 86_400_000

export function toISODate(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function fromISODate(s: string): Date {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, m - 1, d)
}

/** Montag der Woche, in der `d` liegt (ISO: Woche beginnt Montag). */
export function startOfISOWeek(d: Date): Date {
  const out = new Date(d.getFullYear(), d.getMonth(), d.getDate())
  const dow = (out.getDay() + 6) % 7 // Mo=0 … So=6
  out.setDate(out.getDate() - dow)
  return out
}

export function addDays(d: Date, n: number): Date {
  const out = new Date(d.getFullYear(), d.getMonth(), d.getDate())
  out.setDate(out.getDate() + n)
  return out
}

/** ISO-Wochennummer und zugehöriges ISO-Jahr (können am Jahreswechsel abweichen). */
export function getISOWeek(d: Date): { isoYear: number; isoWeek: number } {
  // Donnerstag der Woche bestimmt das ISO-Jahr.
  const thursday = addDays(startOfISOWeek(d), 3)
  const isoYear = thursday.getFullYear()
  const jan1 = new Date(isoYear, 0, 1)
  const firstThursday = addDays(startOfISOWeek(jan1), 3)
  const isoWeek = Math.round((thursday.getTime() - firstThursday.getTime()) / (7 * DAY)) + 1
  return { isoYear, isoWeek }
}

/** Montag der angegebenen ISO-Woche. */
export function isoWeekStart(isoYear: number, isoWeek: number): Date {
  const jan4 = new Date(isoYear, 0, 4) // liegt per Definition immer in KW 1
  return addDays(startOfISOWeek(jan4), (isoWeek - 1) * 7)
}

/** Anzahl der ISO-Wochen im Jahr: 52 oder 53. */
export function weeksInISOYear(isoYear: number): number {
  const dec28 = new Date(isoYear, 11, 28) // liegt per Definition immer in der letzten Woche
  return getISOWeek(dec28).isoWeek
}

export function weekId(isoYear: number, isoWeek: number): string {
  return `${isoYear}-KW${String(isoWeek).padStart(2, '0')}`
}

export function parseWeekId(id: string): { isoYear: number; isoWeek: number } {
  const [y, w] = id.split('-KW')
  return { isoYear: Number(y), isoWeek: Number(w) }
}

/** Alle Wochen von `from` bis `to` (einschließlich), chronologisch. */
export function weekRange(from: Date, to: Date): Array<{ isoYear: number; isoWeek: number }> {
  const out: Array<{ isoYear: number; isoWeek: number }> = []
  let cursor = startOfISOWeek(from)
  const last = startOfISOWeek(to)
  let guard = 0
  while (cursor.getTime() <= last.getTime() && guard++ < 1000) {
    out.push(getISOWeek(cursor))
    cursor = addDays(cursor, 7)
  }
  return out
}

/**
 * Lehrjahr (1-basiert) für ein Datum, gerechnet ab dem Ausbildungsbeginn.
 * Vor dem Beginn ergibt sich 1, damit die Anzeige nie 0 oder negativ wird.
 */
export function trainingYearFor(date: Date, start: Date, durationYears: number): number {
  let year = 1
  let boundary = new Date(start.getFullYear() + 1, start.getMonth(), start.getDate())
  while (date.getTime() >= boundary.getTime() && year < Math.ceil(durationYears)) {
    year++
    boundary = new Date(boundary.getFullYear() + 1, boundary.getMonth(), boundary.getDate())
  }
  return year
}

export function formatDateRange(startISO: string, endISO: string, locale: string): string {
  const opts: Intl.DateTimeFormatOptions = { day: '2-digit', month: '2-digit', year: 'numeric' }
  const a = fromISODate(startISO).toLocaleDateString(locale, opts)
  const b = fromISODate(endISO).toLocaleDateString(locale, opts)
  return `${a} – ${b}`
}

export function daysBetween(a: Date, b: Date): number {
  return Math.floor((b.getTime() - a.getTime()) / DAY)
}
