import { contextBridge, ipcRenderer } from 'electron'
import type {
  AppSnapshot,
  BackupInfo,
  IpcResult,
  PdfRequest,
  Profile,
  Settings,
  StorageInfo,
  Template,
  WeekEntry,
} from '../shared/types'

/**
 * Die einzige Brücke zwischen Oberfläche und System. Der Renderer hat kein
 * Node.js, keinen Dateizugriff und keine Datenbank — nur genau diese Funktionen.
 */

async function call<T>(channel: string, ...args: unknown[]): Promise<T> {
  const result = (await ipcRenderer.invoke(channel, ...args)) as IpcResult<T>
  if (!result.ok) throw new Error(result.error)
  return result.data
}

const api = {
  load: () => call<AppSnapshot>('data:load'),
  saveEntry: (entry: WeekEntry) => call<WeekEntry>('entry:save', entry),
  deleteEntry: (id: string) => call<void>('entry:delete', id),
  saveProfile: (profile: Profile) => call<Profile>('profile:save', profile),
  saveSettings: (settings: Settings) => call<Settings>('settings:save', settings),
  saveTemplate: (t: Template) => call<Template>('template:save', t),
  deleteTemplate: (id: string) => call<void>('template:delete', id),

  exportBackup: () => call<string | null>('data:export'),
  importBackup: () => call<AppSnapshot | null>('data:import'),
  exportPdf: (req: PdfRequest) => call<string | null>('pdf:export', req),

  storageInfo: () => call<StorageInfo>('storage:info'),
  listBackups: () => call<BackupInfo[]>('backup:list'),
  restoreBackup: (file: string) => call<AppSnapshot>('backup:restore', file),
  setSpellCheckLanguage: (language: string) => call<void>('spellcheck:language', language),
  openDataDir: () => call<void>('shell:openDataDir'),
  showItemInFolder: (path: string) => call<void>('shell:showItem', path),
  setNativeTheme: (isDark: boolean) => call<void>('theme:set', isDark),

  platform: process.platform,
}

export type BerichtsheftApi = typeof api

contextBridge.exposeInMainWorld('api', api)
