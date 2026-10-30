import "server-only";
import { prisma } from "@/lib/prisma";
import { decrypt } from "@/lib/connectors/crypto";
import { WhatsAppError } from "./rules";
export async function accountFor(workspaceId: string, id: string) {
  const account = await prisma.whatsapp_accounts.findFirst({
    where: { workspace_id: workspaceId, id, status: "active" },
  });
  if (!account)
    throw new WhatsAppError("Número no conectado a este espacio", 404);
  return { ...account, token: decrypt(account.token_enc) };
}
export async function conversationFor(workspaceId: string, id: string) {
  const conversation = await prisma.whatsapp_conversations.findFirst({
    where: { workspace_id: workspaceId, id },
  });
  if (!conversation) throw new WhatsAppError("Conversación no encontrada", 404);
  return conversation;
}
export const accountSelect = {
  id: true,
  display_phone: true,
  verified_name: true,
  status: true,
} as const;
