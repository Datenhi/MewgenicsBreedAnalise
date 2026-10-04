/**
 * Mewgenics .sav parser — полностью клиентский (sql.js / WebAssembly)
 *
 * Reverse-engineered format:
 *  - .sav is an SQLite 3 database
 *  - table `cats`:  key INTEGER (cat id 1..N), data BLOB (per-cat binary record)
 *  - table `files`: key TEXT, data BLOB; row 'pedigree' holds the family graph
 *
 * Pedigree blob layout (little-endian, int64 slots):
 *  [-11 marker][recordCount][?][bitstream ...] then records:
 *  (child:int64, parent1:int64|-1, parent2:int64|-1, inbreeding:double)
 *  Interleaved meta-pairs (huge values) are skipped by re-sync scanning.
 *
 * Cat blob layout (relevant fields):
 *  [0]int32 seed-ish  [4]int32 version (5090)  [8]0x00 [9..17)random seed
 *  [17]uint8 nameLen  [21]flagByte  [22..]name in UTF-16LE
 *  (name may end with a single-byte last char — "2n-1" scheme)
 *  ASCII 'male'/'female' marks gender somewhere later in the blob.
 *
 * SQL-движок (sql.js) загружается динамически через <script> из /public,
 * поэтому файл сохранения разбирается прямо в браузере и никуда не отправляется.
 */

export interface MewCat {
  key: number;
  name: string;
  gender: "M" | "F" | "?";
  inbreeding: number;
  hasBlob: boolean;
  className: string | null;
  parents: [number | null, number | null];
}

export interface MewSaveData {
  sourceName: string;
  cats: MewCat[];
  warnings: string[];
}

import type { Database, SqlJsStatic } from "sql.js";

/* ------------------------------------------------------------------ */
/* Загрузка sql.js (WASM) в браузере                                   */
/* ------------------------------------------------------------------ */

const SQL_JS_BASE = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

declare global {
  interface Window {
    initSqlJs?: (config: {
      locateFile: (file: string) => string;
    }) => Promise<SqlJsStatic>;
  }
}

function loadScriptOnce(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(
      `script[data-sqljs="${src}"]`
    );
    if (existing) {
      if (existing.dataset.loaded === "1") return resolve();
      existing.addEventListener("load", () => resolve());
      existing.addEventListener("error", () =>
        reject(new Error("Не удалось загрузить SQL-движок (sql.js)"))
      );
      return;
    }
    const s = document.createElement("script");
    s.src = src;
    s.async = true;
    s.dataset.sqljs = src;
    s.addEventListener("load", () => {
      s.dataset.loaded = "1";
      resolve();
    });
    s.addEventListener("error", () =>
      reject(new Error("Не удалось загрузить SQL-движок (sql.js)"))
    );
    document.head.appendChild(s);
  });
}

let sqlPromise: Promise<SqlJsStatic> | null = null;

async function getSQL(): Promise<SqlJsStatic> {
  if (typeof window === "undefined") {
    throw new Error("Разбор файла доступен только в браузере");
  }
  if (!sqlPromise) {
    sqlPromise = loadScriptOnce(`${SQL_JS_BASE}/sql-wasm.js`).then(() => {
      const init = window.initSqlJs;
      if (!init) throw new Error("SQL-движок не инициализировался");
      return init({ locateFile: (file) => `${SQL_JS_BASE}/${file}` });
    });
  }
  return sqlPromise;
}

/* ------------------------------------------------------------------ */
/* Разбор бинарных блобов (чистые функции, без Node API)               */
/* ------------------------------------------------------------------ */

const KNOWN_CLASSES = [
  "Necromancer",
  "Tinkerer",
  "Colorless",
  "Fighter",
  "Hunter",
  "Thief",
  "Butcher",
  "Druid",
  "Medic",
  "Mage",
  "Tank",
] as const;

const NONE = -1n;
const MARKER = -11n; // section marker in pedigree blob

function isPrintableByte(b: number): boolean {
  return b >= 32 && b < 127;
}

/** Extract the cat name from its blob. */
export function extractCatName(d: Uint8Array): string {
  const len = d.length;
  // find first o in [20..40] where d[o] printable and d[o+1] === 0
  let start = -1;
  for (let o = 20; o < Math.min(40, len - 2); o++) {
    if (isPrintableByte(d[o]) && d[o + 1] === 0) {
      start = o;
      break;
    }
  }
  if (start < 0) return "";

  const chars: string[] = [];
  let o = start;
  while (o < len) {
    const lo = d[o];
    const hi = o + 1 < len ? d[o + 1] : -1;
    if (hi === 0 && isPrintableByte(lo)) {
      chars.push(String.fromCharCode(lo));
      o += 2;
    } else if (isPrintableByte(lo)) {
      // "2n-1" scheme: last char stored without its zero high byte
      chars.push(String.fromCharCode(lo));
      break;
    } else {
      break;
    }
    if (chars.length > 48) break;
  }
  return chars.join("").trim();
}

function extractGender(d: Uint8Array): "M" | "F" | "?" {
  // search raw bytes for 'female' first, then 'male'
  const pat = (s: string): number[] => Array.from(s, (c) => c.charCodeAt(0));
  const contains = (patv: number[]): number => {
    outer: for (let i = 0; i + patv.length <= d.length; i++) {
      for (let j = 0; j < patv.length; j++) if (d[i + j] !== patv[j]) continue outer;
      return i;
    }
    return -1;
  };
  if (contains(pat("female")) >= 0) return "F";
  if (contains(pat("male")) >= 0) return "M";
  return "?";
}

function extractClass(d: Uint8Array): string | null {
  const bytes = d;
  let best: { cls: string; pos: number } | null = null;
  for (const cls of KNOWN_CLASSES) {
    const pat = Array.from(cls, (c) => c.charCodeAt(0));
    outer: for (let i = 0; i + pat.length <= bytes.length; i++) {
      for (let j = 0; j < pat.length; j++) if (bytes[i + j] !== pat[j]) continue outer;
      if (!best || i > best.pos || (i === best.pos && cls.length > best.cls.length)) {
        best = { cls, pos: i };
      }
    }
  }
  return best ? best.cls : null;
}

interface PedigreeParse {
  records: Map<number, { p1: number | null; p2: number | null; inb: number }>;
  score: number;
}

function tryParsePedigree(vals: bigint[], start: number, count: number): PedigreeParse {
  const dv = new DataView(new ArrayBuffer(8));
  const records = new Map<number, { p1: number | null; p2: number | null; inb: number }>();
  let i = start;
  const isId = (v: bigint): boolean => v >= 1n && v <= 9999n;
  const isNoneOrId = (v: bigint): boolean => v === NONE || isId(v);
  const isInb = (v: bigint): boolean => {
    if (v === 0n) return true;
    dv.setBigUint64(0, BigInt.asUintN(64, v), true);
    const f = dv.getFloat64(0, true);
    return Number.isFinite(f) && f >= 0.000001 && f <= 1.0;
  };

  while (i + 3 < vals.length && records.size < count) {
    // stop at the next section marker (-11 followed by plausible count)
    if (
      vals[i] === MARKER &&
      i + 1 < vals.length &&
      vals[i + 1] >= 1n &&
      vals[i + 1] <= 100000n
    )
      break;
    const a = vals[i];
    const b = vals[i + 1];
    const c = vals[i + 2];
    const e = vals[i + 3];
    if (isId(a) && isNoneOrId(b) && isNoneOrId(c) && isInb(e)) {
      dv.setBigUint64(0, BigInt.asUintN(64, e), true);
      const inb = e === 0n ? 0 : dv.getFloat64(0, true);
      const child = Number(a);
      if (!records.has(child)) {
        records.set(child, {
          p1: b === NONE ? null : Number(b),
          p2: c === NONE ? null : Number(c),
          inb,
        });
      }
      i += 4;
    } else {
      i += 1;
    }
  }
  return { records, score: records.size };
}

function parsePedigreeBlob(data: Uint8Array): {
  records: Map<number, { p1: number | null; p2: number | null; inb: number }>;
  declaredCount: number;
} {
  const n = Math.floor(data.length / 8);
  const vals: bigint[] = new Array(n);
  const dv = new DataView(data.buffer, data.byteOffset, data.byteLength);
  for (let i = 0; i < n; i++) vals[i] = dv.getBigInt64(i * 8, true);

  // candidate section starts: int64 == -11 (marker) followed by plausible count
  const candidates: Array<{ start: number; count: number }> = [];
  for (let i = 0; i + 1 < n; i++) {
    if (vals[i] === MARKER && vals[i + 1] >= 1n && vals[i + 1] <= 100000n) {
      candidates.push({ start: i + 2, count: Number(vals[i + 1]) });
    }
  }
  let best: PedigreeParse | null = null;
  let declaredCount = 0;
  for (const cand of candidates) {
    const res = tryParsePedigree(vals, cand.start, cand.count);
    // prefer parses that reached the declared count
    const better =
      !best ||
      res.score > best.score ||
      (res.score === best.score && res.records.size === cand.count);
    if (better) {
      best = res;
      declaredCount = cand.count;
    }
    if (best && best.score === cand.count && best.score >= cand.count) break;
  }
  return { records: best ? best.records : new Map(), declaredCount };
}

/* ------------------------------------------------------------------ */
/* Главная функция: разбираем .sav (SQLite) целиком в браузере          */
/* ------------------------------------------------------------------ */

export async function parseMewSave(
  dbBytes: Uint8Array,
  sourceName: string
): Promise<MewSaveData> {
  const warnings: string[] = [];

  // quick sanity check: SQLite header
  const header = new TextDecoder("latin1").decode(dbBytes.subarray(0, 16));
  if (!header.startsWith("SQLite format 3")) {
    throw new Error(
      "Это не похоже на сохранение Mewgenics: файл должен быть базой данных SQLite (.sav)."
    );
  }

  const SQL = await getSQL();
  let db: Database;
  try {
    db = new SQL.Database(dbBytes);
  } catch {
    throw new Error(
      "Не удалось открыть файл как базу данных SQLite. Файл повреждён или это не .sav сохранение."
    );
  }

  let catsRows: Array<{ key: number; data: Uint8Array }> = [];
  let pedigree: Uint8Array | null = null;

  try {
    let stmt: ReturnType<Database["prepare"]> | null = null;
    try {
      stmt = db.prepare("SELECT key, data FROM cats ORDER BY key");
      while (stmt.step()) {
        const row = stmt.get();
        const key = Number(row[0]);
        const data = row[1];
        if (Number.isFinite(key) && data instanceof Uint8Array) {
          catsRows.push({ key, data });
        }
      }
    } catch {
      throw new Error(
        "В файле нет таблицы cats — это не сохранение Mewgenics. Нужен файл steamcampaign*.sav из папки сохранений игры."
      );
    } finally {
      stmt?.free();
    }

    try {
      const pedStmt = db.prepare("SELECT data FROM files WHERE key = 'pedigree'");
      try {
        if (pedStmt.step()) {
          const d = pedStmt.get()[0];
          if (d instanceof Uint8Array) pedigree = d;
        }
      } finally {
        pedStmt.free();
      }
    } catch {
      pedigree = null;
    }
  } finally {
    db.close();
  }

  // parse blobs
  interface BlobInfo {
    name: string;
    gender: "M" | "F" | "?";
    className: string | null;
  }
  const blobs = new Map<number, BlobInfo>();
  for (const row of catsRows) {
    blobs.set(row.key, {
      name: extractCatName(row.data),
      gender: extractGender(row.data),
      className: extractClass(row.data),
    });
  }

  // parse pedigree
  let pedRecords = new Map<number, { p1: number | null; p2: number | null; inb: number }>();
  let declared = 0;
  if (pedigree) {
    const parsed = parsePedigreeBlob(pedigree);
    pedRecords = parsed.records;
    declared = parsed.declaredCount;
  } else {
    warnings.push("В файле не найдена таблица родословной (files.pedigree).");
  }

  // sanity check
  if (declared > 0 && pedRecords.size < declared * 0.9) {
    warnings.push(
      `Прочитано записей родословной: ${pedRecords.size} из ${declared}. Формат файла может отличаться.`
    );
  }

  // merge: keys from both sources
  const keys = new Set<number>([...blobs.keys(), ...pedRecords.keys()]);
  const cats: MewCat[] = [];
  for (const key of [...keys].sort((a, b) => a - b)) {
    const blob = blobs.get(key);
    const rec = pedRecords.get(key);
    if (!blob && !rec) continue;
    cats.push({
      key,
      name: blob?.name || `Кот #${key}`,
      gender: blob?.gender ?? "?",
      inbreeding: rec ? rec.inb : 0,
      hasBlob: !!blob,
      className: blob?.className ?? null,
      parents: rec ? [rec.p1, rec.p2] : [null, null],
    });
  }

  if (cats.length === 0) {
    throw new Error(
      "В файле не найдено котов. Убедитесь, что это сохранение Mewgenics (steamcampaign*.sav)."
    );
  }

  return { sourceName, cats, warnings };
}
