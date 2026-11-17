import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { importStatement } from "@/lib/finance/import";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** Sube un extracto (CSV, Excel o PDF) a una cuenta existente o a una nueva «importada». */
export async function POST(req: Request) {
  const uid = (await auth())?.user?.id;
  if (!uid) return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  try {
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) return NextResponse.json({ error: "Falta el archivo" }, { status: 400 });
    const bytes = Buffer.from(await file.arrayBuffer());
    const accountId = typeof form.get("accountId") === "string" && form.get("accountId") ? String(form.get("accountId")) : null;
    const newAccountName = typeof form.get("newAccountName") === "string" ? String(form.get("newAccountName")) : null;
    const result = await importStatement(uid, { name: file.name, bytes }, { accountId, newAccountName });
    return NextResponse.json(result, { headers: { "Cache-Control": "private, no-store" } });
  } catch (e) {
    const msg = e instanceof Error ? e.message.slice(0, 300) : "No se pudo importar el extracto";
    console.error("[finance] import", msg);
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
