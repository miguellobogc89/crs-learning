// Panel «Consumo de IA»: consumo por app y ajustes (modelos, frecuencia de FARO, límites). Solo con sesión.
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { aiUsageView, saveAiSetting } from "@/lib/ai/usage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store" };

export async function GET() {
  if (!(await auth())?.user?.id) return NextResponse.json({ error: "No autenticado" }, { status: 401, headers });
  return NextResponse.json(await aiUsageView(), { headers });
}

export async function POST(req: Request) {
  if (!(await auth())?.user?.id) return NextResponse.json({ error: "No autenticado" }, { status: 401, headers });
  const body = (await req.json().catch(() => ({}))) as { key?: unknown; value?: unknown };
  try {
    await saveAiSetting(String(body.key ?? ""), body.value === null || body.value === undefined ? null : String(body.value));
    return NextResponse.json(await aiUsageView(), { headers });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "No se pudo guardar" }, { status: 400, headers });
  }
}
