let s: any = null;
let ready = false;

let memoryCache: Uint8Array | null = null;
function memory(): Uint8Array {
    if (!s) throw new Error("wasm not initialized");
    if (!memoryCache || memoryCache.byteLength === 0) {
        memoryCache = new Uint8Array(s.memory.buffer);
    }
    return memoryCache;
}

let textDecoder = new TextDecoder("utf-8", { ignoreBOM: true, fatal: true });
let decodeBytes = 0;
const RESET_AT = 2146435072;
function decodeStr(ptr: number, len: number): string {
    decodeBytes += len;
    if (decodeBytes >= RESET_AT) {
        textDecoder = new TextDecoder("utf-8", { ignoreBOM: true, fatal: true });
        decodeBytes = len;
    }
    return textDecoder.decode(memory().subarray(ptr, ptr + len));
}

/** Кладёт байты в линейную память WASM, возвращает [ptr, len]. */
function passBytes(bytes: Uint8Array): [number, number] {
    const ptr = s.__wbindgen_malloc(bytes.length * 1, 1) >>> 0;
    memory().set(bytes, ptr / 1);
    return [ptr, bytes.length];
}

function externrefGet(idx: number): unknown {
    const v = s.__wbindgen_externrefs.get(idx);
    s.__externref_table_dealloc(idx);
    return v;
}

function externrefCast(ptr: number, len: number): unknown {
    return decodeStr(ptr >>> 0, len);
}

function initExternrefTable(): void {
    const t = s.__wbindgen_externrefs;
    const base = t.grow(4);
    t.set(0, undefined);
    t.set(base + 0, null);
    t.set(base + 1, true);
    t.set(base + 2, false);
}

const importObject = {
    "./mewgenics_wasm_renderer_bg.js": {
        __proto__: null,
        __wbindgen_cast_0000000000000001: externrefCast,
        __wbindgen_init_externref_table: initExternrefTable,
    },
} as unknown as WebAssembly.Imports;

async function instantiate(source: string | Uint8Array): Promise<void> {
    let result: { instance: WebAssembly.Instance };
    const sourceAny = source as unknown;
    if (typeof sourceAny === "string") {
        // в WorkerGlobalScope относительные URL не парсятся — резолвим от origin
        const abs = new URL(sourceAny, self.location.origin).toString();
        if (typeof WebAssembly.instantiateStreaming === "function") {
            try {
                result = await WebAssembly.instantiateStreaming(
                    await fetch(abs),
                    importObject,
                );
            } catch {
                const buf = await (await fetch(abs)).arrayBuffer();
                result = await WebAssembly.instantiate(buf, importObject);
            }
        } else {
            const buf = await (await fetch(abs)).arrayBuffer();
            result = await WebAssembly.instantiate(buf, importObject);
        }
    } else {
        const bytes = sourceAny as Uint8Array;
        const buf = bytes.buffer.slice(
            bytes.byteOffset,
            bytes.byteOffset + bytes.byteLength,
        );
        result = await WebAssembly.instantiate(buf, importObject);
    }
    s = result.instance.exports;
    memoryCache = null;
    s.__wbindgen_start();
}

/** render_cat → PNG (Uint8Array). 19 аргументов — ID деталей внешности. */
function renderCat(args: number[]): Uint8Array {
    const a = s.render_cat(...args);
    if (a[3]) throw externrefGet(a[2]);
    const out = memory()
        .subarray(a[0], a[0] + a[1])
        .slice();
    s.__wbindgen_free(a[0], a[1] * 1, 1);
    return out;
}

const ctx = self as unknown as Worker;

ctx.onmessage = async (ev: MessageEvent) => {
    const msg = ev.data;
    if (msg.type === "init") {
        try {
            await instantiate(msg.wasmUrl as string);
            const swfRef = passBytes(new Uint8Array(msg.swfBytes));
            const palRef = passBytes(new Uint8Array(msg.palBytes));
            const r = s.init(swfRef[0], swfRef[1], palRef[0], palRef[1]);
            if (r && r[1]) throw externrefGet(r[0]);
            ready = true;
            ctx.postMessage({ type: "init-done" });
        } catch (e) {
            ctx.postMessage({
                type: "init-error",
                error: e instanceof Error ? e.message : String(e),
            });
        }
        return;
    }
    if (msg.type === "render") {
        if (!ready) {
            ctx.postMessage({
                type: "render-error",
                id: msg.id,
                error: "worker not initialized",
            });
            return;
        }
        try {
            const png = renderCat(msg.args as number[]);
            ctx.postMessage({ type: "render-done", id: msg.id, png }, [png.buffer]);
        } catch (e) {
            ctx.postMessage({
                type: "render-error",
                id: msg.id,
                error: e instanceof Error ? e.message : String(e),
            });
        }
        return;
    }
};
