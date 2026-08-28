import { BrowserWindow } from 'electron'
import { rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import type { Language, PdfLayout, Profile, WeekEntry } from '../shared/types'
import { PDF_LABELS, PDF_LOCALE, type PdfLabels } from '../shared/pdfLabels'
import { formatDateRange, fromISODate } from '../shared/dates'

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

/**
 * Tagesweise erfasst? Entscheidend sind die Tagestexte — Stunden allein
 * genuegen nicht, denn die stehen auch bei der Wochenerfassung je Tag.
 */
function hasDays(e: WeekEntry): boolean {
  return (e.days ?? []).some((d) => d.text.trim().length > 0)
}

function dayHours(e: WeekEntry): number {
  return (e.days ?? []).reduce((sum, d) => sum + (d.hours || 0), 0)
}

/** Die Stunden stehen ausschliesslich bei den Tagen. */
function totalOf(e: WeekEntry): number {
  return dayHours(e)
}

function formatDate(iso: string, locale: string): string {
  if (!iso) return ''
  return fromISODate(iso).toLocaleDateString(locale, {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
}

/* -------------------------------------------------------------- Klassisch -- */

/**
 * Höhe des Inhaltsblocks in Millimetern. A4 ist 297 mm hoch; nach Rändern,
 * Überschrift, Kopftabelle und Unterschriftszeilen bleibt ungefähr so viel.
 * Der Inhalt wird auf diese Höhe verteilt, damit unten nichts leer bleibt.
 */
const BODY_MM = 208

/** Höhe einer Abschnittsüberschrift. */
const HEAD_MM = 7

function classicStyles(): string {
  return `
    @page { size: A4; margin: 12mm 12mm 10mm; }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: Arial, Helvetica, sans-serif;
      font-size: 9.5pt;
      color: #000;
      line-height: 1.4;
    }
    .sheet { page-break-after: always; }
    .sheet:last-child { page-break-after: auto; }

    .head { text-align: center; margin-bottom: 4mm; }
    h1 { font-size: 13.5pt; margin: 0; letter-spacing: .2px; }
    .sub { font-size: 10pt; margin-top: 1mm; }

    table { border-collapse: collapse; table-layout: fixed; width: 100%; }
    td, th { border: 0.35mm solid #444; padding: 1.6mm 2.2mm; vertical-align: top;
             text-align: left; font-weight: normal; overflow: hidden; }

    .meta { margin-bottom: 3mm; }
    .meta td { height: 7.5mm; vertical-align: middle; white-space: nowrap; }
    .meta .k { background: #f2f2f2; font-size: 8.5pt; }

    .content th { background: #f2f2f2; font-weight: bold; height: ${HEAD_MM}mm;
                  vertical-align: middle; font-size: 9pt; }
    .content td.body { line-height: 1.5; }

    .days .c-day { width: 30mm; font-weight: bold; font-size: 8.5pt; }
    .days .c-day .d { display: block; font-weight: normal; font-size: 8pt;
                      color: #444; margin-top: 0.6mm; }
    .days .c-kind { width: 26mm; font-size: 8.5pt; color: #333; }
    .days .c-h { width: 18mm; text-align: right; }
    .days th { text-align: center; }
    .days th.c-text { text-align: left; }
    .days .total td { height: ${HEAD_MM}mm; background: #f2f2f2; font-weight: bold;
                      vertical-align: middle; }

    /* Zwei Unterschriftszeilen — mehr verlangt der Nachweis nicht. */
    .sign { display: flex; gap: 16mm; margin-top: 11mm; }
    .sign .line { flex: 1; border-top: 0.35mm solid #444; padding-top: 1.4mm;
                  font-size: 8pt; }
  `
}

/** Kopfangaben: Name, Ausbildungsjahr, Berichtszeitraum, Summe der Stunden. */
function metaTable(e: WeekEntry, p: Profile, L: PdfLabels, locale: string): string {
  const total = dayHours(e)
  return `
    <table class="meta">
      <colgroup><col style="width:46mm"><col><col style="width:32mm"><col style="width:30mm"></colgroup>
      <tr>
        <td class="k">${esc(L.traineeName)}</td>
        <td>${esc(p.fullName)}</td>
        <td class="k">${esc(L.trainingYear)}</td>
        <td>${e.trainingYear}</td>
      </tr>
      <tr>
        <td class="k">${esc(L.period)}</td>
        <td>${esc(formatDate(e.startDate, locale))} – ${esc(formatDate(e.endDate, locale))}</td>
        <td class="k">${esc(L.total)}</td>
        <td>${total ? `${esc(hoursText(total, locale))} ${esc(L.hours)}` : ''}</td>
      </tr>
    </table>`
}

/** Nur die beiden Unterschriften, die der Nachweis wirklich braucht. */
function signatures(L: PdfLabels): string {
  return `
    <div class="sign">
      <div class="line">${esc(L.signTrainee)}</div>
      <div class="line">${esc(L.signTrainer)}</div>
    </div>`
}

function sheetHead(L: PdfLabels, daily: boolean): string {
  return `
    <div class="head">
      <h1>${esc(L.title)}</h1>
      <div class="sub">${esc(daily ? L.subtitleDaily : L.subtitleWeekly)}</div>
    </div>`
}

/**
 * Die Textblöcke einer Woche. Leere Abschnitte entfallen — ein beschrifteter,
 * aber leerer Kasten sagt nichts aus und verschenkt nur Platz. Die vorhandenen
 * teilen sich die freie Höhe.
 */
function textSections(
  sections: Array<{ heading: string; value: string; weight: number }>,
  availableMm: number,
): string {
  const present = sections.filter((s) => s.value.trim().length > 0)
  const used = present.length ? present : [sections[0]]
  const weightSum = used.reduce((sum, s) => sum + s.weight, 0)
  const bodyMm = availableMm - used.length * HEAD_MM

  return used
    .map((s) => {
      const h = ((bodyMm * s.weight) / weightSum).toFixed(2)
      return `
        <tr><th>${esc(s.heading)}</th></tr>
        <tr style="height:${h}mm"><td class="body">${text(s.value)}</td></tr>`
    })
    .join('')
}

/** Wochenblatt: drei Textblöcke, leere davon weggelassen. */
function classicWeekly(e: WeekEntry, p: Profile, L: PdfLabels, locale: string): string {
  return `
  <section class="sheet">
    ${sheetHead(L, false)}
    ${metaTable(e, p, L, locale)}
    <table class="content">
      ${textSections(
        [
          { heading: L.blockCompany, value: e.company, weight: 3 },
          { heading: L.blockUnits, value: e.instruction, weight: 1 },
          { heading: L.blockSchool, value: e.school, weight: 1.4 },
        ],
        BODY_MM,
      )}
    </table>
    ${signatures(L)}
  </section>`
}

/** Tagesblatt: eine Zeile je Arbeitstag; Zusatzblöcke nur, wenn sie Inhalt haben. */
function classicDaily(e: WeekEntry, p: Profile, L: PdfLabels, locale: string): string {
  const days = e.days ?? []
  const extras = [
    { heading: L.blockUnits, value: e.instruction, weight: 1 },
    { heading: L.blockSchool, value: e.school, weight: 1 },
  ].filter((s) => s.value.trim().length > 0)

  // Ein Drittel der Höhe für die Zusatzblöcke, sofern es welche gibt.
  const extraMm = extras.length ? Math.min(BODY_MM * 0.34, 34 * extras.length + HEAD_MM) : 0
  const tableMm = BODY_MM - extraMm
  const rowMm = Math.max(13, (tableMm - 2 * HEAD_MM) / Math.max(days.length, 1))

  const rows = days
    .map((d) => {
      const date = fromISODate(d.date)
      return `
        <tr style="height:${rowMm.toFixed(2)}mm">
          <td class="c-day">
            ${esc(date.toLocaleDateString(locale, { weekday: 'long' }))}
            <span class="d">${esc(formatDate(d.date, locale))}</span>
          </td>
          <td class="c-kind">${esc(L.dayKinds[d.kind])}</td>
          <td class="c-text">${text(d.text)}</td>
          <td class="c-h">${esc(hoursText(d.hours, locale))}</td>
        </tr>`
    })
    .join('')

  return `
  <section class="sheet">
    ${sheetHead(L, true)}
    ${metaTable(e, p, L, locale)}
    <table class="content days">
      <colgroup><col style="width:30mm"><col style="width:26mm"><col><col style="width:18mm"></colgroup>
      <tr>
        <th class="c-day">${esc(L.day)}</th>
        <th class="c-kind">${esc(L.kind)}</th>
        <th class="c-text">${esc(L.blockCompany)}</th>
        <th class="c-h">${esc(L.hours)}</th>
      </tr>
      ${rows}
      <tr class="total">
        <td>${esc(L.total)}</td>
        <td></td>
        <td></td>
        <td class="c-h">${esc(hoursText(dayHours(e), locale))}</td>
      </tr>
    </table>
    ${
      extras.length
        ? `<table class="content" style="margin-top:-0.35mm">${textSections(extras, extraMm)}</table>`
        : ''
    }
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

    .sign { display: flex; gap: 16mm; margin-top: 11mm; }
    .sign .line { flex: 1; border-top: 1px solid #94a3b8; padding-top: 1.5mm;
                  font-size: 8pt; color: #64748b; }
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

  const block = (heading: string, value: string): string => `
    <div class="block">
      <h2><span>${esc(heading)}</span></h2>
      <div class="content">${value.trim() ? text(value) : '<span class="empty">—</span>'}</div>
    </div>`

  const body = daily
    ? `${modernDayTable(e, L, locale)}
       ${e.instruction.trim() ? block(L.blockUnits, e.instruction) : ''}
       ${e.school.trim() ? block(L.blockSchool, e.school) : ''}`
    : `${block(L.blockCompany, e.company)}
       ${block(L.blockUnits, e.instruction)}
       ${block(L.blockSchool, e.school)}`

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
      <div><div class="k">${esc(L.trainer)}</div><div class="v">${esc(p.trainer) || '—'}</div></div>
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
