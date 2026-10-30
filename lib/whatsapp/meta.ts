import "server-only";
import { WhatsAppError } from "./rules";
export function metaConfig() {
  const version = process.env.META_GRAPH_VERSION || "v24.0";
  if (!/^v\d+\.0$/.test(version))
    throw new WhatsAppError("META_GRAPH_VERSION no válida", 503);
  return {
    appId: process.env.META_APP_ID || "",
    secret: process.env.META_APP_SECRET || "",
    configId: process.env.META_WHATSAPP_CONFIG_ID || "",
    version,
  };
}
export class MetaError extends WhatsAppError {
  constructor(public code: number) {
    super(
      `Meta rechazó la operación (código ${code}). Comprueba permisos, número y configuración.`,
      502,
    );
  }
}
export async function graph<T>(
  path: string,
  token: string,
  method = "GET",
  body?: unknown,
): Promise<T> {
  const response = await fetch(
    `https://graph.facebook.com/${metaConfig().version}/${path}`,
    {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
      cache: "no-store",
      signal: AbortSignal.timeout(20000),
    },
  );
  const data = await response.json();
  if (!response.ok || data.error)
    throw new MetaError(Number(data.error?.code || response.status));
  return data as T;
}
export async function exchangeCode(code: string) {
  const config = metaConfig();
  if (!config.appId || !config.secret)
    throw new WhatsAppError("Configura META_APP_ID y META_APP_SECRET", 503);
  const response = await fetch(
    `https://graph.facebook.com/${config.version}/oauth/access_token`,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: config.appId,
        client_secret: config.secret,
        code,
        ...(process.env.META_WHATSAPP_REDIRECT_URI
          ? { redirect_uri: process.env.META_WHATSAPP_REDIRECT_URI }
          : {}),
      }),
      signal: AbortSignal.timeout(15000),
      cache: "no-store",
    },
  );
  const data = await response.json();
  if (!response.ok || typeof data.access_token !== "string")
    throw new WhatsAppError(
      "No se pudo canjear la autorización de Meta. Vuelve a conectar.",
      502,
    );
  return data.access_token as string;
}
export type MetaTemplate = {
  id: string;
  name: string;
  language: string;
  category: string;
  status: string;
  components: import("./types").Component[];
};
export async function listTemplates(
  wabaId: string,
  token: string,
): Promise<MetaTemplate[]> {
  const all: MetaTemplate[] = [];
  let after = "";
  do {
    const page = await graph<{
      data: MetaTemplate[];
      paging?: { next?: string; cursors?: { after?: string } };
    }>(
      `${wabaId}/message_templates?limit=100${after ? `&after=${encodeURIComponent(after)}` : ""}`,
      token,
    );
    all.push(...page.data);
    after = page.paging?.next ? page.paging.cursors?.after || "" : "";
    if (all.length > 10000)
      throw new WhatsAppError(
        "Demasiadas plantillas para sincronizar en una operación",
        422,
      );
  } while (after);
  return all;
}
