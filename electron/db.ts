import { app } from 'electron'
import { existsSync, mkdirSync, readdirSync, rmSync, statSync, copyFileSync } from 'node:fs'
import { join } from 'node:path'
import Database from 'better-sqlite3'
import type {
  AppSnapshot,
  DayEntry,
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
  address: '',
  occupation: '',
  specialization: '',
  company: '',
  trainer: '',
  department: '',
  startDate: '',
  durationYears: 3,
  bookNumber: '1',
}

const DEFAULT_SETTINGS: Settings = {
  language: 'de',
  theme: 'system',
  pdfLayout: 'classic',
  entryMode: 'daily',
  coverSheet: true,
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
  return getProfile()
}

export function getSettings(): Settings {
  return getMeta('settings', DEFAULT_SETTINGS)
}

export function setSettings(settings: Settings): Settings {
  setMeta('settings', settings)
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
  company: string
  company_hours: number
  school: string
  school_hours: number
  instruction: string
  instruction_hours: number
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
    company: r.company,
    companyHours: r.company_hours,
    school: r.school,
    schoolHours: r.school_hours,
    instruction: r.instruction,
    instructionHours: r.instruction_hours,
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
    id, iso_year, iso_week, start_date, end_date, training_year,
    company, company_hours, school, school_hours, instruction, instruction_hours,
    days, notes, status, created_at, updated_at
  ) VALUES (
    @id, @isoYear, @isoWeek, @startDate, @endDate, @trainingYear,
    @company, @companyHours, @school, @schoolHours, @instruction, @instructionHours,
    @days, @notes, @status, @createdAt, @updatedAt
  )
  ON CONFLICT(id) DO UPDATE SET
    iso_year          = excluded.iso_year,
    iso_week          = excluded.iso_week,
    start_date        = excluded.start_date,
    end_date          = excluded.end_date,
    training_year     = excluded.training_year,
    company           = excluded.company,
    company_hours     = excluded.company_hours,
    school            = excluded.school,
    school_hours      = excluded.school_hours,
    instruction       = excluded.instruction,
    instruction_hours = excluded.instruction_hours,
    days              = excluded.days,
    notes             = excluded.notes,
    status            = excluded.status,
    updated_at        = excluded.updated_at
`

export function saveEntry(entry: WeekEntry): WeekEntry {
  const now = new Date().toISOString()
  db.prepare(UPSERT_ENTRY).run(toRowParams(entry, now))
  const row = db.prepare('SELECT * FROM entries WHERE id = ?').get(entry.id) as EntryRow
  return toEntry(row)
}

export function deleteEntry(id: string): void {
  db.prepare('DELETE FROM entries WHERE id = ?').run(id)
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
  return t
}

export function deleteTemplate(id: string): void {
  db.prepare('DELETE FROM templates WHERE id = ?').run(id)
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
    const tpl = db.prepare('INSERT INTO templates (id, title, field, text) VALUES (?, ?, ?, ?)')
    for (const t of d.templates) tpl.run(t.id, t.title, t.field, t.text)
    setMeta('profile', d.profile)
    setMeta('settings', d.settings)
  })
  run(data)
  return snapshot()
}

/** Legt eine Kopie der Datenbank an und haelt nur die letzten KEEP_BACKUPS Stueck. */
export function rotateBackup(): void {
  if (!existsSync(dbPath)) return
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  try {
    copyFileSync(dbPath, join(backupDir, `berichtsheft-${stamp}.db`))
  } catch {
    return // Ein fehlgeschlagenes Backup darf die App nie blockieren.
  }
  const files = readdirSync(backupDir)
    .filter((f) => f.endsWith('.db'))
    .sort()
  for (const old of files.slice(0, Math.max(0, files.length - KEEP_BACKUPS))) {
    try {
      rmSync(join(backupDir, old))
    } catch {
      /* ignorieren */
    }
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
