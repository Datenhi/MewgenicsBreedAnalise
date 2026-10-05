"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  AncestorsTree,
  DescendantsTree,
  GenderBadge,
  InbreedingBadge,
  type TreeContext,
} from "@/components/family-tree";
import { parseMewSave, type MewSaveData, type MewCat, type MewStatus } from "@/lib/mewgenics-parser";
import {
  Cat as CatIcon,
  Upload,
  FileUp,
  Loader2,
  Search,
  AlertTriangle,
  Users,
  Heart,
  Skull,
  PawPrint,
  Dna,
  Home as HomeIcon,
  RefreshCw,
} from "lucide-react";

type ViewMode = "descendants" | "ancestors";
type Filter = "alive" | "house" | "dead" | "all";

export default function Home() {
  const [data, setData] = useState<MewSaveData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedKey, setSelectedKey] = useState<number | null>(null);
  const [view, setView] = useState<ViewMode>("descendants");
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Filter>("alive");
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const applyData = useCallback((d: MewSaveData) => {
    setData(d);
    setError(null);
    // select the cat with the most descendants by default
    const catMap = new Map(d.cats.map((c) => [c.key, c]));
    const childrenMap = new Map<number, number[]>();
    for (const c of d.cats) {
      for (const p of c.parents) {
        if (p != null) {
          if (!childrenMap.has(p)) childrenMap.set(p, []);
          childrenMap.get(p)!.push(c.key);
        }
      }
    }
    const countDesc = (k: number, seen: Set<number>): number => {
      if (seen.has(k)) return 0;
      seen.add(k);
      let n = 0;
      for (const ch of childrenMap.get(k) ?? []) n += 1 + countDesc(ch, seen);
      return n;
    };
    let best: number | null = null;
    let bestCount = -1;
    const alivePool = d.cats.filter((c) => c.hasBlob && !c.dead)
    const pool = alivePool.length > 0 ? alivePool : d.cats;
    for (const c of pool) {
      const n = countDesc(c.key, new Set());
      if (n > bestCount) {
        bestCount = n;
        best = c.key;
      }
    }
    setSelectedKey(best);
  }, []);

  const uploadFile = useCallback(
    async (file: File) => {
      setLoading(true);
      setError(null);
      try {
        const bytes = new Uint8Array(await file.arrayBuffer());
        const data = await parseMewSave(bytes, file.name);
        applyData(data);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Неизвестная ошибка");
      } finally {
        setLoading(false);
      }
    },
    [applyData]
  );

  const catMap = useMemo(
    () => new Map((data?.cats ?? []).map((c) => [c.key, c])),
    [data]
  );

  const childrenMap = useMemo(() => {
    const m = new Map<number, number[]>();
    for (const c of data?.cats ?? []) {
      for (const p of c.parents) {
        if (p != null) {
          if (!m.has(p)) m.set(p, []);
          m.get(p)!.push(c.key);
        }
      }
    }
    for (const list of m.values()) list.sort((a, b) => a - b);
    return m;
  }, [data]);

  const descMemo = useMemo(() => {
    const memo = new Map<number, number>();
    const count = (k: number, path: Set<number>): number => {
      if (memo.has(k)) return memo.get(k)!;
      if (path.has(k)) return 0;
      path.add(k);
      let n = 0;
      for (const ch of childrenMap.get(k) ?? []) n += 1 + count(ch, path);
      path.delete(k);
      memo.set(k, n);
      return n;
    };
    for (const c of data?.cats ?? []) count(c.key, new Set());
    return memo;
  }, [childrenMap, data]);

  const ancestorsMemo = useMemo(() => {
    const memo = new Map<number, number>();
    const count = (k: number, path: Set<number>): number => {
      if (memo.has(k)) return memo.get(k)!;
      if (path.has(k)) return 0;
      path.add(k);
      let n = 0;
      const cat = catMap.get(k);
      for (const p of cat?.parents ?? []) {
        if (p != null) n += 1 + count(p, path);
      }
      path.delete(k);
      memo.set(k, n);
      return n;
    };
    for (const c of data?.cats ?? []) count(c.key, new Set());
    return memo;
  }, [catMap, data]);

  const ctx: TreeContext | null = useMemo(
    () =>
      data
        ? {
            catMap,
            childrenMap,
            onSelect: (k: number) => {
              setSelectedKey(k);
            },
            descendantsCount: (k: number) => descMemo.get(k) ?? 0,
          }
        : null,
    [data, catMap, childrenMap, descMemo]
  );

  const stats = useMemo(() => {
    if (!data) return null;
    const present = data.cats.filter((c) => c.inHouse && !c.dead).length;
    const founders = data.cats.filter((c) => c.parents[0] == null && c.parents[1] == null).length;
    const inbred = data.cats.filter((c) => c.inbreeding > 0).length;
    const withKids = data.cats.filter((c) => (childrenMap.get(c.key) ?? []).length > 0).length;
    const alive = data.cats.filter((c) => c.hasBlob && !c.dead).length;
    const dead = data.cats.filter((c) => c.dead).length;
    return { total: data.cats.length, present, founders, inbred, withKids, alive, dead };
  }, [data, childrenMap]);

  const filteredCats = useMemo(() => {
    if (!data) return [];
    const q = search.trim().toLowerCase();
    return data.cats.filter((c) => {
      if (filter === "alive" && (c.dead || !c.hasBlob)) return false;
      if (filter === "house" && (!c.inHouse || c.dead)) return false;
      if (filter === "dead" && !c.dead) return false;
      if (!q) return true;
      return (
        c.name.toLowerCase().includes(q) || String(c.key) === q.replace("#", "")
      );
    });
  }, [data, search, filter]);

  const selected: MewCat | null = selectedKey != null ? catMap.get(selectedKey) ?? null : null;

  return (
    <div className="flex min-h-screen flex-col bg-gradient-to-b from-amber-50/80 via-stone-50 to-stone-100">
      <header className="sticky top-0 z-20 border-b border-amber-200/70 bg-white/85 backdrop-blur">
        <div className="mx-auto flex w-full max-w-7xl items-center gap-3 px-4 py-3 sm:px-6">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-100 text-amber-700">
            <CatIcon className="h-6 w-6" />
          </div>
          <div className="min-w-0">
            <h1 className="truncate text-lg font-bold text-stone-900">
              Mewgenics · Родословная кошачьей династии
            </h1>
            <p className="truncate text-xs text-stone-500">
              Анализ файлов сохранений (.sav): коты, родители и все потомки
            </p>
          </div>
          {data && (
            <div className="ml-auto flex items-center gap-2">
              <span className="hidden max-w-48 truncate rounded-md bg-stone-100 px-2 py-1 text-xs text-stone-500 md:inline-block">
                {data.sourceName}
              </span>
              <Button variant="outline" size="sm" onClick={() => fileInputRef.current?.click()}>
                <RefreshCw className="h-4 w-4" /> Другой файл
              </Button>
            </div>
          )}
        </div>
      </header>

      <input
        ref={fileInputRef}
        type="file"
        accept=".sav"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) uploadFile(f);
          e.target.value = "";
        }}
      />

      <main className="mx-auto flex w-full max-w-7xl flex-1 flex-col px-4 py-6 sm:px-6">
        {error && (
          <Alert variant="destructive" className="mb-4 border-red-200 bg-red-50">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Не удалось обработать файл</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {!data && !loading && (
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(false);
              const f = e.dataTransfer.files?.[0];
              if (f) uploadFile(f);
            }}
            className={`flex flex-1 flex-col items-center justify-center gap-6 rounded-2xl border-2 border-dashed px-6 py-16 text-center transition-colors ${
              dragOver
                ? "border-amber-400 bg-amber-50"
                : "border-stone-300 bg-white/60"
            }`}
          >
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-amber-100 text-amber-700">
              <FileUp className="h-8 w-8" />
            </div>
            <div className="space-y-1">
              <h2 className="text-xl font-semibold text-stone-800">
                Перетащите файл сохранения сюда
              </h2>
              <p className="mx-auto max-w-md text-sm text-stone-500">
                Поддерживаются файлы <code className="rounded bg-stone-100 px-1">steamcampaign*.sav</code> из
                папки сохранений Mewgenics. Файл разбирается прямо в вашем браузере —
                он никуда не отправляется и не сохраняется.
              </p>
            </div>
            <div className="flex flex-wrap items-center justify-center gap-3">
              <Button size="lg" onClick={() => fileInputRef.current?.click()}>
                <Upload className="h-5 w-5" /> Выбрать файл .sav
              </Button>
            </div>
            <p className="max-w-lg text-xs text-stone-400">
              Парсер читает таблицу <b>cats</b> и родословную <b>pedigree</b> внутри базы SQLite
              локально, средствами WebAssembly (sql.js): имена, пол, класс, родителей и
              коэффициент инбридинга каждого кота.
            </p>
          </div>
        )}

        {loading && (
          <div className="flex flex-1 items-center justify-center py-24">
            <div className="flex flex-col items-center gap-3 text-stone-500">
              <Loader2 className="h-10 w-10 animate-spin text-amber-500" />
              <p className="text-sm">Разбираем сохранение…</p>
            </div>
          </div>
        )}

        {data && !loading && stats && ctx && (
          <>
            {data.warnings.length > 0 && (
              <Alert className="mb-4 border-amber-300 bg-amber-50">
                <AlertTriangle className="h-4 w-4 text-amber-600" />
                <AlertTitle>Предупреждение парсера</AlertTitle>
                <AlertDescription>
                  <ul className="list-disc pl-4">
                    {data.warnings.map((w, i) => (
                      <li key={i}>{w}</li>
                    ))}
                  </ul>
                </AlertDescription>
              </Alert>
            )}

            <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <StatCard icon={<Users className="h-5 w-5" />} label="Котов в родословной" value={stats.total} tone="amber" />
              <StatCard icon={<Heart className="h-5 w-5" />} label="Живых сейчас" value={stats.alive} tone="emerald" />
              <StatCard icon={<HomeIcon className="h-5 w-5" />} label="Из них в доме" value={stats.present} tone="sky" />
              <StatCard icon={<Skull className="h-5 w-5" />} label="Мёртвых (кладбище)" value={stats.dead} tone="rose" />
            </div>

            <div className="grid flex-1 gap-4 lg:grid-cols-[340px_1fr]">
              <Card className="self-start">
                <CardContent className="p-3">
                  <div className="mb-2 flex items-center gap-2">
                    <div className="relative flex-1">
                      <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" />
                      <Input
                        placeholder="Поиск: имя или номер…"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className="pl-8"
                      />
                    </div>
                  </div>
                  <div className="mb-2 flex gap-1.5">
                    {(
                      [
                        ["alive", "Живые"],
                        ["house", "В доме"],
                        ["dead", "Мёртвые"],
                        ["all", "Все"],
                      ] as Array<[Filter, string]>
                    ).map(([f, label]) => (
                      <Button
                        key={f}
                        size="sm"
                        variant={filter === f ? "default" : "outline"}
                        className={`h-7 px-2.5 text-xs ${
                          filter === f ? "bg-amber-600 hover:bg-amber-700" : ""
                        }`}
                        onClick={() => setFilter(f)}
                      >
                        {label}
                      </Button>
                    ))}
                  </div>
                  <div className="scroll-slim h-[calc(100vh-330px)] max-h-[70vh] min-h-64 overflow-y-auto overscroll-contain pr-2">
                    <ul className="space-y-1">
                      {filteredCats.map((c) => (
                        <li key={c.key}>
                          <button
                            onClick={() => setSelectedKey(c.key)}
                            className={`flex w-full items-center gap-2 rounded-lg border px-2.5 py-1.5 text-left transition-colors ${
                              selectedKey === c.key
                                ? "border-amber-400 bg-amber-100/80"
                                : "border-transparent hover:bg-amber-50"
                            }`}
                          >
                            <span className="min-w-0 flex-1 truncate text-sm font-medium text-stone-800">
                              {c.name}
                            </span>
                            <span className="shrink-0 text-[11px] text-stone-400">#{c.key}</span>
                            <GenderBadge gender={c.gender} />
                            {c.inbreeding > 0 && (
                              <span
                                className="h-2 w-2 shrink-0 rounded-full bg-rose-400"
                                title={`Инбридинг ${Math.round(c.inbreeding * 100)}%`}
                              />
                            )}
                            <StatusDot cat={c} />
                          </button>
                        </li>
                      ))}
                      {filteredCats.length === 0 && (
                        <li className="py-6 text-center text-sm text-stone-400">
                          Ничего не найдено
                        </li>
                      )}
                    </ul>
                  </div>
                </CardContent>
              </Card>

              <div className="min-w-0 space-y-4">
                {selected ? (
                  <>
                    <Card>
                      <CardContent className="p-4 sm:p-5">
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                          <h2 className="text-2xl font-bold text-stone-900">{selected.name}</h2>
                          <span className="rounded-md bg-stone-100 px-2 py-0.5 text-sm text-stone-500">
                            #{selected.key}
                          </span>
                          <GenderBadge gender={selected.gender} />
                          {selected.className && (
                            <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100">
                              {selected.className}
                            </Badge>
                          )}
                          <StatusBadge status={selected.status} room={selected.room} retired={selected.retired} donated={selected.donated} />
                          <InbreedingBadge value={selected.inbreeding} />
                        </div>

                        <div className="mt-3 flex flex-wrap gap-x-8 gap-y-2 text-sm">
                          <div>
                            <span className="text-stone-400">Родители: </span>
                            {selected.parents[0] == null && selected.parents[1] == null ? (
                              <span className="text-stone-600">неизвестны (основатель)</span>
                            ) : (
                              <span className="inline-flex flex-wrap gap-2">
                                {selected.parents.map(
                                  (p, i) =>
                                    p != null && (
                                      <Button
                                        key={i}
                                        variant="outline"
                                        size="sm"
                                        className="h-7 px-2 text-xs"
                                        onClick={() => setSelectedKey(p)}
                                      >
                                        {catMap.get(p)?.name ?? `#${p}`} · #{p}
                                      </Button>
                                    )
                                )}
                              </span>
                            )}
                          </div>
                          <div>
                            <span className="text-stone-400">Прямых детей: </span>
                            <span className="font-medium text-stone-700">
                              {(childrenMap.get(selected.key) ?? []).length}
                            </span>
                          </div>
                          <div>
                            <span className="text-stone-400">Всего потомков: </span>
                            <span className="font-medium text-amber-700">
                              {descMemo.get(selected.key) ?? 0}
                            </span>
                          </div>
                          <div>
                            <span className="text-stone-400">Предков: </span>
                            <span className="font-medium text-stone-700">
                              {ancestorsMemo.get(selected.key) ?? 0}
                            </span>
                          </div>
                        </div>
                      </CardContent>
                    </Card>

                    <Card>
                      <CardContent className="p-4 sm:p-5">
                        <Tabs
                          value={view}
                          onValueChange={(v) => setView(v as ViewMode)}
                        >
                          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                            <TabsList className="bg-stone-100">
                              <TabsTrigger value="descendants" className="gap-1.5">
                                <GitBranchIcon /> Потомки ({descMemo.get(selected.key) ?? 0})
                              </TabsTrigger>
                              <TabsTrigger value="ancestors" className="gap-1.5">
                                <LineageIcon /> Предки ({ancestorsMemo.get(selected.key) ?? 0})
                              </TabsTrigger>
                            </TabsList>
                          </div>
                          <TabsContent value="descendants" className="mt-0">
                            <div className="scroll-slim max-h-[65vh] min-h-48 overflow-y-auto overscroll-contain pr-3">
                              <DescendantsTree rootKey={selected.key} ctx={ctx} />
                            </div>
                          </TabsContent>
                          <TabsContent value="ancestors" className="mt-0">
                            <div className="scroll-slim max-h-[65vh] min-h-48 overflow-y-auto overscroll-contain pr-3">
                              <AncestorsTree rootKey={selected.key} ctx={ctx} />
                            </div>
                          </TabsContent>
                        </Tabs>
                      </CardContent>
                    </Card>
                  </>
                ) : (
                  <div className="flex h-full items-center justify-center rounded-xl border border-dashed border-stone-300 bg-white/60 p-10 text-sm text-stone-400">
                    Выберите кота из списка слева
                  </div>
                )}
              </div>
            </div>
          </>
        )}
      </main>

      <footer className="mt-auto border-t border-amber-200/70 bg-white/70 py-3">
        <div className="mx-auto w-full max-w-7xl px-4 text-center text-xs text-stone-400 sm:px-6">
          Неофициальный инструмент для сообщества Mewgenics · анализ выполняется локально в
          браузере, файлы не покидают ваш компьютер · формат сохранения восстановлен
          эвристически; если что-то отображается странно — напишите автору
        </div>
      </footer>
    </div>
  );
}

function GitBranchIcon() {
  return (
    <svg
      className="h-4 w-4"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <line x1="6" x2="6" y1="3" y2="15" />
      <circle cx="18" cy="6" r="3" />
      <circle cx="6" cy="18" r="3" />
      <path d="M18 9a9 9 0 0 1-9 9" />
    </svg>
  );
}

function LineageIcon() {
  return (
    <svg
      className="h-4 w-4"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="12" cy="5" r="3" />
      <path d="M12 8v4" />
      <circle cx="6" cy="18" r="3" />
      <circle cx="18" cy="18" r="3" />
      <path d="M12 12c0 3-6 3-6 6" />
      <path d="M12 12c0 3 6 3 6 6" />
    </svg>
  );
}

function StatusDot({ cat }: { cat: MewCat }) {
  const cls =
      cat.status === "dead"
          ? "bg-stone-700"
          : cat.status === "house"
              ? "bg-emerald-500"
              : cat.status === "adventure"
                  ? "bg-sky-500"
                  : cat.status === "gone"
                      ? "bg-stone-300"
                      : "bg-white border border-stone-300"; // unknown
  const title =
      cat.status === "dead"
          ? "Мёртв"
          : cat.status === "house"
              ? `В доме${cat.room ? ` · ${cat.room}` : ""}`
              : cat.status === "adventure"
                  ? "В походе"
                  : cat.status === "gone"
                      ? "Жив, но не в доме (продан/отдан/на пенсии)"
                      : "Нет данных (только в родословной)";
  return <span className={`h-2 w-2 shrink-0 rounded-full ${cls}`} title={title} />;
}

function StatusBadge({
                       status,
                       room,
                       retired,
                       donated,
                     }: {
  status: MewStatus;
  room: string | null;
  retired: boolean;
  donated: boolean;
}) {
  if (status === "dead")
    return (
        <Badge className="gap-1 bg-stone-800 text-stone-100 hover:bg-stone-800">
          <Skull className="h-3 w-3" /> мёртв
        </Badge>
    );
  if (status === "house")
    return (
        <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100" title="Кот сейчас живёт в доме">
          в доме{room ? ` · ${room}` : ""}
        </Badge>
    );
  if (status === "adventure")
    return (
        <Badge className="bg-sky-100 text-sky-800 hover:bg-sky-100" title="Кот сейчас в походе">
          в походе
        </Badge>
    );
  if (status === "gone") {
    const why = retired ? "на пенсии" : donated ? "пожертвован" : "продан/отдан";
    return (
        <Badge
            variant="outline"
            className="bg-stone-50 text-stone-500 border-stone-200"
            title="Кот жив, но не в доме"
        >
          не в доме · {why}
        </Badge>
    );
  }
  return (
      <Badge variant="outline" className="border-dashed bg-stone-50 text-stone-400 border-stone-300">
        нет данных
      </Badge>
  );
}

function StatCard({
  icon,
  label,
  value,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  tone: "amber" | "emerald" | "stone" | "rose" | "sky";
}) {
  const tones: Record<string, string> = {
    amber: "bg-amber-100 text-amber-700",
    emerald: "bg-emerald-100 text-emerald-700",
    sky: "bg-sky-100 text-sky-700",
    stone: "bg-stone-200 text-stone-600",
    rose: "bg-rose-100 text-rose-700",
  };
  return (
    <Card className="border-stone-200/80">
      <CardContent className="flex items-center gap-3 p-4">
        <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${tones[tone]}`}>
          {icon}
        </div>
        <div className="min-w-0">
          <div className="truncate text-2xl font-bold text-stone-900">{value}</div>
          <div className="truncate text-xs text-stone-500">{label}</div>
        </div>
      </CardContent>
    </Card>
  );
}
