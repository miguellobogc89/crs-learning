import { NextResponse } from "next/server";
export async function POST() {
  return NextResponse.json({ error: "El flujo anterior está desconectado. Utiliza identificación y clasificación.", code: "LEGACY_IMPORT_DISABLED" }, { status: 410 });
}
