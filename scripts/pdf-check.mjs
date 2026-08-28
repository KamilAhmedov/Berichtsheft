/**
 * Erzeugt Beispiel-PDFs aus erfundenen Daten — für die Sichtprüfung des Layouts,
 * ohne die App von Hand durchzuklicken.
 *
 *   node scripts/pdf-check.mjs [Zielordner]
 *
 * Bündelt electron/pdf.ts mit esbuild und lässt Electron das Ergebnis rendern.
 */
import { spawn } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'
import electron from 'electron'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const outDir = resolve(process.argv[2] ?? join(root, 'release', 'pdf-check'))
const workDir = join(root, 'node_modules', '.pdf-check')

mkdirSync(outDir, { recursive: true })
mkdirSync(workDir, { recursive: true })

const harness = `
import { app, BrowserWindow } from 'electron'
import { join } from 'node:path'
import { writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { randomUUID } from 'node:crypto'
import { buildReportHtml, renderPdfToFile } from '${JSON.stringify(join(root, 'electron', 'pdf.ts')).slice(1, -1).replace(/\\\\/g, '/')}'

const OUT = ${JSON.stringify(outDir)}

const profile = {
  fullName: 'Mustermann, Max',
  address: 'Musterstraße 12, 53111 Bonn',
  specialization: 'Anwendungsentwicklung',
  bookNumber: '1',
  occupation: 'Fachinformatiker/in für Anwendungsentwicklung',
  company: 'Beispiel GmbH',
  trainer: 'Sabine Schmidt',
  department: 'Softwareentwicklung',
  startDate: '2026-09-01',
  durationYears: 3,
}

const days = [
  { date: '2026-03-16', kind: 'company', text: 'Einführung in das Ticketsystem. Zwei Fehlerberichte nachgestellt und dokumentiert.', hours: 8 },
  { date: '2026-03-17', kind: 'company', text: 'Formular zur Kundenerfassung in React umgesetzt, Validierung ergänzt.', hours: 8 },
  { date: '2026-03-18', kind: 'school', text: 'Lernfeld 3: relationale Datenmodelle, Normalformen bis 3NF.', hours: 8 },
  { date: '2026-03-19', kind: 'company', text: 'Code-Review mit dem Team. Änderungen aus dem Review eingearbeitet.', hours: 7.5 },
  { date: '2026-03-20', kind: 'sick', text: '', hours: 0 },
]

const daily = {
  id: '2026-KW12', isoYear: 2026, isoWeek: 12,
  startDate: '2026-03-16', endDate: '2026-03-22', trainingYear: 1,
  company: '', companyHours: 0, school: '', schoolHours: 0,
  instruction: '', instructionHours: 0,
  days, notes: '', status: 'draft', createdAt: '', updatedAt: '',
}

const weekly = {
  ...daily,
  id: '2026-KW13', isoWeek: 13, startDate: '2026-03-23', endDate: '2026-03-29',
  days: [],
  company: 'Die Kundenverwaltung um eine Suchfunktion erweitert.\\nDie Ergebnisse werden serverseitig gefiltert und seitenweise geladen.',
  companyHours: 24,
  school: 'Lernfeld 3: Datenbanken, Normalisierung und Fremdschlüssel.',
  schoolHours: 8,
  instruction: 'Unterweisung Arbeitssicherheit am Bildschirmarbeitsplatz.',
  instructionHours: 1.5,
}

// Türkische Sonderzeichen prüfen — sie scheitern bei PDF-Bibliotheken ohne
// eingebettete Schrift, mit Chromium jedoch nicht.
const turkish = {
  ...daily,
  id: '2026-KW14', isoWeek: 14, startDate: '2026-03-30', endDate: '2026-04-05',
  days: days.map((d) => ({ ...d, text: d.text ? 'Müşteri kayıt formunu React ile yazdım, doğrulama ekledim. ÇĞİÖŞÜ çğıöşü' : '' })),
}

// Ohne diesen Handler beendet Electron sich, sobald das erste Renderfenster
// geschlossen wird — dann entstuende nur ein einziges PDF.
app.on('window-all-closed', () => {})

// Zusaetzlich ein PNG je Fall, damit man das Layout ohne PDF-Betrachter sieht.
async function snapshot(html, target) {
  const tmp = join(tmpdir(), 'bh-shot-' + randomUUID() + '.html')
  writeFileSync(tmp, html, 'utf-8')
  const win = new BrowserWindow({ show: false, width: 794, height: 1123,
    webPreferences: { javascript: false, sandbox: true } })
  try {
    await win.loadFile(tmp)
    const image = await win.webContents.capturePage()
    writeFileSync(target, image.toPNG())
  } finally {
    win.destroy()
  }
}

app.whenReady().then(async () => {
  const cases = [
    ['classic-daily', [daily], 'classic', 'de'],
    ['classic-weekly', [weekly], 'classic', 'de'],
    ['modern-daily', [daily], 'modern', 'de'],
    ['modern-weekly', [weekly], 'modern', 'de'],
    ['classic-turkish', [turkish], 'classic', 'tr'],
    ['modern-multi', [daily, weekly], 'modern', 'en'],
    ['cover-classic', [daily], 'classic', 'de', true],
    ['cover-modern', [weekly], 'modern', 'de', true],
  ]

  const log = []
  for (const [name, entries, layout, lang, cover] of cases) {
    try {
      const html = buildReportHtml(entries, profile, layout, lang, Boolean(cover))
      await renderPdfToFile(html, join(OUT, name + '.pdf'))
      await snapshot(html, join(OUT, name + '.png'))
      log.push('OK   ' + name)
    } catch (error) {
      log.push('FEHLER ' + name + ': ' + (error && error.message ? error.message : String(error)))
    }
  }
  writeFileSync(join(OUT, 'report.txt'), log.join('\\n'), 'utf-8')
  app.quit()
})
`

const harnessPath = join(workDir, 'harness.ts')
writeFileSync(harnessPath, harness, 'utf-8')

const bundlePath = join(workDir, 'harness.cjs')
await build({
  entryPoints: [harnessPath],
  outfile: bundlePath,
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node20',
  external: ['electron'],
  logLevel: 'warning',
})

const child = spawn(electron, [bundlePath], { stdio: 'inherit' })
child.on('exit', (code) => {
  console.log(code === 0 ? `\nFertig — PDFs liegen in ${outDir}` : `\nAbgebrochen (Code ${code})`)
  process.exit(code ?? 1)
})
