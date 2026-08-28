export type EntryStatus = 'draft' | 'submitted' | 'signed'
export type Language = 'de' | 'en' | 'tr'
export type Theme = 'light' | 'dark' | 'system'
export type PdfLayout = 'classic' | 'modern'

/**
 * Wöchentlich oder täglich — beide Formen sind als Ausbildungsnachweis zulässig.
 * Welche verlangt wird, gibt der Betrieb bzw. die zuständige IHK vor; im ersten
 * Lehrjahr ist häufig die tägliche Form vorgeschrieben.
 */
export type EntryMode = 'weekly' | 'daily'

/** Was an einem Tag war. Bestimmt, ob Text und Stunden überhaupt sinnvoll sind. */
export type DayKind = 'company' | 'school' | 'vacation' | 'sick' | 'holiday' | 'off'

export interface DayEntry {
  /** "YYYY-MM-DD" — ergibt sich aus der Kalenderwoche, nicht frei wählbar. */
  date: string
  kind: DayKind
  text: string
  hours: number
}

/** Ein Ausbildungsnachweis für genau eine Kalenderwoche. */
export interface WeekEntry {
  /** Stabiler Schlüssel im Format "2026-KW12" (ISO-Jahr + ISO-Woche). */
  id: string
  isoYear: number
  isoWeek: number
  /** Montag der Woche, "YYYY-MM-DD". */
  startDate: string
  /** Sonntag der Woche, "YYYY-MM-DD". */
  endDate: string
  /** 1..4 — Lehrjahr, aus dem Ausbildungsbeginn berechnet. */
  trainingYear: number
  /**
   * Wie diese Woche erfasst wurde. Gehoert zur Woche, nicht zu den
   * Einstellungen: wer im zweiten Lehrjahr auf Wochenberichte umstellt, soll
   * die frueheren Tagesberichte unveraendert behalten.
   */
  mode: EntryMode
  company: string
  school: string
  instruction: string
  /** Tägliche Aufstellung (Mo–Sa). Bleibt auch im Wochenmodus erhalten. */
  days: DayEntry[]
  notes: string
  status: EntryStatus
  createdAt: string
  updatedAt: string
}

export interface Profile {
  fullName: string
  occupation: string
  company: string
  trainer: string
  department: string
  /** "YYYY-MM-DD" — Beginn der Ausbildung, Basis für das Lehrjahr. */
  startDate: string
  /** Dauer in Jahren: 2, 2.5, 3 oder 3.5. */
  durationYears: number
}

export interface Settings {
  language: Language
  theme: Theme
  pdfLayout: PdfLayout
  /** Erfassungsart fuer neu angelegte Wochen. */
  entryMode: EntryMode
  /** ISO-Zeitstempel des letzten Exports, für die Backup-Erinnerung. */
  lastBackupAt: string | null
  /** Erinnerung, wenn seit so vielen Tagen kein Export gemacht wurde. */
  backupReminderDays: number
}

/** Wiederkehrende Textbausteine, damit man nicht jede Woche dasselbe tippt. */
export interface Template {
  id: string
  title: string
  field: 'company' | 'school' | 'instruction'
  text: string
}

export interface BackupFile {
  format: 'berichtsheft-backup'
  version: 1
  exportedAt: string
  app: string
  profile: Profile
  settings: Settings
  entries: WeekEntry[]
  templates: Template[]
}

export interface AppSnapshot {
  profile: Profile
  settings: Settings
  entries: WeekEntry[]
  templates: Template[]
}

/** Eine automatische Sicherung, wie sie im Ordner liegt. */
export interface BackupInfo {
  /** Dateiname, dient zugleich als Kennung beim Zurueckspielen. */
  file: string
  /** Zeitpunkt der Sicherung, ISO-8601. */
  createdAt: string
  sizeBytes: number
  /** Wie viele Wochen darin stehen — hilft beim Auswaehlen. */
  entryCount: number
}

export interface StorageInfo {
  dataDir: string
  dbPath: string
  dbSizeBytes: number
  backupCount: number
  appVersion: string
}

export interface PdfRequest {
  /** Welche Wochen ins PDF sollen. Leer = alle. */
  entryIds: string[]
  layout: PdfLayout
  language: Language
}

export type IpcResult<T> = { ok: true; data: T } | { ok: false; error: string }
