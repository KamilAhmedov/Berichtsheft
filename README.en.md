<div align="center">

<img src="resources/icon.png" alt="Berichtsheft" width="96">

# Berichtsheft

**The German training record (Ausbildungsnachweis) as a desktop app — offline, no account, with PDF export.**

[Deutsch](README.md) · [English](README.en.md) · [Türkçe](README.tr.md)

</div>

---

> **Note:** This application was built with AI assistance — concept, code and
> documentation were developed together with Claude (Anthropic).

## What is this?

Every apprentice in Germany has to keep an **Ausbildungsnachweis** — commonly called the
*Berichtsheft*. Each week you record what you did at the company and what you covered at
vocational school. Your trainer signs it, and without a complete record you are not
admitted to the IHK final exam.

In practice this runs on a Word template or a paper booklet. Weeks pile up, the layout
drifts, and three months end up being written in a single evening.

This app makes it straightforward: pick a week, write it down, done. Calendar weeks and
training years are derived automatically, missing weeks are surfaced, and a single click
produces a PDF in the classic IHK style.

## Screenshots

<table>
  <tr>
    <td width="50%"><img src="docs/screenshots/01-uebersicht.png" alt="Overview with progress and open weeks"></td>
    <td width="50%"><img src="docs/screenshots/02-wochenliste.png" alt="List of all weekly reports with search and filters"></td>
  </tr>
  <tr>
    <td align="center"><sub>Overview — progress, current week and open weeks</sub></td>
    <td align="center"><sub>Weeks — every report with search, filters and status</sub></td>
  </tr>
  <tr>
    <td width="50%"><img src="docs/screenshots/03-wochenbericht.png" alt="Weekly report in daily entry mode"></td>
    <td width="50%"><img src="docs/screenshots/04-einstellungen.png" alt="Settings in dark theme"></td>
  </tr>
  <tr>
    <td align="center"><sub>Weekly report — daily entry with snippets</sub></td>
    <td align="center"><sub>Settings — dark theme, language, data location</sub></td>
  </tr>
  <tr>
    <td width="50%"><img src="docs/screenshots/05-pdf-klassisch.png" alt="PDF output in the classic layout"></td>
    <td width="50%"><img src="docs/screenshots/06-pdf-modern.png" alt="PDF output in the modern layout"></td>
  </tr>
  <tr>
    <td align="center"><sub>PDF — classic layout, following the IHK form</sub></td>
    <td align="center"><sub>PDF — modern layout, clearer typography</sub></td>
  </tr>
</table>

## Features

- **Two entry modes**: daily (one row per working day, with leave/sick/public holiday) or weekly prose
- **Weekly reports** covering company work, vocational school and instruction — each with hours
- **ISO 8601 calendar weeks** — period and training year are calculated for you
- **Gap detection** — past weeks without an entry are highlighted on the overview
- **PDF export** in two layouts: *Classic* (sober, like the printed form) and *Modern*
- **Snippets** for recurring tasks — write once, insert with a click
- **Per-week status**: draft → submitted → signed
- **Three languages**: Deutsch, English, Türkçe
- **Light and dark theme**, optionally following the Windows setting
- **Export and import** as a single JSON file — moving to another machine takes two steps
- **Automatic backups** — the last ten states, listed in the app and restorable with one click
- **Spell checking** in the interface language, suggestions on right-click

## Privacy

The app has **no server, no account and no network access**. Everything lives in a SQLite
file on your own machine:

```
%APPDATA%\Berichtsheft\
├── data\berichtsheft.db     ← all reports
└── backups\                 ← the last ten automatic backups
```

Open that folder from within the app via **Settings → Data → Open folder**.
Uninstalling the app does not delete it.

## Installation

### Download a released build (recommended)

Two files are published under [**Releases**](https://github.com/KamilAhmedov/Berichtsheft/releases):

| File | Purpose |
| --- | --- |
| `Berichtsheft-Setup-1.1.0.exe` | Regular installer with Start menu and desktop shortcuts |
| `Berichtsheft-1.1.0-portable.exe` | No installation — double-click to run, works from a USB stick |

> **About the Windows SmartScreen warning**
> The installers are not signed with a paid certificate, so Windows shows
> "Windows protected your PC" on first launch. Click **More info**, then
> **Run anyway**. The full source is public here, and the installers are built from
> exactly this source by GitHub Actions.

### Build from source

No programming experience required — every step is listed.

**1. Install Node.js**

Node.js is the runtime used to build the app. Download the **LTS** version from
[nodejs.org](https://nodejs.org) and install it (all installer defaults are fine).
Afterwards restart your computer, or at least close every open terminal window.

To verify, open a new terminal and run:

```bash
node -v
```

A version number such as `v20.10.0` means you are set.

**2. Get the source**

With Git:

```bash
git clone https://github.com/KamilAhmedov/Berichtsheft.git
cd berichtsheft
```

Without Git: use the green **Code** button at the top of this page → **Download ZIP**,
extract it and open the resulting folder.

**3. Open a terminal in that folder**

In File Explorer, navigate into the project folder, then **Shift + right-click** on empty
space and choose **Open PowerShell window here**. Alternatively type `powershell` into the
Explorer address bar and press Enter.

**4. Install dependencies**

```bash
npm install
```

This downloads the required packages and takes a few minutes the first time.
`npm warn deprecated` messages are normal and can be ignored.

**5. Run the app**

```bash
npm run dev
```

The window opens on its own, and source changes are applied immediately.

**6. Build the installers (optional)**

```bash
npm run dist
```

The resulting `.exe` files land in the `release/` folder.

### Troubleshooting

| Message | Cause and fix |
| --- | --- |
| `npm is not recognized` | Node.js is missing, or the terminal was already open during installation. Close all terminals and open a new one. |
| `Running scripts is disabled on this system` | PowerShell blocks scripts. Run once: `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned` |
| Install fails on `better-sqlite3` | No prebuilt binary for this Node version. Use the LTS release from step 1. |
| The window stays blank | Run `npm run build`, then `npm start`. |

## Tech

| Area | Used |
| --- | --- |
| Runtime | Electron 33 |
| Interface | React 18, TypeScript, Tailwind CSS, Radix UI |
| Data | SQLite via better-sqlite3, WAL mode |
| Build | electron-vite, electron-builder |
| PDF | Chromium `printToPDF` — full Unicode without embedding font files |

### Layout

```
berichtsheft/
├── electron/           Main process: window, database, file dialogs, PDF
│   ├── main.ts         Lifecycle and IPC endpoints
│   ├── db.ts           SQLite access, migrations, backups
│   ├── pdf.ts          HTML templates and PDF generation
│   └── preload.ts      The single bridge to the renderer
├── shared/             Used by both sides
│   ├── types.ts        Data model
│   ├── dates.ts        ISO 8601 calendar weeks, no third-party library
│   └── pdfLabels.ts    Labels used inside the PDF
├── src/                Renderer
│   ├── components/     Views and UI building blocks
│   ├── hooks/useApp    State, translations, notifications
│   ├── i18n/           Dictionaries for de, en, tr
│   └── lib/            Week logic and helpers
└── scripts/            Generates the app icon without an image editor
```

The renderer has neither Node.js nor file access. Everything goes through the narrow
surface in `preload.ts`, which keeps the attack surface small and makes every data access
traceable in one place.

`electron/db.ts` sits behind a deliberately small set of functions. Adding cloud sync later
would mean replacing those functions only, without touching the interface.

## Planned

- Selecting several weeks for a combined export
- A monthly view as a third entry mode
- Snippets scoped per training year instead of globally
- macOS and Linux packages

## Contributing

Bug reports and suggestions are welcome — see [CONTRIBUTING.md](CONTRIBUTING.md).

## License

[MIT](LICENSE) — free to use and adapt.
