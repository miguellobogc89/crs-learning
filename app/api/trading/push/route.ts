// Notificaciones push de Trading (22/11/2026).
// GET ?endpoint=…  → clave pública, si puedes recibirlas y las preferencias de este móvil.
// POST { op: "subscribe", subscription } | { op: "unsubscribe", endpoint } | { op: "prefs", endpoint, prefs } | { op: "test" }
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { pushState, sendTest, setPrefs, subscribe, unsubscribe } from "@/lib/push/service";
import type { PushPrefs } from "@/lib/push/kinds";
import type { PushSub } from "@/lib/push/webpush";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const fail = (error: string, status = 400) => NextResponse.json({ error }, { status });
const msg = (e: unknown) => (e instanceof Error ? e.message.slice(0, 300) : "No se pudo completar");

export async function GET(req: Request) {
  const userId = (await auth())?.user?.id;
  if (!userId) return fail("No autenticado", 401);
  try {
    return NextResponse.json(await pushState(userId, new URL(req.url).searchParams.get("endpoint")));
  } catch (e) {
    console.error("[push] estado", e);
    return fail(msg(e), 500);
  }
}

export async function POST(req: Request) {
  const userId = (await auth())?.user?.id;
  if (!userId) return fail("No autenticado", 401);
  const b = (await req.json().catch(() => ({}))) as { op?: string; subscription?: PushSub; endpoint?: string; prefs?: Partial<PushPrefs> };
  try {
    if (b.op === "subscribe" && b.subscription) {
      await subscribe(userId, b.subscription, req.headers.get("user-agent"));
      return NextResponse.json({ ok: true });
    }
    if (b.op === "unsubscribe" && b.endpoint) {
      await unsubscribe(userId, b.endpoint);
      return NextResponse.json({ ok: true });
    }
    if (b.op === "prefs" && b.endpoint && b.prefs) {
      await setPrefs(userId, b.endpoint, b.prefs);
      return NextResponse.json({ ok: true });
    }
    if (b.op === "test") return NextResponse.json(await sendTest(userId));
    return fail("Operación no válida");
  } catch (e) {
    console.error("[push]", b.op, e);
    return fail(msg(e));
  }
}
