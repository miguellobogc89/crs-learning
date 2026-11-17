import { NextResponse } from "next/server";
import { syncHealth } from "@/lib/trading/notifications";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * Vigilante: lo llama un trabajo de GitHub Actions cada 15 minutos (fuera de Vercel, para que avise también
 * si la propia app se cae). Actualiza los avisos y responde 503 si hay algún problema abierto, para que el
 * trabajo falle y GitHub mande un correo. Sin datos sensibles: solo cuántos problemas y cuáles.
 */
export async function GET() {
  try {
    const { problems } = await syncHealth();
    return NextResponse.json({ ok: problems.length === 0, problems: problems.map((p) => p.key) }, { status: problems.length ? 503 : 200 });
  } catch (e) {
    console.error("[trading] health", e);
    return NextResponse.json({ ok: false, problems: ["sin-base-de-datos"] }, { status: 503 });
  }
}
