import * as React from 'react'
import type {
  AppSnapshot,
  Language,
  Profile,
  Settings,
  Template,
  Theme,
  WeekEntry,
} from '../../shared/types'
import { DICTS, LOCALES, type TranslationKey } from '@/i18n'
import { uid } from '@/lib/utils'

type ToastKind = 'success' | 'error' | 'info'

export interface Toast {
  id: string
  kind: ToastKind
  message: string
  /** Optionale Aktion, z. B. „Im Ordner zeigen“ nach einem PDF-Export. */
  action?: { label: string; run: () => void }
}

interface AppContextValue extends AppSnapshot {
  ready: boolean
  /** Übersetzung in der aktuell gewählten Sprache. */
  t: (key: TranslationKey) => string
  locale: string
  isDark: boolean

  saveEntry: (entry: WeekEntry) => Promise<void>
  removeEntry: (id: string) => Promise<void>
  saveProfile: (profile: Profile) => Promise<void>
  saveSettings: (patch: Partial<Settings>) => Promise<void>
  saveTemplate: (template: Template) => Promise<void>
  removeTemplate: (id: string) => Promise<void>
  applySnapshot: (snapshot: AppSnapshot) => void

  toasts: Toast[]
  toast: (message: string, kind?: ToastKind, action?: Toast['action']) => void
  dismissToast: (id: string) => void
}

const AppContext = React.createContext<AppContextValue | null>(null)

const EMPTY: AppSnapshot = {
  profile: {
    fullName: '',
    occupation: '',
    company: '',
    trainer: '',
    department: '',
    startDate: '',
    durationYears: 3,
  },
  settings: {
    language: 'de',
    theme: 'system',
    pdfLayout: 'classic',
    entryMode: 'daily',
    lastBackupAt: null,
    backupReminderDays: 14,
  },
  entries: [],
  templates: [],
}

/** Beobachtet die Windows-Einstellung „Dunkler Modus“. */
function usePrefersDark(): boolean {
  const [dark, setDark] = React.useState(
    () => window.matchMedia('(prefers-color-scheme: dark)').matches,
  )
  React.useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = (e: MediaQueryListEvent) => setDark(e.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])
  return dark
}

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [snapshot, setSnapshot] = React.useState<AppSnapshot>(EMPTY)
  const [ready, setReady] = React.useState(false)
  const [toasts, setToasts] = React.useState<Toast[]>([])
  const prefersDark = usePrefersDark()

  const dismissToast = React.useCallback((id: string) => {
    setToasts((list) => list.filter((t) => t.id !== id))
  }, [])

  const toast = React.useCallback(
    (message: string, kind: ToastKind = 'success', action?: Toast['action']) => {
      const id = uid()
      setToasts((list) => [...list, { id, kind, message, action }])
      window.setTimeout(() => dismissToast(id), action ? 8000 : 3500)
    },
    [dismissToast],
  )

  React.useEffect(() => {
    window.api
      .load()
      .then(setSnapshot)
      .catch((error: Error) => toast(error.message, 'error'))
      .finally(() => setReady(true))
  }, [toast])

  const theme: Theme = snapshot.settings.theme
  const isDark = theme === 'system' ? prefersDark : theme === 'dark'

  // Farbschema auf das Dokument und die native Titelleiste anwenden.
  React.useEffect(() => {
    document.documentElement.classList.toggle('dark', isDark)
    void window.api.setNativeTheme(isDark).catch(() => undefined)
  }, [isDark])

  const language: Language = snapshot.settings.language
  React.useEffect(() => {
    document.documentElement.lang = language
    // Die Rechtschreibpruefung im Hauptprozess zieht mit.
    void window.api.setSpellCheckLanguage(language).catch(() => undefined)
  }, [language])

  const t = React.useCallback((key: TranslationKey) => DICTS[language][key], [language])

  /** Wickelt jede schreibende Aktion ein, damit Fehler sichtbar werden statt still zu scheitern. */
  const guard = React.useCallback(
    async (run: () => Promise<void>) => {
      try {
        await run()
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        toast(message === 'INVALID_BACKUP' ? DICTS[language].errorInvalidBackup : message, 'error')
      }
    },
    [language, toast],
  )

  const value: AppContextValue = {
    ...snapshot,
    ready,
    t,
    locale: LOCALES[language],
    isDark,
    toasts,
    toast,
    dismissToast,

    saveEntry: (entry) =>
      guard(async () => {
        const saved = await window.api.saveEntry(entry)
        setSnapshot((s) => ({
          ...s,
          entries: [...s.entries.filter((e) => e.id !== saved.id), saved].sort((a, b) =>
            a.id.localeCompare(b.id),
          ),
        }))
      }),

    removeEntry: (id) =>
      guard(async () => {
        await window.api.deleteEntry(id)
        setSnapshot((s) => ({ ...s, entries: s.entries.filter((e) => e.id !== id) }))
      }),

    saveProfile: (profile) =>
      guard(async () => {
        const saved = await window.api.saveProfile(profile)
        setSnapshot((s) => ({ ...s, profile: saved }))
      }),

    saveSettings: (patch) =>
      guard(async () => {
        // Nur die Aenderung schicken. Wuerde hier der komplette Stand aus dem
        // Render mitgehen, koennte eine zweite Aenderung kurz danach die erste
        // mit veralteten Werten ueberschreiben.
        const saved = await window.api.saveSettings(patch)
        setSnapshot((s) => ({ ...s, settings: saved }))
      }),

    saveTemplate: (template) =>
      guard(async () => {
        const saved = await window.api.saveTemplate(template)
        setSnapshot((s) => ({
          ...s,
          templates: [...s.templates.filter((x) => x.id !== saved.id), saved].sort((a, b) =>
            a.title.localeCompare(b.title),
          ),
        }))
      }),

    removeTemplate: (id) =>
      guard(async () => {
        await window.api.deleteTemplate(id)
        setSnapshot((s) => ({ ...s, templates: s.templates.filter((x) => x.id !== id) }))
      }),

    applySnapshot: setSnapshot,
  }

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>
}

export function useApp(): AppContextValue {
  const ctx = React.useContext(AppContext)
  if (!ctx) throw new Error('useApp must be used inside <AppProvider>')
  return ctx
}
