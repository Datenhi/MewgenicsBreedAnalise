const BASE = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

export interface RenderSlots {
    texture: number;
    palette: number;
    body: number;
    head: number;
    tail: number;
    legL: number;
    legR: number;
    armL: number;
    armR: number;
    earL: number;
    earR: number;
    eyeL: number;
    eyeR: number;
    browL: number;
    browR: number;
    mouth: number;
}

/* Границы кадров частей в catparts.swf (актуально для версий ресурс-пака
 * 2025–2026; проверено сравнением старого и нового паков). */
const LIMITS = {
    texture: [0, 2800],
    body: [1, 1200],
    head: [1, 1700],
    tail: [1, 1560],
    leg: [1, 1505],
    arm: [1, 1505],
    ear: [1, 1505],
    eye: [1, 1088],
    brow: [1, 1070],
    mouth: [-1, 1502],
    palette: [0, 48],
} as const;

const clamp = (v: number, [lo, hi]: readonly [number, number]) =>
    Math.min(hi, Math.max(lo, Math.round(v)));

/** Тянет id к валидным диапазонам. Возвращает null, если менять нечего. */
export function sanitizeSlots(s: RenderSlots): RenderSlots | null {
    const fixed: RenderSlots = {
        texture: clamp(s.texture, LIMITS.texture),
        palette: clamp(s.palette, LIMITS.palette),
        body: clamp(s.body, LIMITS.body),
        head: clamp(s.head, LIMITS.head),
        tail: clamp(s.tail, LIMITS.tail),
        legL: clamp(s.legL, LIMITS.leg),
        legR: clamp(s.legR, LIMITS.leg),
        armL: clamp(s.armL, LIMITS.arm),
        armR: clamp(s.armR, LIMITS.arm),
        earL: clamp(s.earL, LIMITS.ear),
        earR: clamp(s.earR, LIMITS.ear),
        eyeL: clamp(s.eyeL, LIMITS.eye),
        eyeR: clamp(s.eyeR, LIMITS.eye),
        browL: clamp(s.browL, LIMITS.brow),
        browR: clamp(s.browR, LIMITS.brow),
        mouth: clamp(s.mouth, LIMITS.mouth),
    };
    for (const k of Object.keys(fixed) as Array<keyof RenderSlots>) {
        if (fixed[k] !== s[k]) return fixed;
    }
    return null;
}

interface Pending {
    resolve: (url: string) => void;
    reject: (e: Error) => void;
}

let worker: Worker | null = null;
let initPromise: Promise<void> | null = null;
let reqSeq = 0;
const pending = new Map<number, Pending>();

function getWorker(): Worker {
    if (worker) return worker;
    worker = new Worker(new URL("./cat-render-worker.ts", import.meta.url));
    worker.onmessage = (ev: MessageEvent) => {
        const msg = ev.data;
        if (msg.type === "init-done") {
            initResolve();
            return;
        }
        if (msg.type === "init-error") {
            initReject(new Error(msg.error));
            return;
        }
        const p = pending.get(msg.id);
        if (!p) return;
        pending.delete(msg.id);
        if (msg.type === "render-done") {
            const blob = new Blob([msg.png as BlobPart], { type: "image/png" });
            p.resolve(URL.createObjectURL(blob));
        } else {
            p.reject(new Error(msg.error));
        }
    };
    worker.onerror = (e) => {
        const err = new Error(`render worker: ${e.message || "unknown"}`);
        for (const [, p] of pending) p.reject(err);
        pending.clear();
        initReject(err);
    };
    return worker;
}

let initResolve: () => void = () => {};
let initReject: (e: Error) => void = () => {};

async function ensureInit(): Promise<void> {
    if (initPromise) return initPromise;
    initPromise = new Promise<void>((resolve, reject) => {
        initResolve = resolve;
        initReject = reject;
        const w = getWorker();
        Promise.all([
            fetch(`${BASE}/catparts.swf`).then((r) => {
                if (!r.ok) throw new Error(`catparts.swf ${r.status}`);
                return r.arrayBuffer();
            }),
            fetch(`${BASE}/cat-palette.png`).then((r) => {
                if (!r.ok) throw new Error(`cat-palette.png ${r.status}`);
                return r.arrayBuffer();
            }),
        ])
            .then(([swfBuf, palBuf]) => {
                w.postMessage({
                    type: "init",
                    wasmUrl: `${BASE}/mewgenics-renderer.wasm`,
                    swfBytes: new Uint8Array(swfBuf),
                    palBytes: new Uint8Array(palBuf),
                });
            })
            .catch(reject);
    });
    return initPromise;
}

/** Кэш готовых URL: ключ состава → objectURL. */
const urlCache = new Map<string, string>();

function slotsKey(slots: RenderSlots, width: number, height: number, scale: number): string {
    return `${slots.texture}|${slots.palette}|${slots.body}|${slots.head}|${slots.tail}|${slots.legL}|${slots.legR}|${slots.armL}|${slots.armR}|${slots.earL}|${slots.earR}|${slots.eyeL}|${slots.eyeR}|${slots.browL}|${slots.browR}|${slots.mouth}|${width}x${height}x${scale}`;
}

function renderRaw(slots: RenderSlots, width: number, height: number, scale: number): Promise<string> {
    const key = slotsKey(slots, width, height, scale);
    const cached = urlCache.get(key);
    if (cached) return Promise.resolve(cached);

    const args = [
        slots.texture,
        slots.body,
        slots.head,
        slots.tail,
        slots.legL,
        slots.armL,
        slots.earL,
        slots.eyeL,
        slots.browL,
        slots.mouth,
        slots.palette,
        width,
        height,
        scale,
        slots.legR,
        slots.armR,
        slots.earR,
        slots.eyeR,
        slots.browR,
    ];

    return ensureInit().then(
        () =>
            new Promise<string>((resolve, reject) => {
                const id = ++reqSeq;
                pending.set(id, { resolve, reject });
                getWorker().postMessage({ type: "render", id, args });
            }),
    ).then((url) => {
        if (urlCache.size > 800) {
            for (const [k, u] of urlCache) {
                URL.revokeObjectURL(u);
                urlCache.delete(k);
                if (urlCache.size <= 400) break;
            }
        }
        urlCache.set(key, url);
        return url;
    });
}

async function isPngBlank(url: string): Promise<boolean> {
    try {
        const img = new Image();
        img.src = url;
        await img.decode();
        const w = 128;
        const h = 64;
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d", { willReadFrequently: true });
        if (!ctx) return false;
        ctx.clearRect(0, 0, w, h);
        ctx.drawImage(img, 0, 0, w, h);
        const data = ctx.getImageData(0, 0, w, h).data;
        for (let i = 3; i < data.length; i += 4) {
            if (data[i] > 2) return false;
        }
        return true;
    } catch {
        return false;
    }
}

export function renderCatPng(
    slots: RenderSlots,
    width = 1024,
    height = 512,
    scale = 2.8,
): Promise<string> {
    const key = slotsKey(slots, width, height, scale);
    const cached = urlCache.get(key);
    if (cached) return Promise.resolve(cached);

    return renderRaw(slots, width, height, scale).then(async (url) => {
        if (await isPngBlank(url)) {
            const fixed = sanitizeSlots(slots);
            if (fixed) {
                console.warn(
                    `[mewgenics] деталь кота отсутствует в ресурсах — рендер с ближайшими валидными`,
                    { requested: slots, used: fixed },
                );
                const url2 = await renderRaw(fixed, width, height, scale);
                urlCache.set(key, url2);
                return url2;
            }
        }
        return url;
    });
}