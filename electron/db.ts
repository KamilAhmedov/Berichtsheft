import { app } from 'electron'
import { existsSync, mkdirSync, readdirSync, rmSync, statSync, copyFileSync } from 'node:fs'
import { join } from 'node:path'
import Database from 'better-sqlite3'
import type {
  AppSnapshot,
  BackupInfo,
  DayEntry,
  EntryMode,
  EntryStatus,
  Profile,
  Settings,
  StorageInfo,
  Template,
  WeekEntry,
} from '../shared/types'

/**
 * Alle Daten liegen in einer einzigen SQLite-Datei unter dem Benutzerprofil:
 *   %APPDATA%\Berichtsheft\data\berichtsheft.db
 * Nichts verlaesst den Rechner, es gibt keinen Server und kein Konto.
 */

const DEFAULT_PROFILE: Profile = {
  fullName: '',
  occupation: '',
  company: '',
  trainer: '',
  department: '',
  startDate: '',
  durationYears: 3,
}

const DEFAULT_SETTINGS: Settings = {
  language: 'de',
  theme: 'system',
  pdfLayout: 'classic',
  entryMode: 'daily',
  lastBackupAt: null,
  backupReminderDays: 14,
}

/** Wie viele automatische Sicherungen aufbewahrt werden. */
const KEEP_BACKUPS = 10

let db: Database.Database
let dbPath = ''
let backupDir = ''

export function initDatabase(): void {
  const dataDir = join(app.getPath('userData'), 'data')
  backupDir = join(app.getPath('userData'), 'backups')
  mkdirSync(dataDir, { recursive: true })
  mkdirSync(backupDir, { recursive: true })
  dbPath = join(dataDir, 'berichtsheft.db')

  const isNew = !existsSync(dbPath)
  db = new Database(dbPath)
  // WAL ueberlebt Abstuerze und Stromausfaelle ohne beschaedigte Datei.
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')

  migrate()
  if (isNew) seedDefaults()
  else rotateBackup()
}

function migrate(): void {
  const version = (db.pragma('user_version', { simple: true }) as number) ?? 0

  if (version < 1) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS entries (
        id                TEXT PRIMARY KEY,
        iso_year          INTEGER NOT NULL,
        iso_week          INTEGER NOT NULL,
        start_date        TEXT    NOT NULL,
        end_date          TEXT    NOT NULL,
        training_year     INTEGER NOT NULL DEFAULT 1,
        company           TEXT    NOT NULL DEFAULT '',
        company_hours     REAL    NOT NULL DEFAULT 0,
        school            TEXT    NOT NULL DEFAULT '',
        school_hours      REAL    NOT NULL DEFAULT 0,
        instruction       TEXT    NOT NULL DEFAULT '',
        instruction_hours REAL    NOT NULL DEFAULT 0,
        notes             TEXT    NOT NULL DEFAULT '',
        status            TEXT    NOT NULL DEFAULT 'draft',
        created_at        TEXT    NOT NULL,
        updated_at        TEXT    NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_entries_week ON entries (iso_year, iso_week);

      CREATE TABLE IF NOT EXISTS templates (
        id    TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        field TEXT NOT NULL,
        text  TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS meta (
        key   TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
    `)
    db.pragma('user_version = 1')
  }

  if (version < 2) {
    // Tagesweise Aufstellung. Bestehende Wochen bekommen eine leere Liste.
    db.exec(`ALTER TABLE entries ADD COLUMN days TEXT NOT NULL DEFAULT '[]'`)
    db.pragma('user_version = 2')
  }

  if (version < 3) {
    // Die Erfassungsart gehoert zur Woche, nicht zu den Einstellungen.
    db.exec(`ALTER TABLE entries ADD COLUMN mode TEXT NOT NULL DEFAULT 'weekly'`)
    // Bestehende Wochen einordnen: wo Tagestexte stehen, war es Tageserfassung.
    const rows = db.prepare('SELECT id, days FROM entries').all() as Array<{
      id: string
      days: string
    }>
    const mark = db.prepare('UPDATE entries SET mode = ? WHERE id = ?')
    for (const row of rows) {
      const daily = parseDays(row.days).some((day) => day.text.trim().length > 0)
      mark.run(daily ? 'daily' : 'weekly', row.id)
    }
    db.pragma('user_version = 3')
  }
}

function seedDefaults(): void {
  setMeta('profile', DEFAULT_PROFILE)
  setMeta('settings', DEFAULT_SETTINGS)
}

/* ---------------------------------------------------------------- meta ---- */

function getMeta<T>(key: string, fallback: T): T {
  const row = db.prepare('SELECT value FROM meta WHERE key = ?').get(key) as
    | { value: string }
    | undefined
  if (!row) return fallback
  try {
    return { ...fallback, ...(JSON.parse(row.value) as object) } as T
  } catch {
    return fallback
  }
}

/**
 * Zeitpunkt der letzten inhaltlichen Aenderung. Die Sicherung braucht ihn,
 * weil der Zeitstempel der Datenbankdatei im WAL-Modus stehen bleibt.
 */
function touch(): void {
  db.prepare(
    'INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
  ).run('lastChangeAt', new Date().toISOString())
}

function lastChangeAt(): number {
  const row = db.prepare('SELECT value FROM meta WHERE key = ?').get('lastChangeAt') as
    | { value: string }
    | undefined
  return row ? Date.parse(row.value) : Number.NaN
}

function setMeta(key: string, value: unknown): void {
  db.prepare(
    'INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
  ).run(key, JSON.stringify(value))
}

export function getProfile(): Profile {
  return getMeta('profile', DEFAULT_PROFILE)
}

export function setProfile(profile: Profile): Profile {
  setMeta('profile', profile)
  touch()
  return getProfile()
}

export function getSettings(): Settings {
  return getMeta('settings', DEFAULT_SETTINGS)
}

export function setSettings(settings: Settings): Settings {
  setMeta('settings', settings)
  touch()
  return getSettings()
}

/* -------------------------------------------------------------- entries ---- */

interface EntryRow {
  id: string
  iso_year: number
  iso_week: number
  start_date: string
  end_date: string
  training_year: number
  mode: string
  company: string
  school: string
  instruction: string
  days: string
  notes: string
  status: string
  created_at: string
  updated_at: string
}

/** Die Tagesliste liegt als JSON in einer Spalte — defekte Daten dürfen nichts umwerfen. */
function parseDays(raw: string): DayEntry[] {
  try {
    const parsed: unknown = JSON.parse(raw || '[]')
    return Array.isArray(parsed) ? (parsed as DayEntry[]) : []
  } catch {
    return []
  }
}

/** Für den Upsert: Tagesliste zurück in Text verwandeln. */
function toRowParams(entry: WeekEntry, now: string) {
  return {
    ...entry,
    mode: entry.mode ?? 'weekly',
    days: JSON.stringify(entry.days ?? []),
    createdAt: entry.createdAt || now,
    updatedAt: now,
  }
}

function toEntry(r: EntryRow): WeekEntry {
  return {
    id: r.id,
    isoYear: r.iso_year,
    isoWeek: r.iso_week,
    startDate: r.start_date,
    endDate: r.end_date,
    trainingYear: r.training_year,
    mode: (r.mode as EntryMode) ?? 'weekly',
    company: r.company,
    school: r.school,
    instruction: r.instruction,
    days: parseDays(r.days),
    notes: r.notes,
    status: r.status as EntryStatus,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }
}

export function listEntries(): WeekEntry[] {
  const rows = db
    .prepare('SELECT * FROM entries ORDER BY iso_year ASC, iso_week ASC')
    .all() as EntryRow[]
  return rows.map(toEntry)
}

const UPSERT_ENTRY = `
  INSERT INTO entries (
    id, iso_year, iso_week, start_date, end_date, training_year, mode,
    company, school, instruction,
    days, notes, status, created_at, updated_at
  ) VALUES (
    @id, @isoYear, @isoWeek, @startDate, @endDate, @trainingYear, @mode,
    @company, @school, @instruction,
    @days, @notes, @status, @createdAt, @updatedAt
  )
  ON CONFLICT(id) DO UPDATE SET
    iso_year          = excluded.iso_year,
    iso_week          = excluded.iso_week,
    start_date        = excluded.start_date,
    end_date          = excluded.end_date,
    training_year     = excluded.training_year,
    mode              = excluded.mode,
    company           = excluded.company,
    school            = excluded.school,
    instruction       = excluded.instruction,
    days              = excluded.days,
    notes             = excluded.notes,
    status            = excluded.status,
    updated_at        = excluded.updated_at
`

export function saveEntry(entry: WeekEntry): WeekEntry {
  const now = new Date().toISOString()
  db.prepare(UPSERT_ENTRY).run(toRowParams(entry, now))
  touch()
  const row = db.prepare('SELECT * FROM entries WHERE id = ?').get(entry.id) as EntryRow
  return toEntry(row)
}

export function deleteEntry(id: string): void {
  db.prepare('DELETE FROM entries WHERE id = ?').run(id)
  touch()
}

/* ------------------------------------------------------------ templates ---- */

export function listTemplates(): Template[] {
  return db
    .prepare('SELECT id, title, field, text FROM templates ORDER BY title')
    .all() as Template[]
}

export function saveTemplate(t: Template): Template {
  db.prepare(
    `INSERT INTO templates (id, title, field, text) VALUES (@id, @title, @field, @text)
     ON CONFLICT(id) DO UPDATE SET title = excluded.title, field = excluded.field, text = excluded.text`,
  ).run(t)
  touch()
  return t
}

export function deleteTemplate(id: string): void {
  db.prepare('DELETE FROM templates WHERE id = ?').run(id)
  touch()
}

/* -------------------------------------------------------------- backups ---- */

export function snapshot(): AppSnapshot {
  return {
    profile: getProfile(),
    settings: getSettings(),
    entries: listEntries(),
    templates: listTemplates(),
  }
}

/** Ersetzt den gesamten Datenbestand — als eine Transaktion, also ganz oder gar nicht. */
export function restore(data: AppSnapshot): AppSnapshot {
  rotateBackup()
  const run = db.transaction((d: AppSnapshot) => {
    db.prepare('DELETE FROM entries').run()
    db.prepare('DELETE FROM templates').run()
    const upsert = db.prepare(UPSERT_ENTRY)
    const now = new Date().toISOString()
    for (const e of d.entries) {
      upsert.run(toRowParams({ ...e, days: e.days ?? [] }, e.updatedAt || now))
    }
    // Wie beim Speichern einzelner Bausteine: kommt eine Kennung doppelt vor —
    // etwa in einer von Hand zusammengesetzten Sicherung —, gewinnt der spätere
    // Eintrag. Ohne das bricht die gesamte Wiederherstellung ab.
    const tpl = db.prepare(
      `INSERT INTO templates (id, title, field, text) VALUES (?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         title = excluded.title, field = excluded.field, text = excluded.text`,
    )
    for (const t of d.templates) tpl.run(t.id, t.title, t.field, t.text)
    setMeta('profile', d.profile)
    setMeta('settings', d.settings)
  })
  run(data)
  touch()
  return snapshot()
}

function backupFiles(): string[] {
  try {
    return readdirSync(backupDir)
      .filter((f) => f.endsWith('.db'))
      .sort()
  } catch {
    return []
  }
}

/**
 * Legt eine Kopie der Datenbank an und haelt nur die letzten KEEP_BACKUPS Stueck.
 *
 * Hat sich seit der letzten Sicherung nichts geaendert, entfaellt die Kopie —
 * sonst saeen sich bei haeufigen Programmstarts identische Dateien an.
 */
export function rotateBackup(): void {
  if (!existsSync(dbPath)) return

  const existing = backupFiles()
  const newest = existing[existing.length - 1]
  if (newest) {
    try {
      // Der Zeitstempel der Datenbankdatei taugt nicht als Massstab: im
      // WAL-Modus laufen Schreibvorgaenge zunaechst in die -wal-Datei, die
      // Hauptdatei bleibt unberuehrt. Deshalb der selbst gefuehrte Stand.
      const changed = lastChangeAt()
      const backedUp = statSync(join(backupDir, newest)).mtimeMs
      if (Number.isFinite(changed) && changed <= backedUp) return
    } catch {
      /* Im Zweifel lieber sichern. */
    }
  }

  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  try {
    // Offene Transaktionen in die Hauptdatei schreiben, sonst fehlen der
    // Kopie genau die zuletzt gespeicherten Wochen.
    db.pragma('wal_checkpoint(TRUNCATE)')
    copyFileSync(dbPath, join(backupDir, `berichtsheft-${stamp}.db`))
  } catch {
    return // Ein fehlgeschlagenes Backup darf die App nie blockieren.
  }

  const files = backupFiles()
  for (const old of files.slice(0, Math.max(0, files.length - KEEP_BACKUPS))) {
    try {
      rmSync(join(backupDir, old))
    } catch {
      /* ignorieren */
    }
  }
}

/**
 * Die vorhandenen Sicherungen mit Datum, Groesse und Anzahl der Wochen.
 * Jede Datei wird kurz lesend geoeffnet — bei zehn kleinen Dateien kostet
 * das nichts und erspart das Raten beim Zurueckspielen.
 */
export function listBackups(): BackupInfo[] {
  return backupFiles()
    .map((file): BackupInfo => {
      const path = join(backupDir, file)
      let entryCount = 0
      try {
        const copy = new Database(path, { readonly: true })
        const row = copy.prepare('SELECT COUNT(*) AS n FROM entries').get() as { n: number }
        entryCount = row?.n ?? 0
        copy.close()
      } catch {
        entryCount = 0 // Eine unlesbare Sicherung soll die Liste nicht sprengen.
      }
      let sizeBytes = 0
      let createdAt = ''
      try {
        const stat = statSync(path)
        sizeBytes = stat.size
        createdAt = stat.mtime.toISOString()
      } catch {
        /* Datei ist verschwunden — dann bleibt es bei den Vorgaben. */
      }
      return { file, createdAt, sizeBytes, entryCount }
    })
    .reverse() // neueste zuerst
}

/**
 * Spielt eine Sicherung zurueck. Der aktuelle Stand wird vorher gesichert,
 * damit auch ein versehentliches Zurueckspielen umkehrbar bleibt.
 */
export function restoreBackup(file: string): AppSnapshot {
  // Nur Dateien aus dem eigenen Ordner, keine Pfadangaben von aussen.
  if (!backupFiles().includes(file)) throw new Error('UNKNOWN_BACKUP')

  const copy = new Database(join(backupDir, file), { readonly: true })
  try {
    const rows = copy
      .prepare('SELECT * FROM entries ORDER BY iso_year ASC, iso_week ASC')
      .all() as EntryRow[]
    const templates = copy
      .prepare('SELECT id, title, field, text FROM templates ORDER BY title')
      .all() as Template[]
    const metaRows = copy.prepare('SELECT key, value FROM meta').all() as Array<{
      key: string
      value: string
    }>
    const meta = new Map(metaRows.map((r) => [r.key, r.value]))
    const parse = <T>(key: string, fallback: T): T => {
      const raw = meta.get(key)
      if (!raw) return fallback
      try {
        return { ...fallback, ...(JSON.parse(raw) as object) } as T
      } catch {
        return fallback
      }
    }

    return restore({
      entries: rows.map(toEntry),
      templates,
      profile: parse('profile', DEFAULT_PROFILE),
      settings: parse('settings', DEFAULT_SETTINGS),
    })
  } finally {
    copy.close()
  }
}

export function storageInfo(): StorageInfo {
  let size = 0
  try {
    size = statSync(dbPath).size
  } catch {
    size = 0
  }
  let backups = 0
  try {
    backups = readdirSync(backupDir).filter((f) => f.endsWith('.db')).length
  } catch {
    backups = 0
  }
  return {
    dataDir: app.getPath('userData'),
    dbPath,
    dbSizeBytes: size,
    backupCount: backups,
    appVersion: app.getVersion(),
  }
}

export function closeDatabase(): void {
  try {
    db?.close()
  } catch {
    /* ignorieren */
  }
}
