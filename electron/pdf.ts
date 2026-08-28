import { BrowserWindow } from 'electron'
import { rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import type { DayEntry, Language, PdfLayout, Profile, WeekEntry } from '../shared/types'
import { PDF_LABELS, PDF_LOCALE, type PdfLabels } from '../shared/pdfLabels'
import { addDays, formatDateRange, fromISODate } from '../shared/dates'

/**
 * Das PDF entsteht, indem eine unsichtbare Fenster-Instanz das Berichts-HTML
 * rendert und Chromium es direkt als PDF ausgibt. Vorteil gegenüber einer
 * PDF-Bibliothek: volle Unicode-Unterstützung (ä/ö/ü/ß und ş/ğ/ı) ohne
 * eingebettete Schriftdateien, und das Layout ist ganz normales CSS.
 *
 * Jede Woche belegt genau eine A4-Seite — wie beim gedruckten Vordruck.
 */

function esc(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/** Zeilenumbrüche des Nutzers erhalten, alles andere neutralisieren. */
function text(value: string): string {
  return esc(value).replace(/\r?\n/g, '<br>')
}

function hoursText(value: number, locale: string): string {
  if (!value) return ''
  return value.toLocaleString(locale, { maximumFractionDigits: 1 })
}

function hasDays(e: WeekEntry): boolean {
  return (e.days ?? []).some((d) => d.text.trim() || d.hours > 0)
}

function dayHours(e: WeekEntry): number {
  return (e.days ?? []).reduce((sum, d) => sum + (d.hours || 0), 0)
}

function totalOf(e: WeekEntry): number {
  return hasDays(e) ? dayHours(e) : e.companyHours + e.schoolHours + e.instructionHours
}

function formatDate(iso: string, locale: string): string {
  if (!iso) return ''
  return fromISODate(iso).toLocaleDateString(locale, {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
}

/* ------------------------------------------------------- Gemeinsame Teile -- */

/** Kopfzeilen: Name, Ausbildungsjahr, Bereich, Zeitraum — wie im Vordruck. */
function metaTable(e: WeekEntry, p: Profile, L: PdfLabels, locale: string): string {
  return `
    <table class="meta">
      <tr>
        <td class="k">${esc(L.traineeName)}:</td>
        <td colspan="3">${esc(p.fullName)}</td>
      </tr>
      <tr>
        <td class="k">${esc(L.trainingYear)}:</td>
        <td>${e.trainingYear}</td>
        <td class="k">${esc(L.trainingArea)}:</td>
        <td>${esc(p.department || p.company)}</td>
      </tr>
      <tr>
        <td class="k">${esc(L.weekFrom)}:</td>
        <td>${esc(formatDate(e.startDate, locale))}</td>
        <td class="k narrow">${esc(L.until)}:</td>
        <td>${esc(formatDate(e.endDate, locale))}</td>
      </tr>
    </table>`
}

/** Vier Unterschriftsfelder in zwei Reihen, wie auf dem Vordruck. */
function signatures(L: PdfLabels): string {
  return `
    <div class="sign">
      <div class="line">${esc(L.signTrainee)}</div>
      <div class="line">${esc(L.signTrainer)}</div>
      <div class="line">${esc(L.signGuardian)}</div>
      <div class="line last">${esc(L.signOther)}</div>
    </div>`
}

function sheetHead(L: PdfLabels, daily: boolean): string {
  return `
    <div class="head">
      <h1>${esc(L.title)}</h1>
      <div class="sub">${esc(daily ? L.subtitleDaily : L.subtitleWeekly)}</div>
    </div>`
}

/* -------------------------------------------------------------- Klassisch -- */

function classicStyles(): string {
  return `
    @page { size: A4; margin: 12mm 12mm 10mm; }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: Arial, Helvetica, sans-serif;
      font-size: 9.5pt;
      color: #000;
      line-height: 1.35;
    }
    .sheet { page-break-after: always; }
    .sheet:last-child { page-break-after: auto; }

    .head { text-align: center; margin-bottom: 4mm; }
    h1 { font-size: 13pt; margin: 0; }
    .sub { font-size: 11pt; font-weight: bold; margin-top: 1mm; }

    table { width: 100%; border-collapse: collapse; }
    .meta { margin-bottom: 3mm; }
    .meta td { border: 1px solid #000; padding: 1.6mm 2mm; height: 7mm; }
    .meta .k { width: 46mm; background: #eef2f7; white-space: nowrap; }
    .meta .k.narrow { width: 14mm; }

    /* Wochenraster: links Wochentage mit Stundenspalte, rechts die Textblöcke. */
    .grid { display: flex; border: 1px solid #000; height: 176mm; }
    .grid .days { display: flex; flex-direction: column; width: 32mm;
                  border-right: 1px solid #000; }
    .grid .days .hhead { height: 7mm; border-bottom: 1px solid #000; background: #eef2f7;
                         font-style: italic; font-size: 8.5pt; display: flex; }
    .grid .days .hhead .a { width: 16mm; border-right: 1px solid #000; }
    .grid .days .hhead .b { flex: 1; display: flex; align-items: center;
                            justify-content: center; }
    .grid .days .row { flex: 1; display: flex; border-bottom: 1px solid #000; }
    .grid .days .row:last-child { border-bottom: none; }
    .grid .days .name { width: 16mm; border-right: 1px solid #000; background: #eef2f7;
                        font-weight: bold; font-size: 8.5pt;
                        display: flex; align-items: center; justify-content: center; }
    .grid .days .name span { writing-mode: vertical-rl; transform: rotate(180deg); }
    .grid .days .h { flex: 1; text-align: center; padding-top: 2mm; }

    .grid .blocks { flex: 1; display: flex; flex-direction: column; }
    .grid .blocks .sec { display: flex; flex-direction: column; border-bottom: 1px solid #000; }
    .grid .blocks .sec:last-child { border-bottom: none; }
    .grid .blocks .sec.big { flex: 42; }
    .grid .blocks .sec.mid { flex: 16; }
    .grid .blocks .sec.small { flex: 14; }
    .grid .blocks h2 { margin: 0; padding: 1.4mm 2mm; background: #d9d9d9;
                       border-bottom: 1px solid #000; font-size: 9pt; }
    .grid .blocks .body { flex: 1; padding: 2mm; overflow: hidden; }

    /* Tagesraster: eine Zeile je Tag mit Text und Stunden. */
    .daygrid { border: 1px solid #000; height: 176mm; display: flex; flex-direction: column; }
    .daygrid .r { display: flex; border-bottom: 1px solid #000; }
    .daygrid .r:last-child { border-bottom: none; }
    .daygrid .r.head { background: #d9d9d9; font-weight: bold; height: 7mm; }
    .daygrid .r.day { flex: 1; }
    .daygrid .r.block { flex: 1.15; flex-direction: column; }
    .daygrid .c-day { width: 26mm; border-right: 1px solid #000; padding: 1.6mm 2mm;
                      background: #eef2f7; font-weight: bold; font-size: 8.5pt; }
    .daygrid .c-day .d { font-weight: normal; color: #333; }
    .daygrid .c-kind { width: 24mm; border-right: 1px solid #000; padding: 1.6mm 2mm;
                       font-size: 8.5pt; }
    .daygrid .c-text { flex: 1; padding: 1.6mm 2mm; }
    .daygrid .c-h { width: 16mm; border-left: 1px solid #000; padding: 1.6mm 2mm;
                    text-align: center; }
    .daygrid .r.head .c-day, .daygrid .r.head .c-kind, .daygrid .r.head .c-text,
    .daygrid .r.head .c-h { background: #d9d9d9; }
    .daygrid .r.total { height: 7mm; background: #eef2f7; font-weight: bold; }
    .daygrid .r.block h2 { margin: 0; padding: 1.4mm 2mm; background: #d9d9d9;
                           border-bottom: 1px solid #000; font-size: 9pt; }
    .daygrid .r.block .body { flex: 1; padding: 2mm; }

    /* Vier Unterschriftsfelder, zwei je Reihe. */
    .sign { display: flex; flex-wrap: wrap; margin-top: 10mm; column-gap: 14mm; row-gap: 11mm; }
    .sign .line { width: calc(50% - 7mm); border-top: 1px solid #000;
                  padding-top: 1.2mm; font-size: 7.5pt; }
    .sign .line.last { border-top: 1px solid #000; }
  `
}

/** Die sieben Wochentage mit den Stunden aus der Tagesliste. */
function weekdayRows(e: WeekEntry, locale: string): string {
  const monday = fromISODate(e.startDate)
  const byIndex = new Map<number, DayEntry>()
  for (const day of e.days ?? []) {
    const diff = Math.round(
      (fromISODate(day.date).getTime() - monday.getTime()) / 86_400_000,
    )
    if (diff >= 0 && diff < 7) byIndex.set(diff, day)
  }

  return Array.from({ length: 7 }, (_, i) => {
    const name = addDays(monday, i).toLocaleDateString(locale, { weekday: 'long' })
    const day = byIndex.get(i)
    return `
      <div class="row">
        <div class="name"><span>${esc(name)}</span></div>
        <div class="h">${day ? esc(hoursText(day.hours, locale)) : ''}</div>
      </div>`
  }).join('')
}

/** Wochenblatt: Stundenraster links, drei Textblöcke rechts. */
function classicWeekly(e: WeekEntry, p: Profile, L: PdfLabels, locale: string): string {
  return `
  <section class="sheet">
    ${sheetHead(L, false)}
    ${metaTable(e, p, L, locale)}
    <div class="grid">
      <div class="days">
        <div class="hhead"><div class="a"></div><div class="b">${esc(L.hours)}</div></div>
        ${weekdayRows(e, locale)}
      </div>
      <div class="blocks">
        <div class="sec big">
          <h2>${esc(L.blockCompany)}</h2>
          <div class="body">${text(e.company)}</div>
        </div>
        <div class="sec mid">
          <h2>${esc(L.blockUnits)}</h2>
          <div class="body">${text(e.instruction)}</div>
        </div>
        <div class="sec small">
          <h2>${esc(L.blockSchool)}</h2>
          <div class="body">${text(e.school)}</div>
        </div>
      </div>
    </div>
    ${signatures(L)}
  </section>`
}

/** Tagesblatt: eine Zeile je Arbeitstag, darunter die beiden kleineren Blöcke. */
function classicDaily(e: WeekEntry, p: Profile, L: PdfLabels, locale: string): string {
  const rows = (e.days ?? [])
    .map((d) => {
      const date = fromISODate(d.date)
      return `
        <div class="r day">
          <div class="c-day">
            ${esc(date.toLocaleDateString(locale, { weekday: 'long' }))}<br>
            <span class="d">${esc(date.toLocaleDateString(locale, { day: '2-digit', month: '2-digit' }))}</span>
          </div>
          <div class="c-kind">${esc(L.dayKinds[d.kind])}</div>
          <div class="c-text">${text(d.text)}</div>
          <div class="c-h">${esc(hoursText(d.hours, locale))}</div>
        </div>`
    })
    .join('')

  return `
  <section class="sheet">
    ${sheetHead(L, true)}
    ${metaTable(e, p, L, locale)}
    <div class="daygrid">
      <div class="r head">
        <div class="c-day">${esc(L.day)}</div>
        <div class="c-kind">${esc(L.kind)}</div>
        <div class="c-text">${esc(L.blockCompany)}</div>
        <div class="c-h">${esc(L.hours)}</div>
      </div>
      ${rows}
      <div class="r total">
        <div class="c-day">${esc(L.total)}</div>
        <div class="c-kind"></div>
        <div class="c-text"></div>
        <div class="c-h">${esc(hoursText(dayHours(e), locale))}</div>
      </div>
      <div class="r block">
        <h2>${esc(L.blockUnits)}</h2>
        <div class="body">${text(e.instruction)}</div>
      </div>
      <div class="r block">
        <h2>${esc(L.blockSchool)}</h2>
        <div class="body">${text(e.school)}</div>
      </div>
    </div>
    ${signatures(L)}
  </section>`
}

/* ----------------------------------------------------------------- Modern -- */

function modernStyles(): string {
  return `
    @page { size: A4; margin: 15mm 14mm 12mm; }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: "Segoe UI", Inter, system-ui, sans-serif;
      font-size: 9.5pt;
      color: #16202c;
      line-height: 1.5;
    }
    .sheet { page-break-after: always; }
    .sheet:last-child { page-break-after: auto; }
    .head { display: flex; justify-content: space-between; align-items: flex-end;
            border-bottom: 2px solid #2563eb; padding-bottom: 3mm; margin-bottom: 5mm; }
    h1 { font-size: 15pt; margin: 0; color: #1d4ed8; letter-spacing: -.2px; }
    .sub { font-size: 8.5pt; color: #64748b; margin-top: 1mm; }
    .kw { text-align: right; padding-left: 8mm; white-space: nowrap; }
    .kw .big { font-size: 19pt; font-weight: 600; line-height: 1; }
    .kw .small { font-size: 8pt; color: #64748b; }
    .meta { display: grid; grid-template-columns: repeat(3, 1fr); gap: 2.5mm 5mm; margin-bottom: 5mm; }
    .meta .k { font-size: 7pt; text-transform: uppercase; letter-spacing: .6px; color: #94a3b8; }
    .meta .v { font-size: 9.5pt; font-weight: 500; }
    .block { border: 1px solid #e2e8f0; border-radius: 3mm; padding: 3.5mm; margin-bottom: 3mm;
             break-inside: avoid; }
    .block h2 { font-size: 8.5pt; margin: 0 0 2mm; text-transform: uppercase; letter-spacing: .6px;
                color: #475569; display: flex; justify-content: space-between; gap: 6mm; }
    .block h2 .h { color: #2563eb; font-weight: 600; letter-spacing: 0; text-transform: none;
                   white-space: nowrap; }
    .block .content { min-height: 18mm; }
    .empty { color: #cbd5e1; }

    table.days { width: 100%; border-collapse: collapse; margin-bottom: 3mm; }
    table.days th { background: #f1f5f9; color: #475569; font-size: 7.5pt; text-transform: uppercase;
                    letter-spacing: .5px; text-align: left; padding: 2mm 3mm; }
    table.days td { border-top: 1px solid #e2e8f0; padding: 2.5mm 3mm; vertical-align: top;
                    font-size: 9pt; }
    table.days .day-col { width: 20mm; }
    table.days .kind-col { width: 26mm; color: #64748b; }
    table.days .hours-col { width: 16mm; text-align: right; }
    table.days .total-row td { border-top: 2px solid #cbd5e1; font-weight: 600; }
    .muted { color: #94a3b8; font-weight: normal; }

    .sign { display: flex; flex-wrap: wrap; margin-top: 10mm; column-gap: 14mm; row-gap: 10mm; }
    .sign .line { width: calc(50% - 7mm); border-top: 1px solid #94a3b8;
                  padding-top: 1.5mm; font-size: 7.5pt; color: #64748b; }
  `
}

function modernDayTable(e: WeekEntry, L: PdfLabels, locale: string): string {
  const rows = (e.days ?? [])
    .map((d) => {
      const date = fromISODate(d.date)
      const weekday = date.toLocaleDateString(locale, { weekday: 'short' })
      const short = date.toLocaleDateString(locale, { day: '2-digit', month: '2-digit' })
      return `
        <tr>
          <td class="day-col"><strong>${esc(weekday)}</strong><br><span class="muted">${esc(short)}</span></td>
          <td class="kind-col">${esc(L.dayKinds[d.kind])}</td>
          <td>${d.text.trim() ? text(d.text) : '<span class="muted">—</span>'}</td>
          <td class="hours-col">${esc(hoursText(d.hours, locale)) || '—'}</td>
        </tr>`
    })
    .join('')

  return `
    <table class="days">
      <tr>
        <th class="day-col">${esc(L.day)}</th>
        <th class="kind-col">${esc(L.kind)}</th>
        <th>${esc(L.blockCompany)}</th>
        <th class="hours-col">${esc(L.hours)}</th>
      </tr>
      ${rows}
      <tr class="total-row">
        <td colspan="3">${esc(L.total)}</td>
        <td class="hours-col">${esc(hoursText(dayHours(e), locale)) || '—'}</td>
      </tr>
    </table>`
}

function modernSheet(e: WeekEntry, p: Profile, L: PdfLabels, locale: string): string {
  const daily = hasDays(e)

  const block = (heading: string, value: string, h: number): string => `
    <div class="block">
      <h2><span>${esc(heading)}</span><span class="h">${esc(hoursText(h, locale)) || '—'} ${esc(L.hours)}</span></h2>
      <div class="content">${value.trim() ? text(value) : '<span class="empty">—</span>'}</div>
    </div>`

  const body = daily
    ? `${modernDayTable(e, L, locale)}
       ${e.instruction.trim() ? block(L.blockUnits, e.instruction, e.instructionHours) : ''}
       ${e.school.trim() ? block(L.blockSchool, e.school, e.schoolHours) : ''}`
    : `${block(L.blockCompany, e.company, e.companyHours)}
       ${block(L.blockUnits, e.instruction, e.instructionHours)}
       ${block(L.blockSchool, e.school, e.schoolHours)}`

  return `
  <section class="sheet">
    <div class="head">
      <div>
        <h1>${esc(L.title)}</h1>
        <div class="sub">${esc(p.fullName || L.traineeName)} · ${esc(p.occupation)}</div>
      </div>
      <div class="kw">
        <div class="big">KW ${String(e.isoWeek).padStart(2, '0')}</div>
        <div class="small">${esc(formatDateRange(e.startDate, e.endDate, locale))}</div>
      </div>
    </div>

    <div class="meta">
      <div><div class="k">${esc(L.trainingYear)}</div><div class="v">${e.trainingYear}</div></div>
      <div><div class="k">${esc(L.trainingArea)}</div><div class="v">${esc(p.department || p.company) || '—'}</div></div>
      <div><div class="k">${esc(L.total)}</div><div class="v">${esc(hoursText(totalOf(e), locale)) || '—'} ${esc(L.hours)}</div></div>
    </div>

    ${body}
    ${signatures(L)}
  </section>`
}

/* ----------------------------------------------------------------- Ausgabe */

export function buildReportHtml(
  entries: WeekEntry[],
  profile: Profile,
  layout: PdfLayout,
  lang: Language,
): string {
  const L = PDF_LABELS[lang]
  const locale = PDF_LOCALE[lang]
  const styles = layout === 'classic' ? classicStyles() : modernStyles()

  const sheets = entries.length
    ? entries
        .map((e) => {
          if (layout === 'modern') return modernSheet(e, profile, L, locale)
          return hasDays(e)
            ? classicDaily(e, profile, L, locale)
            : classicWeekly(e, profile, L, locale)
        })
        .join('\n')
    : `<section class="sheet"><p>${esc(L.noEntries)}</p></section>`

  return `<!doctype html>
<html lang="${lang}">
<head><meta charset="utf-8"><title>${esc(L.title)}</title><style>${styles}</style></head>
<body>${sheets}</body>
</html>`
}

/**
 * Rendert das HTML in einem unsichtbaren Fenster und schreibt das PDF auf die Platte.
 *
 * Die Vorlage geht bewusst über eine temporäre Datei statt über eine `data:`-URL:
 * Letztere stößt bei langen Berichten an Längengrenzen.
 */
export async function renderPdfToFile(html: string, targetPath: string): Promise<void> {
  const tempFile = join(tmpdir(), `berichtsheft-${randomUUID()}.html`)
  await writeFile(tempFile, html, 'utf-8')

  const win = new BrowserWindow({
    show: false,
    webPreferences: { javascript: false, sandbox: true },
  })

  try {
    await win.loadFile(tempFile)
    const buffer = await win.webContents.printToPDF({
      pageSize: 'A4',
      printBackground: true,
      margins: { marginType: 'none' },
    })
    await writeFile(targetPath, buffer)
  } finally {
    win.destroy()
    await rm(tempFile, { force: true })
  }
}
