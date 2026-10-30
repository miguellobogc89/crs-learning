import { NextResponse } from "next/server";
import { validSignature } from "@/lib/whatsapp/rules";
import { processWebhook } from "@/lib/whatsapp/webhook";
export const runtime = "nodejs";
export async function GET(req: Request) {
  const q = new URL(req.url).searchParams,
    token = process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN;
  if (
    token &&
    q.get("hub.mode") === "subscribe" &&
    q.get("hub.verify_token") === token &&
    q.get("hub.challenge")
  )
    return new NextResponse(q.get("hub.challenge"));
  return new NextResponse("Forbidden", { status: 403 });
}
export async function POST(req: Request) {
  const raw = await req.text();
  if (raw.length > 2000000)
    return new NextResponse("Payload too large", { status: 413 });
  if (
    !validSignature(
      raw,
      req.headers.get("x-hub-signature-256"),
      process.env.META_APP_SECRET,
    )
  )
    return new NextResponse("Forbidden", { status: 403 });
  try {
    await processWebhook(JSON.parse(raw));
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error(
      "[whatsapp:webhook] Processing failed",
      error instanceof Error ? error.name : "unknown",
    );
    // Meta retries: do not acknowledge events that were not persisted.
    return NextResponse.json({ error: "Processing failed" }, { status: 500 });
  }
}
