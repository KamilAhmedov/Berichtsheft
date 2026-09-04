/**
 * Nimmt Bildschirmfotos der gebauten Oberfläche auf, ohne die App zu bedienen.
 * Statt der echten Brücke bekommt der Renderer eine mit Beispieldaten.
 *
 *   npm run build && node scripts/ui-shot.mjs [Zielordner]
 *
 * Gedacht zum Prüfen von Layouts — die Bilder für die README entstehen von Hand.
 */
import { spawn } from 'node:child_process'
import { mkdirSync, writeFileSync, existsSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import electron from 'electron'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const outDir = resolve(process.argv[2] ?? join(root, 'release', 'ui-shot'))
const workDir = join(root, 'node_modules', '.ui-shot')
const renderer = join(root, 'out', 'renderer', 'index.html')

if (!existsSync(renderer)) {
  console.error('Erst bauen: npm run build')
  process.exit(1)
}

mkdirSync(outDir, { recursive: true })
mkdirSync(workDir, { recursive: true })

const posix = (p) => p.replace(/\\/g, '/')

/* ------------------------------------------------------------ Beispieldaten */

const preload = `
const { contextBridge } = require('electron')

const profile = {
  fullName: 'Mustermann, Max',
  occupation: 'Fachinformatiker/in für Anwendungsentwicklung',
  company: 'Beispiel GmbH',
  trainer: 'Sabine Schmidt',
  department: 'Softwareentwicklung',
  startDate: '2026-03-02',
  durationYears: 3,
}

const TEXTS = [
  'Einführung in das Ticketsystem. Zwei gemeldete Fehler nachgestellt und dokumentiert.',
  'Formular zur Kundenerfassung in React umgesetzt, Validierung der Pflichtfelder ergänzt.',
  'Lernfeld 3: relationale Datenmodelle, Normalisierung bis zur dritten Normalform.',
  'Code-Review mit dem Team. Anmerkungen eingearbeitet und erneut eingereicht.',
  'Suchfunktion der Kundenliste um eine serverseitige Filterung erweitert.',
]

// Zwanzig Wochen ab Anfang März, damit Verlauf und Verteilung etwas hergeben.
const entries = []
const statuses = ['signed', 'signed', 'submitted', 'draft']
for (let w = 0; w < 20; w++) {
  const monday = new Date(2026, 2, 2 + w * 7)
  const iso = (d) =>
    d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0')
  const days = Array.from({ length: 5 }, (_, i) => {
    const date = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + i)
    let kind = 'company'
    if (i === 2) kind = 'school'
    if (w === 6 && i > 2) kind = 'vacation'
    if (w === 11 && i === 3) kind = 'sick'
    if (w === 15 && i === 0) kind = 'holiday'
    const off = kind !== 'company' && kind !== 'school'
    return {
      date: iso(date),
      kind,
      text: off ? '' : TEXTS[(w + i) % TEXTS.length],
      hours: off ? 0 : i === 3 ? 7.5 : 8,
    }
  })
  const sunday = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + 6)
  entries.push({
    id: '2026-KW' + String(10 + w).padStart(2, '0'),
    isoYear: 2026,
    isoWeek: 10 + w,
    startDate: iso(monday),
    endDate: iso(sunday),
    trainingYear: 1,
    mode: 'daily',
    company: '',
    school: '',
    instruction: '',
    days,
    notes: '',
    status: statuses[w % statuses.length],
    createdAt: iso(monday),
    updatedAt: iso(monday),
  })
}

const snapshot = {
  profile,
  settings: {
    language: 'de',
    theme: ${JSON.stringify(process.env.SHOT_THEME ?? 'light')},
    pdfLayout: 'classic',
    entryMode: 'daily',
    lastBackupAt: new Date().toISOString(),
    backupReminderDays: 14,
  },
  entries,
  templates: [
    { id: 't1', title: 'Daily', field: 'company', text: 'Teilnahme am täglichen Stand-up.' },
    { id: 't2', title: 'Code-Review', field: 'company', text: 'Pull Requests der Kollegen geprüft.' },
    { id: 't3', title: 'Lernfeld', field: 'school', text: 'Aufgaben im Unterricht bearbeitet.' },
  ],
}

const noop = async () => undefined
contextBridge.exposeInMainWorld('api', {
  load: async () => snapshot,
  saveEntry: async (e) => e,
  deleteEntry: noop,
  saveProfile: async (p) => p,
  saveSettings: async (s) => s,
  saveTemplate: async (t) => t,
  deleteTemplate: noop,
  exportBackup: async () => null,
  importBackup: async () => null,
  exportPdf: async () => null,
  storageInfo: async () => ({
    dataDir: 'C:\\\\Users\\\\Beispiel\\\\AppData\\\\Roaming\\\\Berichtsheft',
    dbPath: '',
    dbSizeBytes: 32768,
    backupCount: 4,
    appVersion: '1.0.0',
  }),
  listBackups: async () =>
    [0, 1, 2, 3].map((i) => ({
      file: 'berichtsheft-' + i + '.db',
      createdAt: new Date(Date.now() - i * 86400000).toISOString(),
      sizeBytes: 32768,
      entryCount: 20 - i,
    })),
  restoreBackup: async () => snapshot,
  setSpellCheckLanguage: noop,
  openDataDir: noop,
  showItemInFolder: noop,
  setNativeTheme: noop,
  platform: 'win32',
})
`

const preloadPath = join(workDir, 'preload.cjs')
writeFileSync(preloadPath, preload, 'utf-8')

/* ----------------------------------------------------------------- Aufnahme */

const main = `
const { app, BrowserWindow, nativeTheme } = require('electron')
const { writeFileSync } = require('node:fs')
const { join } = require('node:path')

const OUT = ${JSON.stringify(outDir)}
const DARK = ${JSON.stringify(process.env.SHOT_THEME === 'dark')}

app.on('window-all-closed', () => {})

app.whenReady().then(async () => {
  nativeTheme.themeSource = DARK ? 'dark' : 'light'

  const win = new BrowserWindow({
    show: false,
    width: 1280,
    height: 860,
    webPreferences: { preload: ${JSON.stringify(posix(preloadPath))}, sandbox: false },
  })

  await win.loadFile(${JSON.stringify(posix(renderer))})
  await new Promise((r) => setTimeout(r, 2500))

  const views = ['Übersicht', 'Wochen', 'Textbausteine', 'Profil', 'Einstellungen']
  const log = []

  for (const label of views) {
    // Bewusst ohne verschachtelte Vorlagen — die brechen beim Erzeugen dieser Datei.
    const script =
      "(() => { const nav = [...document.querySelectorAll('nav button')];" +
      " const target = nav.find((b) => b.textContent.trim() === " + JSON.stringify(label) + ");" +
      " if (!target) return false; target.click(); return true; })()"
    const clicked = await win.webContents.executeJavaScript(script)
    if (!clicked) {
      log.push('NICHT GEFUNDEN: ' + label)
      continue
    }
    await new Promise((r) => setTimeout(r, 900))
    const image = await win.webContents.capturePage()
    const name = label.toLowerCase().replace(/[^a-z]/g, '') + (DARK ? '-dunkel' : '') + '.png'
    writeFileSync(join(OUT, name), image.toPNG())
    log.push('OK ' + name)
  }

  // Woche anlegen: der Dialog fragt nach einem Datum, nicht nach einer KW.
  const onWeeks = await win.webContents.executeJavaScript(
    "(() => { const b = [...document.querySelectorAll('nav button')]" +
      ".find((x) => x.textContent.trim() === 'Wochen');" +
      " if (!b) return false; b.click(); return true; })()",
  )
  if (onWeeks) {
    await new Promise((r) => setTimeout(r, 800))
    const opened = await win.webContents.executeJavaScript(
      "(() => { const b = [...document.querySelectorAll('button')]" +
        ".find((x) => x.textContent.trim() === 'Neue Woche');" +
        " if (!b) return false; b.click(); return true; })()",
    )
    if (opened) {
      await new Promise((r) => setTimeout(r, 2500))
      const shot = await win.webContents.capturePage()
      writeFileSync(join(OUT, 'neue-woche' + (DARK ? '-dunkel' : '') + '.png'), shot.toPNG())
      log.push('OK neue-woche.png')
      await win.webContents.executeJavaScript(
        "(() => { const b = [...document.querySelectorAll('button')]" +
          ".find((x) => x.textContent.trim() === 'Abbrechen');" +
          " if (b) b.click(); return true; })()",
      )
      await new Promise((r) => setTimeout(r, 600))
    } else {
      log.push('NICHT GEFUNDEN: Neue Woche')
    }

    // Einen vorhandenen Bericht oeffnen.
    const openedWeek = await win.webContents.executeJavaScript(
      "(() => { const b = document.querySelector('main button.w-full');" +
        " if (!b) return false; b.click(); return true; })()",
    )
    if (openedWeek) {
      await new Promise((r) => setTimeout(r, 2500))
      const shot = await win.webContents.capturePage()
      writeFileSync(join(OUT, 'bericht' + (DARK ? '-dunkel' : '') + '.png'), shot.toPNG())
      log.push('OK bericht.png')
      await win.webContents.executeJavaScript(
        "(() => { const b = [...document.querySelectorAll('button')]" +
          ".find((x) => x.textContent.trim() === 'Abbrechen');" +
          " if (b) b.click(); return true; })()",
      )
      await new Promise((r) => setTimeout(r, 600))
    } else {
      log.push('NICHT GEFUNDEN: Wochenkarte')
    }
  }

  await win.webContents.executeJavaScript(
    "(() => { const b = [...document.querySelectorAll('nav button')]" +
      ".find((x) => x.textContent.trim() === 'Einstellungen');" +
      " if (b) b.click(); return true; })()",
  )
  await new Promise((r) => setTimeout(r, 900))

  // Zusaetzlich der Dialog mit den Sicherungen — nur ueber einen Knopf erreichbar.
  const opened = await win.webContents.executeJavaScript(
    "(() => { const b = [...document.querySelectorAll('button')]" +
      ".find((x) => x.textContent.trim() === 'Sicherungen anzeigen');" +
      " if (!b) return false; b.click(); return true; })()",
  )
  if (opened) {
    await new Promise((r) => setTimeout(r, 2500))
    const shot = await win.webContents.capturePage()
    writeFileSync(join(OUT, 'sicherungen' + (DARK ? '-dunkel' : '') + '.png'), shot.toPNG())
    log.push('OK sicherungen.png')
  } else {
    log.push('NICHT GEFUNDEN: Sicherungen anzeigen')
  }

  writeFileSync(join(OUT, 'report.txt'), log.join('\\n'), 'utf-8')
  app.quit()
})
`

const mainPath = join(workDir, 'main.cjs')
writeFileSync(mainPath, main, 'utf-8')

const child = spawn(electron, [mainPath], { stdio: 'inherit', env: process.env })
child.on('exit', (code) => {
  console.log(code === 0 ? `Fertig — Bilder in ${outDir}` : `Abgebrochen (Code ${code})`)
  process.exit(code ?? 1)
})
