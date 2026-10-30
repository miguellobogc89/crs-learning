import { createHmac, timingSafeEqual } from "node:crypto";
export class WhatsAppError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}
export function required(value: unknown, label: string, max = 4096): string {
  if (typeof value !== "string" || !value.trim() || value.length > max)
    throw new WhatsAppError(`${label} no válido`);
  return value.trim();
}
export function uuid(value: unknown): string {
  const id = required(value, "Identificador", 36);
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)
  )
    throw new WhatsAppError("Identificador no válido");
  return id;
}
export function metaId(value: unknown): string {
  const id = required(value, "Identificador de Meta", 40);
  if (!/^\d+$/.test(id))
    throw new WhatsAppError("Identificador de Meta no válido");
  return id;
}
export function phone(value: unknown): string {
  const n = required(value, "Teléfono", 30).replace(/[+\s()-]/g, "");
  if (!/^[1-9]\d{6,14}$/.test(n))
    throw new WhatsAppError("Introduce el teléfono con prefijo internacional");
  return n;
}
export function serviceWindow(lastInbound: Date | null, now = Date.now()) {
  return Boolean(
    lastInbound && now - lastInbound.getTime() < 24 * 60 * 60 * 1000,
  );
}
export function validSignature(
  raw: string,
  signature: string | null,
  secret: string | undefined,
): boolean {
  if (!secret || !signature || !/^sha256=[a-f0-9]{64}$/.test(signature))
    return false;
  const expected = createHmac("sha256", secret).update(raw).digest();
  return timingSafeEqual(expected, Buffer.from(signature.slice(7), "hex"));
}
export function precedingStatuses(status: string): string[] {
  if (status === "read") return ["sending", "unknown", "sent", "delivered"];
  if (status === "delivered") return ["sending", "unknown", "sent"];
  if (status === "sent") return ["sending", "unknown"];
  if (status === "failed") return ["sending", "unknown", "sent"];
  return [];
}
export function bodyParameters(text: string): number {
  const matches = [...text.matchAll(/\{\{(\d+)\}\}/g)].map((m) => Number(m[1]));
  const unique = [...new Set(matches)].sort((a, b) => a - b);
  if (
    text.replace(/\{\{\d+\}\}/g, "").includes("{{") ||
    unique.some((n, i) => n !== i + 1)
  )
    throw new WhatsAppError("Usa variables consecutivas: {{1}}, {{2}}…");
  return unique.length;
}
