import { app, BrowserWindow, dialog, ipcMain, nativeTheme, shell } from 'electron'
import { join } from 'node:path'
import { readFile, writeFile } from 'node:fs/promises'
import { mkdirSync } from 'node:fs'
import * as db from './db'
import { buildReportHtml, renderPdfToFile } from './pdf'
import type {
  AppSnapshot,
  BackupFile,
  IpcResult,
  PdfRequest,
  Profile,
  Settings,
  Template,
  WeekEntry,
} from '../shared/types'

/** Nur eine Instanz — sonst würden zwei Fenster dieselbe Datenbank schreiben. */
if (!app.requestSingleInstanceLock()) {
  app.quit()
}

let mainWindow: BrowserWindow | null = null

const TITLEBAR_LIGHT = { color: '#ffffff', symbolColor: '#334155', height: 40 }
const TITLEBAR_DARK = { color: '#0f172a', symbolColor: '#cbd5e1', height: 40 }

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1180,
    height: 780,
    minWidth: 900,
    minHeight: 620,
    show: false,
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#0f172a' : '#ffffff',
    titleBarStyle: 'hidden',
    titleBarOverlay: nativeTheme.shouldUseDarkColors ? TITLEBAR_DARK : TITLEBAR_LIGHT,
    icon: join(__dirname, '../../resources/icon.png'),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  })

  mainWindow.once('ready-to-show', () => mainWindow?.show())

  // Externe Links gehören in den Standardbrowser, nicht in die App.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://')) shell.openExternal(url)
    return { action: 'deny' }
  })

  if (process.env.ELECTRON_RENDERER_URL) {
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

/* ------------------------------------------------------------------ IPC ---- */

/** Kapselt jeden Handler, damit ein Fehler im Hauptprozess die App nicht abschießt. */
function handle<T>(channel: string, fn: (...args: never[]) => T | Promise<T>): void {
  ipcMain.handle(channel, async (_event, ...args): Promise<IpcResult<T>> => {
    try {
      return { ok: true, data: await fn(...(args as never[])) }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      console.error(`[ipc:${channel}]`, error)
      return { ok: false, error: message }
    }
  })
}

function registerIpc(): void {
  handle<AppSnapshot>('data:load', () => db.snapshot())
  handle<WeekEntry>('entry:save', (entry: WeekEntry) => db.saveEntry(entry))
  handle<void>('entry:delete', (id: string) => db.deleteEntry(id))
  handle<Profile>('profile:save', (profile: Profile) => db.setProfile(profile))
  handle<Settings>('settings:save', (settings: Settings) => db.setSettings(settings))
  handle<Template>('template:save', (t: Template) => db.saveTemplate(t))
  handle<void>('template:delete', (id: string) => db.deleteTemplate(id))
  handle('storage:info', () => db.storageInfo())

  handle<void>('shell:openDataDir', async () => {
    const dir = db.storageInfo().dataDir
    // Der Ordner kann fehlen, wenn ihn jemand von Hand gelöscht hat.
    // Dann legen wir ihn neu an, statt den Explorer ins Leere laufen zu lassen.
    mkdirSync(dir, { recursive: true })
    const problem = await shell.openPath(dir)
    if (problem) throw new Error(problem)
  })

  handle<void>('theme:set', (isDark: boolean) => {
    mainWindow?.setTitleBarOverlay?.(isDark ? TITLEBAR_DARK : TITLEBAR_LIGHT)
    mainWindow?.setBackgroundColor(isDark ? '#0f172a' : '#ffffff')
  })

  /* --------------------------------------------------------- Export/Import - */

  handle<string | null>('data:export', async () => {
    const snap = db.snapshot()
    const stamp = new Date().toISOString().slice(0, 10)
    const suggested = `berichtsheft-${snap.profile.fullName || 'backup'}-${stamp}.json`
      .replace(/[\\/:*?"<>|]/g, '-')
      .replace(/\s+/g, '_')

    const { canceled, filePath } = await dialog.showSaveDialog(mainWindow!, {
      title: 'Backup speichern',
      defaultPath: suggested,
      filters: [{ name: 'Berichtsheft Backup', extensions: ['json'] }],
    })
    if (canceled || !filePath) return null

    const payload: BackupFile = {
      format: 'berichtsheft-backup',
      version: 1,
      exportedAt: new Date().toISOString(),
      app: `Berichtsheft ${app.getVersion()}`,
      ...snap,
    }
    await writeFile(filePath, JSON.stringify(payload, null, 2), 'utf-8')
    db.setSettings({ ...snap.settings, lastBackupAt: new Date().toISOString() })
    return filePath
  })

  handle<AppSnapshot | null>('data:import', async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow!, {
      title: 'Backup laden',
      properties: ['openFile'],
      filters: [{ name: 'Berichtsheft Backup', extensions: ['json'] }],
    })
    if (canceled || !filePaths[0]) return null

    const raw = await readFile(filePaths[0], 'utf-8')
    const parsed = JSON.parse(raw) as Partial<BackupFile>
    if (parsed.format !== 'berichtsheft-backup' || !Array.isArray(parsed.entries)) {
      throw new Error('INVALID_BACKUP')
    }

    const current = db.snapshot()
    return db.restore({
      profile: { ...current.profile, ...parsed.profile },
      settings: { ...current.settings, ...parsed.settings },
      entries: parsed.entries,
      templates: parsed.templates ?? [],
    })
  })

  /* ---------------------------------------------------------------- PDF ---- */

  handle<string | null>('pdf:export', async (req: PdfRequest) => {
    const { entries, profile } = db.snapshot()
    const selected = req.entryIds.length
      ? entries.filter((e) => req.entryIds.includes(e.id))
      : entries

    const stamp =
      selected.length === 1
        ? `KW${String(selected[0].isoWeek).padStart(2, '0')}-${selected[0].isoYear}`
        : new Date().toISOString().slice(0, 10)
    const suggested = `Ausbildungsnachweis-${profile.fullName || 'Bericht'}-${stamp}.pdf`
      .replace(/[\\/:*?"<>|]/g, '-')
      .replace(/\s+/g, '_')

    const { canceled, filePath } = await dialog.showSaveDialog(mainWindow!, {
      title: 'PDF speichern',
      defaultPath: suggested,
      filters: [{ name: 'PDF', extensions: ['pdf'] }],
    })
    if (canceled || !filePath) return null

    const html = buildReportHtml(selected, profile, req.layout, req.language)
    await renderPdfToFile(html, filePath)
    return filePath
  })

  handle<void>('shell:showItem', (path: string) => {
    shell.showItemInFolder(path)
  })
}

/* ----------------------------------------------------------- Lifecycle ---- */

app.whenReady().then(() => {
  app.setAppUserModelId('de.berichtsheft.app')
  db.initDatabase()
  registerIpc()
  createWindow()

  nativeTheme.on('updated', () => {
    mainWindow?.setTitleBarOverlay?.(
      nativeTheme.shouldUseDarkColors ? TITLEBAR_DARK : TITLEBAR_LIGHT,
    )
  })

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

// Ein zweiter Start soll das vorhandene Fenster nach vorn holen, statt
// scheinbar wirkungslos zu bleiben.
app.on('second-instance', () => {
  if (!mainWindow) return
  if (mainWindow.isMinimized()) mainWindow.restore()
  if (!mainWindow.isVisible()) mainWindow.show()
  mainWindow.focus()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('before-quit', () => {
  db.closeDatabase()
})
