import { createHmac, timingSafeEqual } from "node:crypto";
import type { InsertPlan } from "./validate-insert-plan";

function secret(): string {
  const key = process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET;
  if (!key || key.length < 24) throw new Error("AUTH_SECRET no configurado para confirmar INSERT");
  return key;
}
export function signInsertPlan(workspaceId: string, importId: string, fileId: string, plan: InsertPlan): string {
  return createHmac("sha256", secret()).update(JSON.stringify([workspaceId, importId, fileId, plan])).digest("hex");
}
export function verifyInsertPlan(workspaceId: string, importId: string, fileId: string, plan: InsertPlan, signature: string): boolean {
  if (!/^[a-f0-9]{64}$/.test(signature)) return false;
  const expected = Buffer.from(signInsertPlan(workspaceId, importId, fileId, plan), "hex");
  return timingSafeEqual(expected, Buffer.from(signature, "hex"));
}
