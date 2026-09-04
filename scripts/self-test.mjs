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
import {
  addDays,
  fromISODate,
  getISOWeek,
  isoWeekStart,
  toISODate,
  trainingYearFor,
  weekId,
  weeksInISOYear,
} from '${posix(join(root, 'shared', 'dates.ts'))}'
import {
  addTrailingDay,
  clampHours,
  makeDays as makeWeekDays,
  mergeFromPrevious,
  missingWeeks,
  plannedWeeks,
  removeTrailingDay,
} from '${posix(join(root, 'src', 'lib', 'weeks.ts'))}'

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


  check('Gleichzeitige Aenderungen an den Einstellungen ueberschreiben sich nicht', () => {
    // So wie die Oberflaeche es tut: nur die Aenderung schicken.
    const merge = (patch) => db.setSettings({ ...db.getSettings(), ...patch })
    merge({ language: 'tr' })
    merge({ theme: 'dark' })
    const s = db.getSettings()
    equal(s.language, 'tr', 'Sprache bleibt')
    equal(s.theme, 'dark', 'Erscheinungsbild bleibt')
    merge({ language: 'de', theme: 'system' })
  })


  /* --------------------------------------------- Bedienung des Editors -- */

  check('Stunden bleiben zwischen null und vierundzwanzig', () => {
    equal(clampHours(8), 8, 'ueblicher Wert')
    equal(clampHours(-5), 0, 'negative Eingabe')
    equal(clampHours(999), 24, 'zu grosse Eingabe')
    equal(clampHours(Number.NaN), 0, 'keine Zahl')
    equal(clampHours(7.5), 7.5, 'halbe Stunde bleibt')
  })

  check('Ein Tag kommt dazu und geht wieder — einzeln', () => {
    const montag = '2026-03-16'
    let days = makeWeekDays(fromISODate(montag))
    equal(days.length, 5, 'Ausgangslage')

    days = addTrailingDay(days, montag)
    equal(days.length, 6, 'Samstag dazu')
    equal(days[5].date, '2026-03-21', 'Datum des Samstags')

    days = addTrailingDay(days, montag)
    equal(days.length, 7, 'Sonntag dazu')
    equal(days[6].date, '2026-03-22', 'Datum des Sonntags')

    equal(addTrailingDay(days, montag).length, 7, 'mehr als sieben geht nicht')

    days = removeTrailingDay(days)
    equal(days.length, 6, 'Sonntag weg')
    days = removeTrailingDay(days)
    equal(days.length, 5, 'Samstag weg')
    equal(removeTrailingDay(days).length, 5, 'unter fuenf geht nicht')
  })

  check('Eine Woche mit sieben Tagen verliert den Sonntag nicht', () => {
    const montag = '2026-03-16'
    let days = makeWeekDays(fromISODate(montag))
    days = addTrailingDay(days, montag)
    days = addTrailingDay(days, montag)
    days[5] = { ...days[5], text: 'Samstagsdienst', hours: 4 }
    days[6] = { ...days[6], text: 'Bereitschaft', hours: 2 }

    // So verhielt sich der Editor frueher: er kuerzte pauschal auf fuenf Tage.
    const frueher = days.slice(0, 5)
    equal(frueher.length, 5, 'Alte Kuerzung')

    const jetzt = removeTrailingDay(days)
    equal(jetzt.length, 6, 'Nur der Sonntag geht')
    equal(jetzt[5].text, 'Samstagsdienst', 'Der Samstag bleibt erhalten')
  })

  check('Vorwoche uebernehmen loescht keine eingetragenen Stunden', () => {
    const montag = '2026-03-16'
    const aktuell = {
      ...weekEntry('2026-KW12', 12, 'daily'),
      startDate: montag,
      days: makeWeekDays(fromISODate(montag)).map((d) => ({ ...d, hours: 8 })),
    }
    // Die Vorwoche wurde als Wochentext gefuehrt und hat keine Tageszeilen.
    const vorwoche = {
      ...weekEntry('2026-KW11', 11, 'weekly'),
      days: [],
      company: 'Wochentext der Vorwoche',
      school: 'Lernfeld 3',
      instruction: '',
    }

    const merged = mergeFromPrevious(aktuell, vorwoche)
    equal(merged.company, 'Wochentext der Vorwoche', 'Der Text kommt mit')
    equal(merged.days.length, 5, 'Die eigenen Tage bleiben stehen')
    equal(merged.days[0].hours, 8, 'Die eingetragenen Stunden bleiben')
  })

  check('Vorwoche uebernehmen setzt die Datumswerte dieser Woche', () => {
    const aktuell = { ...weekEntry('2026-KW12', 12, 'daily'), startDate: '2026-03-16' }
    const vorwoche = {
      ...weekEntry('2026-KW11', 11, 'daily'),
      startDate: '2026-03-09',
      days: makeWeekDays(fromISODate('2026-03-09')).map((d, i) => ({ ...d, text: 'Tag ' + i })),
    }
    const merged = mergeFromPrevious(aktuell, vorwoche)
    equal(merged.days[0].date, '2026-03-16', 'Montag dieser Woche')
    equal(merged.days[4].date, '2026-03-20', 'Freitag dieser Woche')
    equal(merged.days[0].text, 'Tag 0', 'Der Text kommt mit')
  })

  check('Vorwoche mit mehr Tagen sprengt die Woche nicht', () => {
    const aktuell = { ...weekEntry('2026-KW12', 12, 'daily'), startDate: '2026-03-16' }
    const vorwoche = {
      ...weekEntry('2026-KW11', 11, 'daily'),
      days: Array.from({ length: 9 }, (_, i) => ({
        date: '2026-03-0' + (i + 1),
        kind: 'company',
        text: 'x',
        hours: 8,
      })),
    }
    const merged = mergeFromPrevious(aktuell, vorwoche)
    assert(merged.days.length <= 7, 'Mehr als sieben Tage: ' + merged.days.length)
  })

  /* ------------------------------------------------------- Randfaelle -- */

  check('Kalenderwochen am Jahreswechsel', () => {
    // Der 1. Januar 2027 faellt in die KW 53 des Jahres 2026.
    const silvester = getISOWeek(new Date(2027, 0, 1))
    equal(silvester.isoYear, 2026, 'ISO-Jahr')
    equal(silvester.isoWeek, 53, 'ISO-Woche')
    // Und der 29. Dezember 2025 gehoert bereits zur KW 1 des Jahres 2026.
    const jahreswechsel = getISOWeek(new Date(2025, 11, 29))
    equal(jahreswechsel.isoYear, 2026, 'ISO-Jahr am Jahresanfang')
    equal(jahreswechsel.isoWeek, 1, 'ISO-Woche am Jahresanfang')
  })

  check('Jahre mit 53 Wochen werden erkannt', () => {
    equal(weeksInISOYear(2026), 53, '2026')
    equal(weeksInISOYear(2025), 52, '2025')
  })

  check('Wochenschluessel sortieren ueber den Jahreswechsel', () => {
    const ids = [weekId(2026, 53), weekId(2027, 1), weekId(2026, 9), weekId(2026, 10)]
    const sorted = [...ids].sort()
    equal(sorted.join(','), '2026-KW09,2026-KW10,2026-KW53,2027-KW01', 'Reihenfolge')
  })

  check('Woche 53 laesst sich anlegen und speichern', () => {
    const monday = isoWeekStart(2026, 53)
    const entry = {
      id: weekId(2026, 53), isoYear: 2026, isoWeek: 53,
      startDate: toISODate(monday), endDate: toISODate(addDays(monday, 6)),
      trainingYear: 1, mode: 'daily',
      company: '', school: '', instruction: '',
      days: [{ date: toISODate(monday), kind: 'company', text: 'Jahresabschluss', hours: 8 }],
      notes: '', status: 'draft', createdAt: '', updatedAt: '',
    }
    const saved = db.saveEntry(entry)
    equal(saved.id, '2026-KW53', 'Kennung')
    equal(saved.startDate, '2026-12-28', 'Montag der KW 53')
    db.deleteEntry(saved.id)
  })

  check('Sehr langer Text ueberlebt Speichern und Lesen', () => {
    const lang = 'Zeile mit Umlauten äöüß und türkischen Zeichen çğıöşü. '.repeat(400)
    const entry = weekEntry('2026-KW09', 9, 'weekly', { company: lang })
    const saved = db.saveEntry(entry)
    equal(saved.company.length, lang.length, 'Laenge')
    equal(saved.company, lang, 'Inhalt unveraendert')
    db.deleteEntry(saved.id)
  })

  check('Halbe Stunden bleiben halbe Stunden', () => {
    const entry = weekEntry('2026-KW08', 8, 'daily', {
      days: [
        { date: '2026-02-16', kind: 'company', text: 'a', hours: 7.5 },
        { date: '2026-02-17', kind: 'company', text: 'b', hours: 0.25 },
      ],
    })
    const saved = db.saveEntry(entry)
    equal(saved.days[0].hours, 7.5, 'Sieben ein halb')
    equal(saved.days[1].hours, 0.25, 'Viertelstunde')
    db.deleteEntry(saved.id)
  })

  check('Eine Woche mit sieben Tagen bleibt vollstaendig', () => {
    const monday = isoWeekStart(2026, 7)
    const days = Array.from({ length: 7 }, (_, i) => ({
      date: toISODate(addDays(monday, i)),
      kind: i > 4 ? 'off' : 'company',
      text: i > 4 ? '' : 'Tag ' + i,
      hours: i > 4 ? 0 : 8,
    }))
    const saved = db.saveEntry(weekEntry('2026-KW07', 7, 'daily', { days }))
    equal(saved.days.length, 7, 'Anzahl')
    equal(saved.days[6].kind, 'off', 'Sonntag')
    db.deleteEntry(saved.id)
  })

  check('Import mit unbrauchbaren Feldern kippt nicht', () => {
    const snap = db.snapshot()
    const kaputt = {
      profile: snap.profile,
      settings: snap.settings,
      templates: [],
      entries: [
        {
          id: '2026-KW05', isoYear: 2026, isoWeek: 5,
          startDate: '2026-01-26', endDate: '2026-02-01', trainingYear: 1,
          company: 'Text', school: '', instruction: '',
          days: 'kein Array',
          notes: '', status: 'draft', createdAt: '', updatedAt: '',
        },
      ],
    }
    const restored = db.restore(kaputt)
    equal(restored.entries.length, 1, 'Anzahl')
    assert(Array.isArray(restored.entries[0].days), 'Tagesliste ist kein Array')
    db.restore(snap)
  })

  check('Ausbildungsdauer mit halben Jahren rechnet richtig', () => {
    const start = { ...profile, startDate: '2026-09-01', durationYears: 2.5 }
    const weeks = plannedWeeks(start)
    assert(weeks.length > 120 && weeks.length < 140, 'Zweieinhalb Jahre sind rund 130 Wochen, waren ' + weeks.length)
    const drei = plannedWeeks({ ...start, durationYears: 3 })
    assert(drei.length > weeks.length, 'Drei Jahre muessen mehr Wochen ergeben')
  })

  check('Ohne Ausbildungsbeginn bleibt die Planung leer', () => {
    equal(plannedWeeks({ ...profile, startDate: '' }).length, 0, 'Wochen')
    equal(missingWeeks({ ...profile, startDate: '' }, db.listEntries()).length, 0, 'Luecken')
  })

  check('Das Lehrjahr wechselt am Jahrestag', () => {
    const start = fromISODate('2026-09-01')
    equal(trainingYearFor(fromISODate('2026-09-01'), start, 3), 1, 'Erster Tag')
    equal(trainingYearFor(fromISODate('2027-08-31'), start, 3), 1, 'Tag davor')
    equal(trainingYearFor(fromISODate('2027-09-01'), start, 3), 2, 'Jahrestag')
    equal(trainingYearFor(fromISODate('2029-09-01'), start, 3), 3, 'Nach dem Ende bleibt es beim letzten')
  })

  check('Die laufende Woche gilt nicht als Luecke', () => {
    const heute = new Date()
    const jetzt = getISOWeek(heute)
    const start = toISODate(addDays(isoWeekStart(jetzt.isoYear, jetzt.isoWeek), -21))
    const p = { ...profile, startDate: start, durationYears: 3 }
    const luecken = missingWeeks(p, [])
    // Drei Wochen zurueck: die laufende zaehlt nicht mit.
    equal(luecken.length, 3, 'Anzahl der Luecken')
    assert(
      !luecken.some((w) => weekId(w.isoYear, w.isoWeek) === weekId(jetzt.isoYear, jetzt.isoWeek)),
      'Die laufende Woche steht in der Liste',
    )
  })

  check('PDF bleibt bei langem Text bei einer Seite je Woche', () => {
    const lang = 'Ein Satz, der die Seite fuellen soll. '.repeat(120)
    const entry = weekEntry('2026-KW06', 6, 'weekly', { company: lang, school: lang })
    const html = buildReportHtml([entry], profile, 'classic', 'de')
    equal((html.match(/class="sheet"/g) || []).length, 1, 'Anzahl Blaetter')
  })

  check('Woche ohne Tage bricht das Tages-PDF nicht', () => {
    const entry = weekEntry('2026-KW04', 4, 'daily', { days: [] })
    for (const layout of ['classic', 'modern']) {
      const html = buildReportHtml([entry], profile, layout, 'de')
      assert(html.includes('sheet'), layout + ': kein Blatt')
    }
  })

  check('Leeres Profil erzeugt trotzdem ein PDF', () => {
    const leer = {
      fullName: '', occupation: '', company: '', trainer: '',
      department: '', startDate: '', durationYears: 3,
    }
    const html = buildReportHtml([db.listEntries()[0]], leer, 'classic', 'de')
    assert(html.includes('Ausbildungsnachweis'), 'Titel fehlt')
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
