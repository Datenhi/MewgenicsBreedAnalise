import { NextRequest, NextResponse } from "next/server";
import { parseMewSave, type MewSaveData } from "@/lib/mewgenics-parser";
import fs from "node:fs";
import path from "node:path";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_SIZE = 20 * 1024 * 1024; // 20 MB

function fail(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

export async function GET(req: NextRequest) {
  const example = req.nextUrl.searchParams.get("example");
  if (!example) return fail("Укажите ?example=1 для загрузки демо-файла");
  try {
    const p = path.join(process.cwd(), "public", "demo", "steamcampaign01.sav");
    if (!fs.existsSync(p)) return fail("Демо-файл не найден на сервере", 404);
    const buf = fs.readFileSync(p);
    const data: MewSaveData = parseMewSave(buf, "steamcampaign01.sav (пример)");
    return NextResponse.json(data);
  } catch (e) {
    console.error("example parse error:", e);
    return fail("Не удалось разобрать демо-файл", 500);
  }
}

export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return fail("Файл не передан. Прикрепите .sav файл сохранения.");
    }
    if (file.size === 0) return fail("Файл пустой");
    if (file.size > MAX_SIZE) return fail("Файл слишком большой (максимум 20 МБ)");

    const buf = Buffer.from(await file.arrayBuffer());

    // quick sanity check: SQLite header
    const header = buf.subarray(0, 16).toString("latin1");
    if (!header.startsWith("SQLite format 3")) {
      return fail(
        "Это не похоже на сохранение Mewgenics: файл должен быть базой данных SQLite (.sav)."
      );
    }

    const data = parseMewSave(buf, file.name);
    if (data.cats.length === 0) {
      return fail(
        "В файле не найдено котов. Убедитесь, что это сохранение Mewgenics (steamcampaign*.sav)."
      );
    }
    return NextResponse.json(data);
  } catch (e) {
    console.error("parse error:", e);
    return fail(
      "Ошибка при разборе файла: " + (e instanceof Error ? e.message : "неизвестная"),
      500
    );
  }
}
