# Contributing

Thanks for taking a look. This project is small and deliberately dependency-light — a bug
report is just as useful as a pull request.

## Reporting a bug

Open an issue and include:

- What you did, what you expected, what happened instead
- Your Windows version and how you installed the app (installer, portable, or from source)
- The app version from **Settings → About**

If the problem involves your own report data, please do **not** attach a backup file —
it contains personal information. A description or a screenshot with names removed is enough.

## Setting up

```bash
npm install
npm run dev
```

Requires Node.js 20 LTS or newer. See the [README](README.md#build-from-source) for the
step-by-step version.

## Before opening a pull request

```bash
npm run typecheck
npm run lint
npm run build
npm run selftest
```

All four must pass; CI runs the same commands on every pull request.

`npm run selftest` drives the real database and PDF modules against a throwaway
profile in the temp directory — migrations, backups, export/import and the two
PDF layouts. Your own data is never touched.

Two helpers make layout work easier. Both write into `release/`, which is ignored:

- `npm run pdf:check` renders sample reports for every layout, language and entry
  mode, as PDF and as PNG. Run it whenever you touch the PDF templates.
- `npm run uishot` opens the built interface with canned data and captures every
  screen, so a layout can be checked without clicking through the app.

## Conventions

- **TypeScript everywhere**, `strict` mode stays on
- **No new runtime dependency** unless it removes clearly more code than it adds
- Comments explain *why*, not *what* — the code already says what it does
- Code, comments and identifiers are in **German or English**; user-facing strings belong
  in `src/i18n/` and must be filled in for all three languages
- The renderer never gets direct file or database access — new capabilities go through
  `electron/preload.ts` as an explicit IPC call

## Adding a language

1. Add the code to `Language` in `shared/types.ts`
2. Add a full dictionary in `src/i18n/index.ts` — TypeScript will list any missing key
3. Add the PDF labels in `shared/pdfLabels.ts`
4. Add the locale to `LOCALES` and the display name to `LANGUAGE_NAMES`
