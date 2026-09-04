/**
 * Belastungstest für die Sicherungen.
 *
 * Die Frage dahinter ist nicht „funktioniert es“, sondern „was liegt nach
 * einem Jahr Benutzung auf der Platte“. Geprüft werden deshalb vor allem
 * Menge und Größe: viele Programmstarts, Starts ohne jede Änderung, eine
 * unlesbare Sicherung und ein Datenbestand über die volle Ausbildungszeit.
 *
 *   npm run backup:check
 */
import { spawn } from 'node:child_process'
import { mkdirSync, rmSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { tmpdir } from 'node:os'
import { build } from 'esbuild'
import electron from 'electron'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const workDir = join(root, 'node_modules', '.backup-check')
const sandbox = join(tmpdir(), `berichtsheft-backup-${Date.now()}`)
const resultFile = join(workDir, 'result.json')

rmSync(workDir, { recursive: true, force: true })
mkdirSync(workDir, { recursive: true })

const posix = (p) => p.replace(/\\/g, '/')

const harness = `
import { app } from 'electron'
import { writeFileSync, readdirSync, statSync, existsSync, appendFileSync } from 'node:fs'
import { join } from 'node:path'

app.setPath('userData', ${JSON.stringify(sandbox)})

import * as db from '${posix(join(root, 'electron', 'db.ts'))}'

const backupDir = join(${JSON.stringify(sandbox)}, 'backups')
const results = []

function check(name, fn) {
  try {
    fn()
    results.push({ name, ok: true })
  } catch (error) {
    results.push({ name, ok: false, error: error && error.message ? error.message : String(error) })
  }
}
function assert(condition, message) {
  if (!condition) throw new Error(message)
}
function equal(actual, expected, message) {
  if (actual !== expected) throw new Error(message + ': erwartet ' + expected + ', war ' + actual)
}

const dateien = () => readdirSync(backupDir)
const sicherungen = () => dateien().filter((f) => f.endsWith('.db'))
const groesse = () =>
  dateien().reduce((sum, f) => sum + statSync(join(backupDir, f)).size, 0)

/*
 * Der Zeitstempel steckt im Dateinamen und ist auf die Sekunde genau. Zwei
 * Sicherungen in derselben Sekunde träfen denselben Namen — im Alltag
 * unmöglich, im Test aber die Regel. Darum wird hier gewartet.
 */
function warte(ms) {
  const bis = Date.now() + ms
  while (Date.now() < bis) {
    /* absichtlich blockierend, der Test läuft ohnehin allein */
  }
}

function woche(nr, text) {
  const jahr = 2026
  return {
    id: jahr + '-KW' + String(nr).padStart(2, '0'),
    isoYear: jahr,
    isoWeek: nr,
    mode: 'weekly',
    startDate: '2026-03-16',
    endDate: '2026-03-22',
    trainingYear: 1,
    company: text,
    school: '',
    instruction: '',
    days: [],
    notes: '',
    status: 'draft',
    createdAt: '',
    updatedAt: '',
  }
}

async function run() {
  db.initDatabase()

  /* ------------------------------------------------ Menge der Sicherungen -- */

  check('Ein Start ohne Änderung legt keine zweite Sicherung an', () => {
    db.saveEntry(woche(1, 'erste Woche'))
    db.rotateBackup()
    const nach1 = sicherungen().length
    assert(nach1 >= 1, 'Nach der ersten Änderung fehlt die Sicherung')

    // Zwanzig Programmstarts, bei denen niemand etwas eingetragen hat. Ohne
    // Wartezeit: die Entscheidung darf nicht am Sekundenbruchteil haengen.
    for (let i = 0; i < 20; i++) db.rotateBackup()
    equal(sicherungen().length, nach1, 'Starts ohne Änderung haben gesichert')

    // Und dasselbe noch einmal mit Abstand dazwischen.
    for (let i = 0; i < 3; i++) {
      warte(1100)
      db.rotateBackup()
    }
    equal(sicherungen().length, nach1, 'Starts mit Abstand haben gesichert')
  })

  check('Bei ständiger Änderung bleiben es höchstens zehn Sicherungen', () => {
    for (let i = 2; i <= 25; i++) {
      db.saveEntry(woche(i, 'Woche ' + i))
      warte(1100)
      db.rotateBackup()
    }
    equal(sicherungen().length, 10, 'Anzahl der Sicherungen')
  })

  check('Im Sicherungsordner liegt nichts außer den Sicherungen selbst', () => {
    db.listBackups()
    const fremd = dateien().filter((f) => !f.endsWith('.db'))
    assert(fremd.length === 0, 'Fremde Dateien im Ordner: ' + fremd.join(', '))
  })

  check('Eine unlesbare Sicherung lässt sich weiterhin aufräumen', () => {
    const kaputt = join(backupDir, 'berichtsheft-1999-01-01T00-00-00-000Z.db')
    writeFileSync(kaputt, 'das ist keine Datenbank')
    const liste = db.listBackups()
    assert(liste.length === 11, 'Die kaputte Sicherung fehlt in der Liste')

    // listBackups öffnet jede Datei. Bleibt dabei ein Zugriff offen, lässt
    // sich die Datei unter Windows nicht mehr löschen und der Ordner wächst.
    db.saveEntry(woche(90, 'Nachtrag'))
    warte(1100)
    db.rotateBackup()
    equal(sicherungen().length, 10, 'Nach dem Aufräumen')
    assert(!existsSync(kaputt), 'Die kaputte Sicherung liegt noch da')
  })

  check('Reste älterer Fassungen werden aufgeräumt', () => {
    /*
     * So sieht ein Profil aus, das mit 1.1.0 gelaufen ist: neben den
     * Sicherungen liegen -wal- und -shm-Dateien, teils zu Sicherungen, die
     * längst wegrotiert sind. Gezählt wurden sie nie, gelöscht auch nicht.
     */
    const lebend = sicherungen()[0]
    writeFileSync(join(backupDir, lebend + '-shm'), Buffer.alloc(32768))
    writeFileSync(join(backupDir, lebend + '-wal'), Buffer.alloc(0))
    writeFileSync(join(backupDir, 'berichtsheft-2020-01-01T00-00-00-000Z.db-shm'), Buffer.alloc(32768))
    writeFileSync(join(backupDir, 'berichtsheft-2020-01-01T00-00-00-000Z.db-wal'), Buffer.alloc(0))

    const vorher = sicherungen().length
    db.listBackups()

    const reste = dateien().filter((f) => !f.endsWith('.db'))
    assert(reste.length === 0, 'Reste geblieben: ' + reste.join(', '))
    equal(sicherungen().length, vorher, 'Eine Sicherung ist dabei verschwunden')
  })

  /* ---------------------------------------------------- Platz auf der Platte -- */

  check('Eine volle Ausbildung bleibt weit unter hundert Megabyte', () => {
    // Drei Jahre, jede Woche gefüllt, mit realistisch langen Texten.
    const text = 'Kundenformular in React umgesetzt und die Pflichtfelder geprüft. '.repeat(12)
    for (let jahr = 2024; jahr <= 2026; jahr++) {
      for (let kw = 1; kw <= 52; kw++) {
        db.saveEntry({
          ...woche(kw, text),
          id: jahr + '-KW' + String(kw).padStart(2, '0'),
          isoYear: jahr,
          school: text,
          instruction: text,
        })
      }
    }
    warte(1100)
    db.rotateBackup()

    const db_datei = statSync(join(${JSON.stringify(sandbox)}, 'data', 'berichtsheft.db')).size
    const gesamt = groesse() + db_datei
    const mb = gesamt / (1024 * 1024)
    results.push({ name: '   Platzbedarf: ' + mb.toFixed(1) + ' MB bei 156 Wochen', ok: true })
    assert(mb < 100, 'Zu viel Platz: ' + mb.toFixed(1) + ' MB')
  })

  check('Die Sicherung enthält wirklich den letzten Stand', () => {
    db.saveEntry(woche(51, 'ganz frisch eingetragen'))
    warte(1100)
    db.rotateBackup()
    const neueste = db.listBackups()[0]
    assert(neueste, 'Keine Sicherung vorhanden')
    const zurueck = db.restoreBackup(neueste.file)
    const gefunden = zurueck.entries.find((e) => e.id === '2026-KW51')
    assert(gefunden, 'Die zuletzt gespeicherte Woche fehlt in der Sicherung')
    equal(gefunden.company, 'ganz frisch eingetragen', 'Inhalt der Woche')
  })

  check('Zurückspielen sichert vorher den aktuellen Stand', () => {
    const vorher = sicherungen().length
    const neueste = db.listBackups()[0]
    db.restoreBackup(neueste.file)
    assert(sicherungen().length >= Math.min(10, vorher), 'Sicherungen verschwunden')
    equal(sicherungen().length <= 10, true, 'Mehr als zehn Sicherungen')
  })

  writeFileSync(${JSON.stringify(posix(resultFile))}, JSON.stringify(results, null, 2))
  app.exit(0)
}

app.on('window-all-closed', () => {})
app.whenReady().then(run).catch((error) => {
  writeFileSync(
    ${JSON.stringify(posix(resultFile))},
    JSON.stringify([{ name: 'Testlauf', ok: false, error: String(error && error.stack) }], null, 2),
  )
  app.exit(1)
})
`

const entry = join(workDir, 'harness.ts')
const { writeFileSync, readFileSync } = await import('node:fs')
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

const child = spawn(electron, [join(workDir, 'harness.cjs')], {
  stdio: 'inherit',
  env: { ...process.env, ELECTRON_DISABLE_SECURITY_WARNINGS: '1' },
})

child.on('exit', () => {
  let results
  try {
    results = JSON.parse(readFileSync(resultFile, 'utf8'))
  } catch {
    console.error('\nKein Ergebnis — der Testlauf ist abgestürzt.')
    process.exit(1)
  }

  let ok = 0
  for (const r of results) {
    if (r.name.startsWith('   ')) {
      console.log(r.name)
      continue
    }
    if (r.ok) {
      ok++
      console.log('OK      ' + r.name)
    } else {
      console.log('FEHLER  ' + r.name + ' — ' + r.error)
    }
  }
  const gesamt = results.filter((r) => !r.name.startsWith('   ')).length
  console.log(`\n${ok}/${gesamt} bestanden`)
  rmSync(sandbox, { recursive: true, force: true })
  process.exit(ok === gesamt ? 0 : 1)
})
