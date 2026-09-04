/**
 * Misst, was die App im Betrieb kostet: Arbeitsspeicher je Prozess, Startzeit
 * und ob sich beim Blättern durch die Wochen etwas anstaut.
 *
 * Läuft gegen ein Wegwerf-Profil, die eigenen Daten bleiben unberührt.
 *
 *   npm run perf:check
 */
import { spawn } from 'node:child_process'
import { mkdirSync, rmSync, writeFileSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { tmpdir } from 'node:os'
import { build } from 'esbuild'
import electron from 'electron'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const workDir = join(root, 'node_modules', '.perf-check')
const sandbox = join(tmpdir(), `berichtsheft-perf-${Date.now()}`)
const resultFile = join(workDir, 'result.json')

rmSync(workDir, { recursive: true, force: true })
mkdirSync(workDir, { recursive: true })

const posix = (p) => p.replace(/\\/g, '/')

const harness = `
import { app, BrowserWindow, ipcMain } from 'electron'
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'

app.setPath('userData', ${JSON.stringify(sandbox)})
const gestartet = Date.now()

import * as db from '${posix(join(root, 'electron', 'db.ts'))}'

const zeilen = []
const mb = (bytes) => Math.round((bytes / (1024 * 1024)) * 10) / 10

function woche(jahr, kw) {
  const text =
    'Kundenformular in React umgesetzt, Pflichtfelder geprueft und die Fehlermeldungen ueberarbeitet. '.repeat(4)
  return {
    id: jahr + '-KW' + String(kw).padStart(2, '0'),
    isoYear: jahr,
    isoWeek: kw,
    mode: kw % 2 ? 'daily' : 'weekly',
    startDate: '2026-03-16',
    endDate: '2026-03-22',
    trainingYear: ((jahr - 2024) % 3) + 1,
    company: text,
    school: text,
    instruction: text,
    days: [0, 1, 2, 3, 4].map((i) => ({
      date: '2026-03-1' + (6 + i),
      kind: i === 2 ? 'school' : 'company',
      text,
      hours: 8,
    })),
    notes: '',
    status: 'draft',
    createdAt: '',
    updatedAt: '',
  }
}

async function run() {
  db.initDatabase()

  // Eine volle Ausbildung: drei Jahre, jede Woche gefuellt.
  const t0 = Date.now()
  for (let jahr = 2024; jahr <= 2026; jahr++) {
    for (let kw = 1; kw <= 52; kw++) db.saveEntry(woche(jahr, kw))
  }
  zeilen.push('156 Wochen anlegen: ' + (Date.now() - t0) + ' ms')

  const t1 = Date.now()
  const alle = db.listEntries()
  zeilen.push('Alle Wochen lesen (' + alle.length + '): ' + (Date.now() - t1) + ' ms')

  const t2 = Date.now()
  for (let i = 0; i < 50; i++) db.snapshot()
  zeilen.push('50 vollstaendige Ladevorgaenge: ' + (Date.now() - t2) + ' ms')

  /*
   * Nur die Kanäle, welche die Oberfläche beim Start braucht. Die übrigen
   * liegen in main.ts hinter registerIpc und werden hier nicht gebraucht.
   */
  const antwort = (fn) => async (_e, ...args) => {
    try {
      return { ok: true, data: await fn(...args) }
    } catch (error) {
      return { ok: false, error: String(error && error.message) }
    }
  }
  ipcMain.handle('data:load', antwort(() => db.snapshot()))
  ipcMain.handle('theme:set', antwort(() => undefined))
  ipcMain.handle('storage:info', antwort(() => db.storageInfo()))
  ipcMain.handle('settings:save', antwort((patch) => db.setSettings({ ...db.getSettings(), ...patch })))

  const win = new BrowserWindow({
    width: 1180,
    height: 780,
    show: false,
    webPreferences: {
      preload: join('${posix(root)}', 'out', 'preload', 'index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  })
  await win.loadFile(join('${posix(root)}', 'out', 'renderer', 'index.html'))
  zeilen.push('Start bis Oberflaeche geladen: ' + (Date.now() - gestartet) + ' ms')

  await new Promise((r) => setTimeout(r, 2500))

  const messen = async (was) => {
    const speicher = await win.webContents.mainFrame.executeJavaScript(
      'performance.memory ? performance.memory.usedJSHeapSize : 0',
    )
    zeilen.push(was + ': JS-Heap ' + mb(speicher) + ' MB')
    return speicher
  }

  const vorher = await messen('Nach dem Start')

  // Durch alle Wochen blaettern — dabei darf sich nichts anstauen.
  await win.webContents.mainFrame.executeJavaScript(
    '(async () => { for (let i = 0; i < 200; i++) { await window.api.load() } })()',
  )
  await new Promise((r) => setTimeout(r, 2000))
  const nachher = await messen('Nach 200 Ladevorgaengen')

  zeilen.push('Zuwachs: ' + mb(nachher - vorher) + ' MB')

  for (const m of app.getAppMetrics()) {
    zeilen.push(
      'Prozess ' + m.type + ': ' + mb((m.memory.workingSetSize || 0) * 1024) + ' MB',
    )
  }

  writeFileSync(${JSON.stringify(posix(resultFile))}, JSON.stringify(zeilen, null, 2))
  app.exit(0)
}

app.on('window-all-closed', () => {})
app.whenReady().then(run).catch((error) => {
  writeFileSync(
    ${JSON.stringify(posix(resultFile))},
    JSON.stringify(['ABGEBROCHEN: ' + String(error && error.stack)], null, 2),
  )
  app.exit(1)
})
`

const entry = join(workDir, 'harness.ts')
writeFileSync(entry, harness)

await build({
  entryPoints: [entry],
  outfile: join(workDir, 'harness.cjs'),
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node20',
  external: ['electron', 'better-sqlite3'],
})

spawn(electron, [join(workDir, 'harness.cjs'), '--js-flags=--expose-gc'], {
  stdio: 'inherit',
}).on('exit', () => {
  try {
    for (const zeile of JSON.parse(readFileSync(resultFile, 'utf8'))) console.log('  ' + zeile)
  } catch {
    console.error('Kein Ergebnis — der Messlauf ist abgestürzt.')
    process.exit(1)
  }
  rmSync(sandbox, { recursive: true, force: true })
})
