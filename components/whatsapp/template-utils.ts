import type { Template } from "@/lib/whatsapp/types";
export function templateBody(t: Template) {
  return t.components.find((c) => c.type === "BODY")?.text || "";
}
export function templateVariables(t: Template) {
  return [
    ...new Set(
      [...templateBody(t).matchAll(/\{\{(\d+)\}\}/g)].map((m) => Number(m[1])),
    ),
  ].sort((a, b) => a - b);
}
export function canSendTemplate(t: Template) {
  return (
    t.status === "APPROVED" &&
    t.components.every((c) => ["BODY", "FOOTER"].includes(c.type))
  );
}
