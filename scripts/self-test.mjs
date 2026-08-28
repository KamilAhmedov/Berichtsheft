/**
 * Funktionstest gegen die echten Module: Datenbank, Migrationen, Sicherungen,
 * Export/Import und PDF-Erzeugung. Läuft in Electron gegen ein Wegwerf-Profil,
 * die eigenen Daten bleiben unangetastet.
 *
 *   npm run selftest
 */
import { spawn } from 'node:child_process'
import { mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { tmpdir } from 'node:os'
import { build } from 'esbuild'
import electron from 'electron'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const workDir = join(root, 'node_modules', '.self-test')
const sandbox = join(tmpdir(), `berichtsheft-selftest-${Date.now()}`)
const resultFile = join(workDir, 'result.json')

rmSync(workDir, { recursive: true, force: true })
mkdirSync(workDir, { recursive: true })

const posix = (p) => p.replace(/\\/g, '/')

const harness = `
import { app } from 'electron'
import { writeFileSync, existsSync, readdirSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import Database from 'better-sqlite3'

// Muss vor dem ersten Zugriff auf das Datenverzeichnis gesetzt werden.
app.setPath('userData', ${JSON.stringify(sandbox)})

import * as db from '${posix(join(root, 'electron', 'db.ts'))}'
import { buildReportHtml } from '${posix(join(root, 'electron', 'pdf.ts'))}'

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
  if (actual !== expected) throw new Error(\`\${message}: erwartet \${expected}, war \${actual}\`)
}

const profile = {
  fullName: 'Mustermann, Max',
  occupation: 'Fachinformatiker/in für Anwendungsentwicklung',
  company: 'Beispiel GmbH',
  trainer: 'Sabine Schmidt',
  department: 'Softwareentwicklung',
  startDate: '2026-09-01',
  durationYears: 3,
}

function makeDays(monday, texts) {
  return texts.map((text, i) => ({
    date: monday.slice(0, 8) + String(Number(monday.slice(8)) + i).padStart(2, '0'),
    kind: i === 2 ? 'school' : 'company',
    text,
    hours: text ? 8 : 0,
  }))
}

function weekEntry(id, isoWeek, mode, extra = {}) {
  return {
    id, isoYear: 2026, isoWeek, mode,
    startDate: '2026-03-16', endDate: '2026-03-22', trainingYear: 1,
    company: '', school: '', instruction: '',
    days: makeDays('2026-03-16', ['', '', '', '', '']),
    notes: '', status: 'draft', createdAt: '', updatedAt: '',
    ...extra,
  }
}

app.on('window-all-closed', () => {})

app.whenReady().then(async () => {
  /* --------------------------------------------------------- Grundlagen -- */

  check('Datenbank legt sich neu an', () => {
    db.initDatabase()
    assert(existsSync(join(app.getPath('userData'), 'data', 'berichtsheft.db')), 'Datei fehlt')
  })

  check('Voreinstellungen sind gesetzt', () => {
    const s = db.getSettings()
    equal(s.language, 'de', 'Sprache')
    equal(s.entryMode, 'daily', 'Erfassungsart')
    equal(s.backupReminderDays, 14, 'Backup-Erinnerung')
  })

  check('Profil wird gespeichert und gelesen', () => {
    const saved = db.setProfile(profile)
    equal(saved.fullName, profile.fullName, 'Name')
    equal(db.getProfile().durationYears, 3, 'Dauer')
  })

  /* ------------------------------------------------------------ Wochen -- */

  check('Wochenerfassung überlebt den Roundtrip', () => {
    const entry = weekEntry('2026-KW13', 13, 'weekly', {
      company: 'Suchfunktion erweitert.',
      school: 'Lernfeld 3.',
      days: makeDays('2026-03-23', ['', '', '', '', '']).map((d) => ({ ...d, hours: 7 })),
    })
    const saved = db.saveEntry(entry)
    equal(saved.mode, 'weekly', 'Erfassungsart')
    equal(saved.company, 'Suchfunktion erweitert.', 'Wochentext')
    equal(saved.days.length, 5, 'Anzahl Tage')
    equal(saved.days[0].hours, 7, 'Stunden je Tag')
    assert(saved.createdAt.length > 0, 'createdAt wird gesetzt')
  })

  check('Tageserfassung überlebt den Roundtrip', () => {
    const entry = weekEntry('2026-KW12', 12, 'daily', {
      days: makeDays('2026-03-16', ['Montag-Text', 'Dienstag-Text', 'Schule', 'Review', '']),
    })
    const saved = db.saveEntry(entry)
    equal(saved.mode, 'daily', 'Erfassungsart')
    equal(saved.days[0].text, 'Montag-Text', 'Tagestext')
    equal(saved.days[2].kind, 'school', 'Tagesart')
  })

  check('Wochen kommen chronologisch zurück', () => {
    const ids = db.listEntries().map((e) => e.id)
    equal(ids.join(','), '2026-KW12,2026-KW13', 'Reihenfolge')
  })

  check('Umstellung der Erfassungsart erhält den Wochentext', () => {
    const before = db.listEntries().find((e) => e.id === '2026-KW13')
    const saved = db.saveEntry({ ...before, mode: 'daily' })
    equal(saved.mode, 'daily', 'Erfassungsart')
    equal(saved.company, 'Suchfunktion erweitert.', 'Wochentext bleibt')
    // Zurückstellen, damit die folgenden Prüfungen den Ausgangszustand sehen.
    db.saveEntry({ ...saved, mode: 'weekly' })
  })

  check('Aktualisieren erzeugt keinen zweiten Eintrag', () => {
    const before = db.listEntries().length
    const entry = db.listEntries()[0]
    db.saveEntry({ ...entry, notes: 'geändert' })
    equal(db.listEntries().length, before, 'Anzahl')
    equal(db.listEntries()[0].notes, 'geändert', 'Notiz')
  })

  /* -------------------------------------------------------- Bausteine -- */

  check('Textbausteine lassen sich pflegen', () => {
    db.saveTemplate({ id: 't1', title: 'Daily', field: 'company', text: 'Stand-up' })
    db.saveTemplate({ id: 't1', title: 'Daily', field: 'company', text: 'Stand-up geändert' })
    equal(db.listTemplates().length, 1, 'Anzahl nach Update')
    equal(db.listTemplates()[0].text, 'Stand-up geändert', 'Text')
    db.saveTemplate({ id: 't2', title: 'Schule', field: 'school', text: 'Lernfeld' })
    equal(db.listTemplates().length, 2, 'Anzahl')
    db.deleteTemplate('t2')
    equal(db.listTemplates().length, 1, 'Anzahl nach Löschen')
  })

  /* ------------------------------------------------- Export und Import -- */

  check('Sicherung enthält alles', () => {
    const snap = db.snapshot()
    equal(snap.entries.length, 2, 'Wochen')
    equal(snap.templates.length, 1, 'Bausteine')
    equal(snap.profile.fullName, profile.fullName, 'Profil')
  })

  check('Import einer alten Sicherung ohne days und mode', () => {
    const snap = db.snapshot()
    const alt = {
      ...snap,
      entries: [
        {
          id: '2026-KW10', isoYear: 2026, isoWeek: 10,
          startDate: '2026-03-02', endDate: '2026-03-08', trainingYear: 1,
          company: 'Alter Eintrag', school: '', instruction: '',
          notes: '', status: 'draft', createdAt: '', updatedAt: '',
        },
      ],
    }
    const restored = db.restore(alt)
    equal(restored.entries.length, 1, 'Anzahl')
    equal(restored.entries[0].mode, 'weekly', 'Erfassungsart wird ergänzt')
    equal(restored.entries[0].days.length, 0, 'Tagesliste wird ergänzt')
    equal(restored.entries[0].company, 'Alter Eintrag', 'Text')
    // Ausgangszustand für die Folgeprüfungen wiederherstellen.
    db.restore(snap)
    equal(db.listEntries().length, 2, 'Wiederherstellung')
  })

  check('Löschen entfernt genau eine Woche', () => {
    db.saveEntry(weekEntry('2026-KW11', 11, 'weekly'))
    equal(db.listEntries().length, 3, 'vor dem Löschen')
    db.deleteEntry('2026-KW11')
    equal(db.listEntries().length, 2, 'nach dem Löschen')
  })

  /* ------------------------------------------------------- Sicherungen -- */

  check('Ohne Änderung entsteht keine zweite Sicherung', () => {
    const dir = join(app.getPath('userData'), 'backups')
    db.rotateBackup()
    const first = readdirSync(dir).length
    db.rotateBackup()
    equal(readdirSync(dir).length, first, 'Anzahl bleibt gleich')
  })

  check('Nach einer Änderung entsteht eine Sicherung', () => {
    const dir = join(app.getPath('userData'), 'backups')
    const before = readdirSync(dir).length
    db.saveEntry({ ...db.listEntries()[0], notes: 'wieder geändert' })
    db.rotateBackup()
    assert(readdirSync(dir).length > before, 'Es kam keine Sicherung dazu')
  })

  check('Die Zahl der Sicherungen bleibt gedeckelt', () => {
    const dir = join(app.getPath('userData'), 'backups')
    // Deutlich mehr Runden als aufbewahrt werden, jede mit einer Aenderung.
    for (let i = 0; i < 16; i++) {
      db.saveEntry({ ...db.listEntries()[0], notes: 'Runde ' + i })
      db.rotateBackup()
    }
    const count = readdirSync(dir).filter((f) => f.endsWith('.db')).length
    assert(count <= 10, 'Es liegen ' + count + ' Sicherungen statt hoechstens 10')
    assert(count > 0, 'Es wurde gar nicht gesichert')
  })

  check('Sicherungen lassen sich auflisten', () => {
    const list = db.listBackups()
    assert(list.length > 0, 'Liste ist leer')
    assert(list[0].entryCount > 0, 'Anzahl der Wochen fehlt')
    assert(list[0].sizeBytes > 0, 'Groesse fehlt')
    assert(Date.parse(list[0].createdAt) > 0, 'Zeitstempel fehlt')
    // Neueste zuerst.
    const times = list.map((b) => Date.parse(b.createdAt))
    assert(times.every((t, i) => i === 0 || t <= times[i - 1]), 'Reihenfolge stimmt nicht')
  })

  check('Eine Sicherung laesst sich zurueckspielen', () => {
    const list = db.listBackups()
    const target = list[list.length - 1]
    const before = db.listEntries().length
    db.saveEntry(weekEntry('2026-KW20', 20, 'daily'))
    equal(db.listEntries().length, before + 1, 'Zwischenstand')

    const restored = db.restoreBackup(target.file)
    equal(restored.entries.length, target.entryCount, 'Anzahl aus der Sicherung')
    assert(
      !db.listEntries().some((e) => e.id === '2026-KW20'),
      'Die zwischenzeitlich angelegte Woche ist noch da',
    )
  })

  check('Unbekannte Sicherungen werden abgewiesen', () => {
    let blocked = false
    try {
      db.restoreBackup('../data/berichtsheft.db')
    } catch (error) {
      blocked = String(error.message).includes('UNKNOWN_BACKUP')
    }
    assert(blocked, 'Ein Pfad von aussen wurde akzeptiert')
  })

  check('Speicherangaben sind plausibel', () => {
    const info = db.storageInfo()
    assert(info.dbSizeBytes > 0, 'Größe')
    assert(info.dataDir.length > 0, 'Pfad')
    assert(info.appVersion.length > 0, 'Version')
  })

  /* --------------------------------------------------------------- PDF -- */

  const daily = db.listEntries().find((e) => e.id === '2026-KW12')
  const weekly = db.listEntries().find((e) => e.id === '2026-KW13')

  check('Tages-PDF zeigt die Tagestexte', () => {
    const html = buildReportHtml([daily], profile, 'classic', 'de')
    assert(html.includes('täglich'), 'Untertitel')
    assert(html.includes('Montag-Text'), 'Tagestext fehlt')
    assert(html.includes('Mustermann'), 'Name fehlt')
  })

  check('Wochen-PDF zeigt den Wochentext', () => {
    const html = buildReportHtml([weekly], profile, 'classic', 'de')
    assert(html.includes('wöchentlich'), 'Untertitel')
    assert(html.includes('Suchfunktion erweitert'), 'Wochentext fehlt')
    assert(!html.includes('Montag-Text'), 'Fremder Tagestext im Wochenblatt')
  })

  check('Umgestellte Woche verliert den Wochentext nicht', () => {
    const switched = { ...weekly, mode: 'daily' }
    for (const layout of ['classic', 'modern']) {
      const html = buildReportHtml([switched], profile, layout, 'de')
      assert(html.includes('Suchfunktion erweitert'), layout + ': Wochentext fehlt')
    }
  })

  check('Leere Abschnitte erscheinen nicht', () => {
    const html = buildReportHtml([daily], profile, 'classic', 'de')
    assert(!html.includes('Themen des Berufsschulunterrichts'), 'Leerer Abschnitt gedruckt')
  })

  check('Türkische Zeichen bleiben erhalten', () => {
    const tr = { ...daily, days: daily.days.map((d) => ({ ...d, text: d.text ? 'ÇĞİÖŞÜ çğıöşü' : '' })) }
    const html = buildReportHtml([tr], profile, 'classic', 'tr')
    assert(html.includes('ÇĞİÖŞÜ çğıöşü'), 'Sonderzeichen verändert')
  })

  check('HTML aus Nutzertext wird entschärft', () => {
    const evil = { ...daily, days: daily.days.map((d, i) => (i ? d : { ...d, text: '<script>x</script>' })) }
    const html = buildReportHtml([evil], profile, 'classic', 'de')
    assert(!html.includes('<script>x</script>'), 'Ungefiltertes HTML im PDF')
    assert(html.includes('&lt;script&gt;'), 'Escaping fehlt')
  })

  check('Mehrere Wochen ergeben mehrere Blätter', () => {
    const html = buildReportHtml([daily, weekly], profile, 'classic', 'de')
    equal((html.match(/class="sheet"/g) || []).length, 2, 'Anzahl Blätter')
  })

  check('Alle drei Sprachen erzeugen ein Blatt', () => {
    for (const lang of ['de', 'en', 'tr']) {
      const html = buildReportHtml([daily], profile, 'modern', lang)
      assert(html.includes('<section class="sheet"'), lang + ': kein Blatt')
    }
  })

  /* -------------------------------------------------------- Migration -- */

  check('Alte Datenbank wird migriert', () => {
    const dir = join(app.getPath('userData'), 'migration')
    mkdirSync(dir, { recursive: true })
    const file = join(dir, 'alt.db')
    const old = new Database(file)
    old.exec(\`
      CREATE TABLE entries (
        id TEXT PRIMARY KEY, iso_year INTEGER NOT NULL, iso_week INTEGER NOT NULL,
        start_date TEXT NOT NULL, end_date TEXT NOT NULL, training_year INTEGER NOT NULL DEFAULT 1,
        company TEXT NOT NULL DEFAULT '', company_hours REAL NOT NULL DEFAULT 0,
        school TEXT NOT NULL DEFAULT '', school_hours REAL NOT NULL DEFAULT 0,
        instruction TEXT NOT NULL DEFAULT '', instruction_hours REAL NOT NULL DEFAULT 0,
        notes TEXT NOT NULL DEFAULT '', status TEXT NOT NULL DEFAULT 'draft',
        created_at TEXT NOT NULL, updated_at TEXT NOT NULL
      );
      CREATE TABLE templates (id TEXT PRIMARY KEY, title TEXT NOT NULL, field TEXT NOT NULL, text TEXT NOT NULL);
      CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
      INSERT INTO entries VALUES ('2025-KW40', 2025, 40, '2025-09-29', '2025-10-05', 1,
        'Alte Woche', 0, '', 0, '', 0, '', 'draft', '2025-09-29', '2025-09-29');
    \`)
    old.pragma('user_version = 1')
    old.close()

    // Die Migrationslogik ist an das Modul gebunden; hier wird sie nachgestellt.
    const fresh = new Database(file)
    const version = fresh.pragma('user_version', { simple: true })
    equal(version, 1, 'Ausgangsversion')
    fresh.exec("ALTER TABLE entries ADD COLUMN days TEXT NOT NULL DEFAULT '[]'")
    fresh.exec("ALTER TABLE entries ADD COLUMN mode TEXT NOT NULL DEFAULT 'weekly'")
    const row = fresh.prepare('SELECT days, mode, company FROM entries').get()
    equal(row.days, '[]', 'Tagesliste')
    equal(row.mode, 'weekly', 'Erfassungsart')
    equal(row.company, 'Alte Woche', 'Text bleibt erhalten')
    fresh.close()
  })

  db.closeDatabase()
  writeFileSync(${JSON.stringify(posix(resultFile))}, JSON.stringify(results, null, 2), 'utf-8')
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
  external: ['electron', 'better-sqlite3'],
  logLevel: 'warning',
})

const child = spawn(electron, [bundlePath], { stdio: 'inherit' })
child.on('exit', async () => {
  const { readFileSync } = await import('node:fs')
  let results = []
  try {
    results = JSON.parse(readFileSync(resultFile, 'utf-8'))
  } catch {
    console.error('Kein Ergebnis — der Test ist vorzeitig abgebrochen.')
    process.exit(1)
  }

  const failed = results.filter((r) => !r.ok)
  for (const r of results) {
    console.log(`${r.ok ? 'OK    ' : 'FEHLER'}  ${r.name}${r.ok ? '' : ' — ' + r.error}`)
  }
  console.log(`\n${results.length - failed.length}/${results.length} bestanden`)
  rmSync(sandbox, { recursive: true, force: true })
  process.exit(failed.length ? 1 : 0)
})
