**English** | [Русский](./README.ru.md)
<div align="center">

# 🐱 Mewgenics Breed Analyzer

**Analysis of Mewgenics save files (.sav): the entire cat dynasty, descendant and ancestor trees — right in your browser**

[![Next.js](https://img.shields.io/badge/Next.js-16-black?logo=next.js)](https://nextjs.org)
[![React](https://img.shields.io/badge/React-19-149eca?logo=react)](https://react.dev)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178c6?logo=typescript)](https://www.typescriptlang.org)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-4-06b6d4?logo=tailwindcss)](https://tailwindcss.com)
[![sql.js](https://img.shields.io/badge/SQLite-sql.js_(WASM)-003b57?logo=sqlite)](https://sql.js.org)
[![Next.js](https://img.shields.io/badge/deploy-статика_без_сервера-22c55e)](https://nextjs.org/docs/app/building-your-application/deploying/static-exports)

</div>

---

**Mewgenics Breed Analyzer** — an unofficial community tool for the game *Mewgenics*.
Upload your `steamcampaign*.sav` save file — and the application will show every cat that has ever
lived in your house: who is alive, who is on an adventure, who is retired, and who is already in the graveyard.
For any cat, you can build a tree of all descendants and ancestors with inbreeding coefficients
on every branch.

## ✨ Features

- **📂 Save file upload** — drag & drop or file selection; `steamcampaign*.sav` files from the Mewgenics save folder are supported.
- **🔒 100% local processing** — the file is processed directly in the browser using WebAssembly (sql.js); it is **never uploaded**, stored, or logged. There is no backend or telemetry.
- **👥 Full cat list** — name, number, sex (male / female / ?), class, inbreeding coefficient.
- **💀 Status detection for every cat**:
  | Status | Meaning |
  |---|---|
  | 🟢 In the house | currently living in the house (with room shown) |
  | 🔵 On an adventure | has gone on an adventure |
  | ⚫ Dead | taken by the Organ Grinder |
  | ⚪ Not in the house | alive, but sold / given away / retired / donated |
  | ◻️ No data | appears only in the pedigree |
- **🎛 List filters** — “Alive” (**enabled by default**), “In the house”, “Dead”, “All” + instant search by cat name or number.
- **🌳 Descendant and ancestor trees** — interactive: collapsible branches, click-through navigation to any cat, counts of direct children, all descendants, and ancestors; dead cats are marked with a skull.
- **🧬 Inbreeding** — coefficient for every cat, with strong inbreeding (≥ 25%) highlighted in red.
- **📊 Summary statistics** — total cats in the pedigree, currently alive, of which are in the house, and dead.
- **🎯 Smart auto-selection** — after loading, the living cat with the most descendants is opened automatically.
- **⚠️ Honest warnings** — if some data was parsed uncertainly, the parser reports it instead of silently ignoring the issue.

## 🔒 Privacy

> A save file contains your personal game data. The application is designed
> so that it never leaves your computer:
>
> - parsing is performed **in the browser** using SQLite compiled to WebAssembly;
> - **no server, no network requests** containing the file contents, and no analytics;

## 🚀 Quick Start

**Go to GitHubPackages**
[GitHubPackages](https://datenhi.github.io/MewgenicsBreedAnalise/)

**OR RUN LOCALLY**

**Requirements:** Node.js **20.9+** (required by Next.js 16), npm or bun; any modern browser with WebAssembly.

```bash
git clone <url-вашего-repository>
cd <project folder>
npm install        # or: bun install
npm run dev        # or: npx next dev -p 3000
```

Open <http://localhost:3000> and drag the `steamcampaign01.sav` file into the window
(or select it with the button). Done — the entire pedigree is right in front of you.

Go to GitHubPackages
[GitHubPackages](https://datenhi.github.io/MewgenicsBreedAnalise/)

## 🧠 How it works

The Mewgenics save format is not officially documented and was reconstructed using
reverse engineering (the `.sav` file can be opened in any SQLite viewer):

1. **`.sav` is an SQLite 3 database** (confirmed by the `SQLite format 3` header).
2. **The `cats` table** — `key INTEGER` (cat number) and `data BLOB`: the cat blob, compressed with **LZ4**
   (two wrapper variants, decompression is a custom TypeScript implementation with no dependencies).
   Inside the decompressed blob: id, name length, name in UTF-16LE, sex (0 — male, 1 — female,
   2 — ?) and **status flags**: `0x0020` — dead, `0x0002` — retired, `0x4000` — donated.
3. **The `files` table**, `pedigree` record — the pedigree graph: a stream of int64 slots with sections;
   each record is a tuple *(child, parent1 | -1, parent2 | -1, inbreeding coefficient: double)*.
4. **`files.house_state`** — who currently lives in the house (cat key, room, coordinates);
   **`files.adventure_state`** — who has gone on an adventure.
5. All of this is handled by **sql.js** (SQLite → WebAssembly) inside the page, so not a single byte
   of the save file leaves the browser.

The key finding behind this project: the game stores **every cat from the entire playthrough** in `cats`,
including cats that died long ago. The `0x0020` flag in the blob makes it possible to distinguish living from dead cats — therefore
the list shows only current pets by default.

## 🗂 Project structure

```
src/
  app/
    page.tsx               # the entire UI: file upload, list, cat card, tree tabs.
    layout.tsx             # metadata and fonts
  components/
    family-tree.tsx        # descendant/ancestor trees, gender and inbreeding badges
    ui/                    # components shadcn/ui
  lib/
    mewgenics-parser.ts    # .sav parser: sql.js + LZ4 + binary blob formats
public/
  sql-wasm.js / sql-wasm.wasm   # SQLite WASM
```

## 🔧 Scripts

| Command | Description |
|---|---|
| `npm run dev` | Development server at <http://localhost:3000> |
| `npm run build:static` | Fully static export to `.next-static` (+ `.nojekyll`) |
| `npm run wasm:update` | Copy fresh `sql-wasm.js/.wasm` from `node_modules` to `public/` |
| `npm run lint` | ESLint check |


## 🩺 Troubleshooting

- **Port 3000 is already in use** → `npx next dev -p 3001`.
- **Windows: `npm run dev` fails** (the script uses `tee`, which is not available in cmd) → run `npx next dev -p 3000` directly.
- **“Failed to load SQL engine (sql.js)”** → `sql-wasm.js`/`sql-wasm.wasm` is missing from `public/`; run `npm run wasm:update`.
- **“This does not look like a Mewgenics save file”** → the wrong file was selected; you need `steamcampaign*.sav` from the game's save folder (not `*.sav` from other games and not a screenshot/archive).
- **Cat without a name or status** → its blob could not be decompressed (the parser will honestly report this in a warning); such a cat is visible under the “All” filter.

## ⚠️ Limitations

- The save format was reconstructed heuristically and is **not official**: after a major game patch
  the parser may need to be updated.
- Some individual blobs may fail to decompress (non-standard LZ4 wrapper) — for such cats, the status
  is marked as unknown, and they are not included in statistics.
- For cats with a very large number of descendants, the descendant tree can be very large — branches can be collapsed,
  but the initial rendering may take a noticeable amount of time.

## 📄 Disclaimer and license

Unofficial fan tool, not affiliated with the game's creators. *Mewgenics* © Edmund McMillen
and Tyler Glaiel; all rights to the game belong to their respective rights holders. The analysis is performed
entirely locally; the save format was researched for educational purposes.

The code is distributed under the **GNU GPL v3** license — [`LICENSE`](https://www.gnu.org/licenses/gpl-3.0.html).
GPL is a copyleft license: anyone who wants to modify or integrate this code into their
project must distribute the result under the same GPL v3 and provide attribution to the source.
