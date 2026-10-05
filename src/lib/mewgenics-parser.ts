export type MewStatus = "house" | "adventure" | "dead" | "gone" | "unknown";

export interface MewCat {
  key: number;
  name: string;
  gender: "M" | "F" | "D" | "?";
  inbreeding: number;
  hasBlob: boolean;
  className: string | null;
  parents: [number | null, number | null];
  alive: boolean;
  dead: boolean;
  retired: boolean;
  donated: boolean;
  inHouse: boolean;
  room: string | null;
  status: MewStatus;
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

function lz4DecompressBlock(src: Uint8Array, uncompSize: number): Uint8Array {
  const dst = new Uint8Array(uncompSize);
  let si = 0;
  let di = 0;
  const n = src.length;
  while (si < n && di < uncompSize) {
    const token = src[si++];
    let litLen = token >> 4;
    if (litLen === 15) {
      for (;;) {
        if (si >= n) throw new Error("LZ4: неожиданный конец (litLen)");
        const b = src[si++];
        litLen += b;
        if (b !== 255) break;
      }
    }
    if (si + litLen > n || di + litLen > uncompSize)
      throw new Error("LZ4: литералы вне диапазона");
    for (let i = 0; i < litLen; i++) dst[di++] = src[si++];
    if (di >= uncompSize || si >= n) break; // последняя последовательность
    if (si + 2 > n) throw new Error("LZ4: обрезанное смещение");
    const offset = src[si] | (src[si + 1] << 8);
    si += 2;
    if (offset === 0 || offset > di) throw new Error("LZ4: неверное смещение");
    let matchLen = (token & 0x0f) + 4;
    if ((token & 0x0f) === 15) {
      for (;;) {
        if (si >= n) throw new Error("LZ4: неожиданный конец (matchLen)");
        const b = src[si++];
        matchLen += b;
        if (b !== 255) break;
      }
    }
    if (di + matchLen > uncompSize) throw new Error("LZ4: match вне диапазона");
    let pos = di - offset;
    for (let i = 0; i < matchLen; i++) dst[di++] = dst[pos++];
  }
  if (di !== uncompSize) throw new Error("LZ4: размер не сошёлся");
  return dst;
}

function readU32(d: Uint8Array, off: number): number {
  return d[off] | (d[off + 1] << 8) | (d[off + 2] << 16) | ((d[off + 3] << 24) >>> 0);
}

function readU16(d: Uint8Array, off: number): number {
  return d[off] | (d[off + 1] << 8);
}

function decompressCatBlob(
    wrapped: Uint8Array
): { data: Uint8Array; variant: "A" | "B" } {
  if (wrapped.length < 4) throw new Error("Блоб слишком мал");
  const uncompLen = readU32(wrapped, 0);
  if (uncompLen === 0 || uncompLen > 50_000_000)
    throw new Error("Некорректная длина распакованного блоба");
  if (wrapped.length >= 8) {
    const compLen = readU32(wrapped, 4);
    if (compLen > 0 && compLen <= wrapped.length - 8) {
      try {
        const data = lz4DecompressBlock(
            wrapped.subarray(8, 8 + compLen),
            uncompLen
        );
        return { data, variant: "B" };
      } catch {
        /* не вариант B — пробуем A */
      }
    }
  }
  const data = lz4DecompressBlock(wrapped.subarray(4), uncompLen);
  return { data, variant: "A" };
}

const SEX_MAP: Record<number, "M" | "F" | "D"> = { 0: "M", 1: "F", 2: "D" };

interface CatMeta {
  name: string;
  gender: "M" | "F" | "D" | "?";
  dead: boolean;
  retired: boolean;
  donated: boolean;
  flagsKnown: boolean;
}

function parseCatMeta(dec: Uint8Array): CatMeta {
  let best: {
    score: number;
    nameEndRaw: number;
    name: string;
    gender: "M" | "F" | "D" | "?";
    flags: number | null;
  } | null = null;

  for (const offLen of [0x0c, 0x10]) {
    if (offLen + 4 > dec.length) continue;
    const nl = readU32(dec, offLen);
    if (nl > 128) continue;
    const start = 0x14;
    const end = start + nl * 2;
    if (end > dec.length) continue;

    const rawName = dec.slice(start, end);
    const name = new TextDecoder("utf-16le")
        .decode(rawName)
        .replace(/\u0000+$/, "");

    let gender: "M" | "F" | "D" | "?" = "?";
    let score = 0;
    const offA = end + 8;
    const offB = end + 12;
    if (offB + 2 <= dec.length) {
      const a = readU16(dec, offA);
      const b = readU16(dec, offB);
      if (a === b && a in SEX_MAP) {
        gender = SEX_MAP[a];
        score += 4;
      } else if (a in SEX_MAP || b in SEX_MAP) {
        gender = SEX_MAP[a] ?? SEX_MAP[b] ?? "?";
        score += 2;
      }
    }
    if (name) score += 1;

    const flagsOff = end + 0x10;
    const flags =
        flagsOff + 2 <= dec.length ? readU16(dec, flagsOff) : null;

    if (best === null || score > best.score) {
      best = { score, nameEndRaw: end, name, gender, flags };
    }
  }

  if (!best) {
    return { name: "", gender: "?", dead: false, retired: false, donated: false, flagsKnown: false };
  }
  const flags = best.flags;
  return {
    name: best.name,
    gender: best.gender,
    dead: flags != null ? !!(flags & 0x0020) : false,
    retired: flags != null ? !!(flags & 0x0002) : false,
    donated: flags != null ? !!(flags & 0x4000) : false,
    flagsKnown: flags != null,
  };
}

function parseHouseState(blob: Uint8Array): Map<number, string> {
  const out = new Map<number, string>();
  if (blob.length < 8) return out;
  const ver = readU32(blob, 0);
  const cnt = readU32(blob, 4);
  if (ver !== 0 || cnt > 512) return out;
  let off = 8;
  for (let i = 0; i < cnt; i++) {
    if (off + 16 > blob.length) return new Map();
    const key = readU32(blob, off);
    const lo = readU32(blob, off + 8);
    const hi = readU32(blob, off + 12);
    if (hi !== 0 || lo > 64) return new Map(); // u64 длины комнаты, но комнаты короткие
    const roomLen = lo;
    const nameOff = off + 16;
    if (nameOff + roomLen > blob.length) return new Map();
    let room = "";
    for (let i2 = 0; i2 < roomLen; i2++) room += String.fromCharCode(blob[nameOff + i2]);
    const dOff = nameOff + roomLen;
    if (dOff + 24 > blob.length) return new Map();
    out.set(key, room);
    off = dOff + 24;
  }
  // блоб должен быть исчерпан точно — иначе формат не совпал
  if (off !== blob.length) return new Map();
  return out;
}

/** files.adventure_state (если есть): ключи котов, ушедших в поход. */
function parseAdventureStateKeys(blob: Uint8Array): number[] {
  if (blob.length < 8) return [];
  const cnt = readU32(blob, 4);
  if (cnt > 8) return [];
  let off = 8;
  const keys: number[] = [];
  for (let i = 0; i < cnt; i++) {
    if (off + 8 > blob.length) return [];
    const lo = readU32(blob, off);
    const hi = readU32(blob, off + 4);
    const key = hi !== 0 ? hi : lo;
    if (key <= 0 || key > 1_000_000) return [];
    keys.push(key);
    off += 8;
  }
  return keys;
}

/* ------------------------------------------------------------------ */
/* Разбор бинарных блобов                                             */
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
      chars.push(String.fromCharCode(lo));
      break;
    } else {
      break;
    }
    if (chars.length > 48) break;
  }
  return chars.join("").trim();
}

function extractGenderFallback(d: Uint8Array): "M" | "F" | "?" {
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
/* Главная функция: разбираем .sav                                    */
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
  let houseState: Uint8Array | null = null;
  let adventureState: Uint8Array | null = null;

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

    const fileKeys = ["pedigree", "house_state", "adventure_state"];
    for (const fk of fileKeys) {
      try {
        const st = db.prepare("SELECT data FROM files WHERE key = ?");
        try {
          st.bind([fk]);
          if (st.step()) {
            const d = st.get()[0];
            if (d instanceof Uint8Array) {
              if (fk === "pedigree") pedigree = d;
              else if (fk === "house_state") houseState = d;
              else adventureState = d;
            }
          }
        } finally {
          st.free();
        }
      } catch {

      }
    }
  } finally {
    db.close();
  }

  // parse blobs
  interface BlobInfo {
    name: string;
    gender: "M" | "F" | "D" | "?";
    className: string | null;
    dead: boolean;
    retired: boolean;
    donated: boolean;
    flagsKnown: boolean;
  }
  const blobs = new Map<number, BlobInfo>();
  let decompressFailures = 0;
  for (const row of catsRows) {
    let info: BlobInfo;
    try {
      const { data: dec } = decompressCatBlob(row.data);
      const meta = parseCatMeta(dec);
      info = {
        name: meta.name || `Кот #${row.key}`,
        gender: meta.gender,
        className: extractClass(dec),
        dead: meta.dead,
        retired: meta.retired,
        donated: meta.donated,
        flagsKnown: meta.flagsKnown,
      };
    } catch {
      decompressFailures++;
      info = {
        name: extractCatName(row.data) || `Кот #${row.key}`,
        gender: extractGenderFallback(row.data),
        className: extractClass(row.data),
        dead: false,
        retired: false,
        donated: false,
        flagsKnown: false,
      };
    }
    blobs.set(row.key, info);
  }
  if (decompressFailures > 0) {
    warnings.push(
        `Не удалось распаковать ${decompressFailures} блоб(ов): статус для этих котов неизвестен.`
    );
  }

  let houseRooms = new Map<number, string>();
  if (houseState) {
    houseRooms = parseHouseState(houseState);
    if (houseRooms.size === 0) {
      warnings.push(
          "Не удалось разобрать house_state — отметки «в доме» могут быть неточными."
      );
    }
  }
  const adventureKeys = new Set<number>(
      adventureState ? parseAdventureStateKeys(adventureState) : []
  );

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
    const dead = blob?.dead ?? false;
    const inHouse = houseRooms.has(key);
    const room = houseRooms.get(key) ?? null;
    const onAdventure = adventureKeys.has(key);
    let status: MewStatus;
    if (dead) status = "dead";
    else if (inHouse) status = "house";
    else if (onAdventure) status = "adventure";
    else if (blob) status = "gone";
    else status = "unknown";
    cats.push({
      key,
      name: blob?.name || `Кот #${key}`,
      gender: blob?.gender ?? "?",
      inbreeding: rec ? rec.inb : 0,
      hasBlob: !!blob,
      className: blob?.className ?? null,
      parents: rec ? [rec.p1, rec.p2] : [null, null],
      alive: !dead && !!blob && blob.flagsKnown,
      dead,
      retired: blob?.retired ?? false,
      donated: blob?.donated ?? false,
      inHouse,
      room,
      status,
    });
  }

  if (cats.length === 0) {
    throw new Error(
      "В файле не найдено котов. Убедитесь, что это сохранение Mewgenics (steamcampaign*.sav)."
    );
  }

  return { sourceName, cats, warnings };
}
