"use client";

import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  ChevronDown,
  ChevronRight,
  GitBranch,
  MousePointerClick,
  Skull,
} from "lucide-react";
import type { MewCat } from "@/lib/mewgenics-parser";

export interface TreeContext {
  catMap: Map<number, MewCat>;
  childrenMap: Map<number, number[]>;
  onSelect: (key: number) => void;
  descendantsCount: (key: number) => number;
}

export function GenderBadge({ gender }: { gender: MewCat["gender"] }) {
  if (gender === "M")
    return (
      <Badge
        variant="outline"
        className="bg-sky-50 text-sky-700 border-sky-200 shrink-0"
        title="Самец"
      >
        М
      </Badge>
    );
  if (gender === "F")
    return (
      <Badge
        variant="outline"
        className="bg-rose-50 text-rose-700 border-rose-200 shrink-0"
        title="Самка"
      >
        Ж
      </Badge>
    );
  if (gender === "D")
    return (
        <Badge
            variant="outline"
            className="bg-violet-50 text-violet-700 border-violet-200 shrink-0"
            title="Дитто (может быть и самцом, и самкой)"
        >
          Д
        </Badge>
    );
  return (
    <Badge variant="outline" className="text-muted-foreground shrink-0" title="Пол неизвестен">
      ?
    </Badge>
  );
}

export function InbreedingBadge({ value }: { value: number }) {
  if (value <= 0) return null;
  const pct = value < 0.01 ? value.toFixed(4) : Math.round(value * 1000) / 10;
  const strong = value >= 0.25;
  return (
    <Badge
      variant="outline"
      title="Коэффициент инбридинга (доля генов, полученных от общих предков родителей)"
      className={
        strong
          ? "bg-red-50 text-red-700 border-red-300 shrink-0"
          : "bg-amber-50 text-amber-700 border-amber-300 shrink-0"
      }
    >
      инбридинг {pct}%
    </Badge>
  );
}

function DeadBadge() {
  return (
      <Badge
          variant="outline"
          className="gap-1 border-stone-300 bg-stone-200 text-stone-700 shrink-0"
          title="Кот мёртв (флаг 0x0020 в сохранении) — числится на кладбище"
      >
        <Skull className="h-3 w-3" />
        мёртв
      </Badge>
  );
}

function GoneBadge() {
  return (
      <Badge
          variant="outline"
          className="bg-stone-100 text-stone-500 border-stone-200 shrink-0"
          title="Кот жив, но его нет в доме (продан, отдан, на пенсии) — статус из сохранения"
      >
        не в доме
      </Badge>
  );
}

function AdventureBadge() {
  return (
      <Badge
          variant="outline"
          className="bg-sky-50 text-sky-700 border-sky-200 shrink-0"
          title="Кот сейчас в походе (files.adventure_state)"
      >
        в походе
      </Badge>
  );
}

function UnknownBadge() {
  return (
      <Badge
          variant="outline"
          className="bg-stone-100 text-stone-400 border-dashed border-stone-300 shrink-0"
          title="Кота нет в таблице cats — он известен только по родословной, статус определить нельзя"
      >
        нет данных
      </Badge>
  );
}

function CatChip({
  catKey,
  ctx,
  label,
}: {
  catKey: number;
  ctx: TreeContext;
  label?: string;
}) {
  const cat = ctx.catMap.get(catKey);
  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        ctx.onSelect(catKey);
      }}
      className="inline-flex items-center gap-1 text-xs text-stone-500 hover:text-amber-700 underline decoration-dotted underline-offset-2"
      title={cat ? `Выбрать ${cat.name}` : `Выбрать кота #${catKey}`}
    >
      <MousePointerClick className="h-3 w-3" />
      {label ?? cat?.name ?? `#${catKey}`}
    </button>
  );
}

function CatRow({
  cat,
  ctx,
  otherParent,
  depthColor,
}: {
  cat: MewCat;
  ctx: TreeContext;
  otherParent?: number | null;
  depthColor?: string;
}) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => ctx.onSelect(cat.key)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          ctx.onSelect(cat.key);
        }
      }}
      className={`group flex w-full cursor-pointer items-center gap-2 rounded-lg border px-2.5 py-1.5 text-left transition-colors hover:border-amber-300 hover:bg-amber-50/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 ${
          cat.dead
              ? "border-stone-200 bg-stone-100/80 opacity-70 grayscale-[30%]"
              : depthColor ?? "bg-white border-stone-200"
      }`}
    >
      <span className="font-medium text-stone-800 group-hover:text-amber-900 truncate">
        {cat.name}
      </span>
      <span className="text-[11px] text-stone-400 shrink-0">#{cat.key}</span>
      <GenderBadge gender={cat.gender} />
      {cat.status === "dead" ? (
          <DeadBadge />
      ) : cat.status === "adventure" ? (
          <AdventureBadge />
      ) : cat.status === "gone" ? (
          <GoneBadge />
      ) : cat.status === "unknown" ? (
          <UnknownBadge />
      ) : null}
      <span className="ml-auto flex items-center gap-1.5 shrink-0">
        {otherParent != null && (
          <span className="text-[11px] text-stone-400 whitespace-nowrap">
            с <CatChip catKey={otherParent} ctx={ctx} />
          </span>
        )}
        {cat.className && (
          <Badge variant="secondary" className="text-[10px] shrink-0">
            {cat.className}
          </Badge>
        )}
        <InbreedingBadge value={cat.inbreeding} />
      </span>
    </div>
  );
}

function DescendantNode({
  catKey,
  ctx,
  depth,
  openMap,
  toggle,
  otherParent,
}: {
  catKey: number;
  ctx: TreeContext;
  depth: number;
  openMap: Record<string, boolean>;
  toggle: (k: string) => void;
  otherParent?: number | null;
}) {
  const cat = ctx.catMap.get(catKey);
  if (!cat) return null;
  const childKeys = ctx.childrenMap.get(catKey) ?? [];
  const openKey = `d:${catKey}`;
  const open = openMap[openKey] ?? depth < 3;

  return (
    <li className="relative pl-4">
      <div className="flex items-center gap-1.5 py-0.5">
        {childKeys.length > 0 ? (
          <Button
            variant="ghost"
            size="icon"
            className="h-5 w-5 shrink-0 text-stone-500 hover:text-amber-700"
            onClick={() => toggle(openKey)}
            aria-label={open ? "Свернуть ветку" : "Развернуть ветку"}
          >
            {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          </Button>
        ) : (
          <span className="w-5 shrink-0" />
        )}
        <div className="min-w-0 flex-1">
          <CatRow
            cat={cat}
            ctx={ctx}
            otherParent={otherParent}
            depthColor={depth === 0 ? "bg-amber-50 border-amber-300" : undefined}
          />
        </div>
        {childKeys.length > 0 && (
          <span className="shrink-0 text-[11px] text-stone-400 whitespace-nowrap">
            {childKeys.length} дет. · всего потомков {ctx.descendantsCount(catKey)}
          </span>
        )}
      </div>
      {open && childKeys.length > 0 && (
        <ul className="ml-5 border-l-2 border-amber-200/80">
          {childKeys.map((ck) => {
            const child = ctx.catMap.get(ck);
            const other = child
              ? child.parents[0] === catKey
                ? child.parents[1]
                : child.parents[0]
              : null;
            return (
              <DescendantNode
                key={ck}
                catKey={ck}
                ctx={ctx}
                depth={depth + 1}
                openMap={openMap}
                toggle={toggle}
                otherParent={other}
              />
            );
          })}
        </ul>
      )}
    </li>
  );
}

export function DescendantsTree({
  rootKey,
  ctx,
}: {
  rootKey: number;
  ctx: TreeContext;
}) {
  const [openMap, setOpenMap] = useState<Record<string, boolean>>({});
  const toggle = (k: string) =>
    setOpenMap((m) => ({ ...m, [k]: !(m[k] ?? true) }));

  const direct = ctx.childrenMap.get(rootKey) ?? [];
  if (direct.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-stone-300 bg-stone-50 px-6 py-10 text-center">
        <GitBranch className="h-8 w-8 text-stone-300" />
        <p className="text-sm text-stone-500">
          У этого кота нет известных потомков в этом сохранении.
        </p>
      </div>
    );
  }
  return (
    <div>
      <ul className="space-y-1">
        {direct.map((ck) => (
          <DescendantNode key={ck} catKey={ck} ctx={ctx} depth={0} openMap={openMap} toggle={toggle} />
        ))}
      </ul>
    </div>
  );
}

function AncestorNode({
  catKey,
  ctx,
  depth,
  maxDepth,
}: {
  catKey: number;
  ctx: TreeContext;
  depth: number;
  maxDepth: number;
}) {
  const cat = ctx.catMap.get(catKey);
  if (!cat || depth > maxDepth) return null;
  const parents = cat.parents.filter((p): p is number => p != null);
  return (
    <li className="pl-4">
      <div className="py-0.5">
        <CatRow cat={cat} ctx={ctx} depthColor={depth === 0 ? "bg-amber-50 border-amber-300" : undefined} />
      </div>
      {parents.length > 0 && (
        <ul className="ml-5 border-l-2 border-stone-200">
          {parents.map((pk) => (
            <AncestorNode key={pk} catKey={pk} ctx={ctx} depth={depth + 1} maxDepth={maxDepth} />
          ))}
        </ul>
      )}
      {parents.length === 0 && depth > 0 && (
        <p className="ml-5 py-1 text-xs text-stone-400">— основатель (родители неизвестны)</p>
      )}
    </li>
  );
}

export function AncestorsTree({
  rootKey,
  ctx,
}: {
  rootKey: number;
  ctx: TreeContext;
}) {
  const cat = ctx.catMap.get(rootKey);
  const parents = cat ? cat.parents.filter((p): p is number => p != null) : [];
  if (parents.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-stone-300 bg-stone-50 px-6 py-10 text-center">
        <GitBranch className="h-8 w-8 text-stone-300" />
        <p className="text-sm text-stone-500">
          Это кот-основатель: его родители не записаны в сохранении.
        </p>
      </div>
    );
  }
  return (
    <ul className="space-y-1">
      {parents.map((pk) => (
        <AncestorNode key={pk} catKey={pk} ctx={ctx} depth={0} maxDepth={24} />
      ))}
    </ul>
  );
}
