import { BrowserWindow } from 'electron'
import { rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import type { Language, PdfLayout, Profile, WeekEntry } from '../shared/types'
import { PDF_LABELS, PDF_LOCALE, type PdfLabels } from '../shared/pdfLabels'
import { formatDateRange, fromISODate, toISODate } from '../shared/dates'

/**
 * Das PDF entsteht, indem eine unsichtbare Fenster-Instanz das Berichts-HTML
 * rendert und Chromium es direkt als PDF ausgibt. Vorteil gegenüber einer
 * PDF-Bibliothek: volle Unicode-Unterstützung (ä/ö/ü/ß und ş/ğ/ı) ohne
 * eingebettete Schriftdateien, und das Layout ist ganz normales CSS.
 *
 * Das klassische Layout ist an den IHK-Vordruck angelehnt: gleiche Kopfangaben,
 * gleiche Reihenfolge der drei Blöcke, dieselben Unterschriftszeilen.
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

function hours(value: number, locale: string): string {
  if (!value) return '—'
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

/** Voraussichtliches Ausbildungsende — das Deckblatt fragt danach. */
function trainingEnd(p: Profile, locale: string): string {
  if (!p.startDate) return ''
  const start = fromISODate(p.startDate)
  const whole = Math.floor(p.durationYears)
  const months = Math.round((p.durationYears % 1) * 12)
  const end = new Date(start.getFullYear() + whole, start.getMonth() + months, start.getDate() - 1)
  return formatDate(toISODate(end), locale)
}

/* ---------------------------------------------------------------- Styles -- */

function classicStyles(): string {
  return `
    @page { size: A4; margin: 14mm 12mm 12mm; }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: "Times New Roman", Georgia, serif;
      font-size: 10.5pt;
      color: #000;
      line-height: 1.45;
    }
    .sheet { page-break-after: always; }
    .sheet:last-child { page-break-after: auto; }
    h1 { font-size: 15pt; margin: 0 0 1mm; text-align: center; }
    .sub { text-align: center; font-size: 10pt; margin-bottom: 5mm; }
    table { width: 100%; border-collapse: collapse; }
    td, th { border: 1px solid #000; padding: 2mm 2.5mm; vertical-align: top; }
    th { background: #eee; font-weight: bold; text-align: left; font-size: 10pt; }
    .meta td { font-size: 10pt; }
    .meta .k { width: 46mm; font-weight: bold; background: #f6f6f6; }
    .meta .k.short { width: 32mm; }
    .section-head { display: flex; justify-content: space-between; align-items: baseline; }
    .hours { font-weight: normal; font-size: 9pt; white-space: nowrap; padding-left: 4mm; }
    .body-cell { height: 46mm; }
    .body-cell.small { height: 30mm; }
    .spacer { height: 3mm; }

    table.days td, table.days th { font-size: 10pt; }
    table.days .day-col { width: 20mm; text-align: center; }
    table.days .kind-col { width: 26mm; }
    table.days .hours-col { width: 18mm; text-align: right; }
    table.days td { height: 21mm; }
    table.days .total-row td { height: auto; background: #f6f6f6; }
    .muted { color: #555; font-weight: normal; }

    .sign { margin-top: 12mm; }
    .sign .row { display: flex; gap: 12mm; }
    .sign .line { flex: 1; border-top: 1px solid #000; padding-top: 1.5mm;
                  font-size: 8.5pt; text-align: center; }
    .sign .row.second { margin-top: 10mm; }
    .sign .row.second .line { max-width: 50%; margin-left: auto; }

    .cover h1 { font-size: 20pt; margin-top: 20mm; margin-bottom: 10mm; }
    .cover .fields { margin: 0 auto; width: 150mm; }
    .cover .fields td { border: none; border-bottom: 1px solid #000; padding: 3mm 1mm 1.5mm; }
    .cover .fields td.k { border-bottom: none; width: 58mm; font-weight: normal;
                          background: none; vertical-align: bottom; }
    .cover .note { margin: 16mm auto 0; width: 150mm; font-size: 9pt; line-height: 1.5; }
    .cover .note h2 { font-size: 10pt; margin: 0 0 2mm; }
  `
}

function modernStyles(): string {
  return `
    @page { size: A4; margin: 16mm 14mm 14mm; }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: "Segoe UI", Inter, system-ui, sans-serif;
      font-size: 10pt;
      color: #16202c;
      line-height: 1.55;
    }
    .sheet { page-break-after: always; }
    .sheet:last-child { page-break-after: auto; }
    .head { display: flex; justify-content: space-between; align-items: flex-end;
            border-bottom: 2px solid #2563eb; padding-bottom: 3mm; margin-bottom: 5mm; }
    h1 { font-size: 16pt; margin: 0; color: #1d4ed8; letter-spacing: -.2px; }
    .sub { font-size: 9pt; color: #64748b; margin-top: 1mm; }
    .kw { text-align: right; padding-left: 8mm; white-space: nowrap; }
    .kw .big { font-size: 20pt; font-weight: 600; line-height: 1; }
    .kw .small { font-size: 8.5pt; color: #64748b; }
    .meta { display: grid; grid-template-columns: repeat(3, 1fr); gap: 3mm 5mm; margin-bottom: 6mm; }
    .meta .k { font-size: 7.5pt; text-transform: uppercase; letter-spacing: .6px; color: #94a3b8; }
    .meta .v { font-size: 10pt; font-weight: 500; }
    .block { border: 1px solid #e2e8f0; border-radius: 3mm; padding: 4mm; margin-bottom: 4mm;
             break-inside: avoid; }
    .block h2 { font-size: 9pt; margin: 0 0 2mm; text-transform: uppercase; letter-spacing: .6px;
                color: #475569; display: flex; justify-content: space-between; gap: 6mm; }
    .block h2 .h { color: #2563eb; font-weight: 600; letter-spacing: 0; text-transform: none;
                   white-space: nowrap; }
    .block .content { min-height: 20mm; }
    .empty { color: #cbd5e1; }

    table.days { width: 100%; border-collapse: collapse; margin-bottom: 4mm; }
    table.days th { background: #f1f5f9; color: #475569; font-size: 8pt; text-transform: uppercase;
                    letter-spacing: .5px; text-align: left; padding: 2mm 3mm; }
    table.days td { border-top: 1px solid #e2e8f0; padding: 3mm; vertical-align: top; font-size: 9.5pt; }
    table.days .day-col { width: 20mm; }
    table.days .kind-col { width: 30mm; color: #64748b; }
    table.days .hours-col { width: 18mm; text-align: right; }
    table.days .total-row td { border-top: 2px solid #cbd5e1; font-weight: 600; }
    .muted { color: #94a3b8; font-weight: normal; }

    .sign { margin-top: 12mm; }
    .sign .row { display: flex; gap: 14mm; }
    .sign .line { flex: 1; border-top: 1px solid #94a3b8; padding-top: 2mm;
                  font-size: 8.5pt; color: #64748b; }
    .sign .row.second { margin-top: 10mm; }
    .sign .row.second .line { max-width: 50%; margin-left: auto; }

    .cover h1 { font-size: 24pt; margin-top: 24mm; }
    .cover .fields { margin-top: 12mm; display: grid; grid-template-columns: 60mm 1fr;
                     gap: 4mm 6mm; align-items: end; }
    .cover .fields .k { font-size: 9pt; color: #64748b; }
    .cover .fields .v { border-bottom: 1px solid #cbd5e1; padding-bottom: 1.5mm; font-weight: 500; }
    .cover .note { margin-top: 18mm; font-size: 8.5pt; color: #475569; line-height: 1.6; }
    .cover .note h2 { font-size: 9pt; margin: 0 0 2mm; color: #1d4ed8; }
  `
}

/* ------------------------------------------------------------- Deckblatt -- */

function coverSheet(p: Profile, lang: Language, layout: PdfLayout): string {
  const L = PDF_LABELS[lang]
  const locale = PDF_LOCALE[lang]

  const fields: Array<[string, string]> = [
    [L.coverBookNumber, p.bookNumber],
    [L.coverName, p.fullName],
    [L.coverAddress, p.address],
    [L.coverOccupation, p.occupation],
    [L.coverSpecialization, p.specialization],
    [L.coverCompany, p.company],
    [L.coverTrainer, p.trainer],
    [L.coverStart, formatDate(p.startDate, locale)],
    [L.coverEnd, trainingEnd(p, locale)],
  ]

  const body =
    layout === 'classic'
      ? `<table class="fields">${fields
          .map(([k, v]) => `<tr><td class="k">${esc(k)}:</td><td>${esc(v)}</td></tr>`)
          .join('')}</table>`
      : `<div class="fields">${fields
          .map(([k, v]) => `<div class="k">${esc(k)}</div><div class="v">${esc(v) || '&nbsp;'}</div>`)
          .join('')}</div>`

  return `
  <section class="sheet cover">
    <h1>${esc(L.title)}</h1>
    ${body}
    <div class="note">
      <h2>${esc(L.coverNoteTitle)}</h2>
      <p>${esc(L.coverNote)}</p>
    </div>
  </section>`
}

/* ------------------------------------------------------------ Tagestabelle */

function dayTable(e: WeekEntry, L: PdfLabels, locale: string): string {
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
          <td class="hours-col">${hours(d.hours, locale)}</td>
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
        <td colspan="3"><strong>${esc(L.total)}</strong></td>
        <td class="hours-col"><strong>${hours(dayHours(e), locale)}</strong></td>
      </tr>
    </table>`
}

/* ---------------------------------------------------- Unterschriftszeilen -- */

function signatures(L: PdfLabels): string {
  return `
    <div class="sign">
      <div class="row">
        <div class="line">${esc(L.signTrainee)}</div>
        <div class="line">${esc(L.signTrainer)}</div>
      </div>
      <div class="row second">
        <div class="line">${esc(L.signOther)}</div>
      </div>
    </div>`
}

/* ------------------------------------------------------- Klassisches Blatt */

function classicSheet(e: WeekEntry, p: Profile, lang: Language): string {
  const L = PDF_LABELS[lang]
  const locale = PDF_LOCALE[lang]
  const daily = hasDays(e)

  /** Ein Textblock mit Überschrift und Stundenangabe, wie im Vordruck. */
  const block = (heading: string, value: string, h: number, small = false): string => `
      <tr><th><div class="section-head"><span>${esc(heading)}</span>
        <span class="hours">${esc(L.hours)}: ${hours(h, locale)}</span></div></th></tr>
      <tr><td class="body-cell${small ? ' small' : ''}">${text(value)}</td></tr>`

  // Im Tagesmodus ersetzt die Tabelle den ersten Block; die beiden anderen
  // erscheinen nur, wenn sie ausgefüllt sind.
  const bodyBlocks = daily
    ? `${dayTable(e, L, locale)}
       ${
         e.instruction.trim() || e.school.trim()
           ? `<div class="spacer"></div><table>
                ${e.instruction.trim() ? block(L.blockUnits, e.instruction, e.instructionHours, true) : ''}
                ${e.school.trim() ? block(L.blockSchool, e.school, e.schoolHours, true) : ''}
              </table>`
           : ''
       }`
    : `<table>
         ${block(L.blockCompany, e.company, e.companyHours)}
         ${block(L.blockUnits, e.instruction, e.instructionHours, true)}
         ${block(L.blockSchool, e.school, e.schoolHours)}
         <tr><th>${esc(L.total)}: ${hours(totalOf(e), locale)} ${esc(L.hours)}</th></tr>
       </table>`

  return `
  <section class="sheet">
    <h1>${esc(L.title)}</h1>
    <div class="sub">(${esc(daily ? L.subtitleDaily : L.subtitleWeekly)})</div>

    <table class="meta">
      <tr>
        <td class="k">${esc(L.traineeName)}</td>
        <td colspan="3">${esc(p.fullName)}</td>
      </tr>
      <tr>
        <td class="k">${esc(L.trainingYear)}</td>
        <td>${e.trainingYear}</td>
        <td class="k short">${esc(L.trainingArea)}</td>
        <td>${esc(p.department || p.company)}</td>
      </tr>
      <tr>
        <td class="k">${esc(L.weekFrom)}</td>
        <td>${esc(formatDate(e.startDate, locale))}</td>
        <td class="k short">${esc(L.until)}</td>
        <td>${esc(formatDate(e.endDate, locale))}</td>
      </tr>
    </table>

    <div class="spacer"></div>
    ${bodyBlocks}
    ${signatures(L)}
  </section>`
}

/* --------------------------------------------------------- Modernes Blatt */

function modernSheet(e: WeekEntry, p: Profile, lang: Language): string {
  const L = PDF_LABELS[lang]
  const locale = PDF_LOCALE[lang]
  const daily = hasDays(e)

  const block = (heading: string, value: string, h: number): string => `
    <div class="block">
      <h2><span>${esc(heading)}</span><span class="h">${hours(h, locale)} ${esc(L.hours)}</span></h2>
      <div class="content">${value.trim() ? text(value) : '<span class="empty">—</span>'}</div>
    </div>`

  const bodyBlocks = daily
    ? `${dayTable(e, L, locale)}
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
      <div><div class="k">${esc(L.coverTrainer)}</div><div class="v">${esc(p.trainer) || '—'}</div></div>
      <div><div class="k">${esc(L.coverCompany)}</div><div class="v">${esc(p.company) || '—'}</div></div>
      <div><div class="k">${esc(L.weekFrom)}</div><div class="v">${esc(formatDateRange(e.startDate, e.endDate, locale))}</div></div>
      <div><div class="k">${esc(L.total)}</div><div class="v">${hours(totalOf(e), locale)} ${esc(L.hours)}</div></div>
    </div>

    ${bodyBlocks}
    ${signatures(L)}
  </section>`
}

/* ----------------------------------------------------------------- Ausgabe */

export function buildReportHtml(
  entries: WeekEntry[],
  profile: Profile,
  layout: PdfLayout,
  lang: Language,
  withCover = false,
): string {
  const L = PDF_LABELS[lang]
  const styles = layout === 'classic' ? classicStyles() : modernStyles()
  const cover = withCover ? coverSheet(profile, lang, layout) : ''
  const sheets = entries.length
    ? entries
        .map((e) =>
          layout === 'classic' ? classicSheet(e, profile, lang) : modernSheet(e, profile, lang),
        )
        .join('\n')
    : `<section class="sheet"><p>${esc(L.noEntries)}</p></section>`

  return `<!doctype html>
<html lang="${lang}">
<head><meta charset="utf-8"><title>${esc(L.title)}</title><style>${styles}</style></head>
<body>${cover}${sheets}</body>
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
