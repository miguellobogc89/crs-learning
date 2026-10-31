import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { connectorContext } from "@/lib/connectors/context";
import { connectorKey, decrypt, encrypt } from "@/lib/connectors/crypto";
import {
  accountFor,
  accountSelect,
  conversationFor,
} from "@/lib/whatsapp/repository";
import { exchangeCode, metaConfig } from "@/lib/whatsapp/meta";
import {
  connectNumber,
  createTemplate,
  sendMessage,
  syncTemplates,
} from "@/lib/whatsapp/service";
import { required, uuid, WhatsAppError } from "@/lib/whatsapp/rules";
import {
  campaignProgress,
  contactFacets,
  contactIds,
  createCampaign,
  deleteContacts,
  getContact,
  importContacts,
  listContacts,
  previewCampaign,
  runCampaign,
  updateContacts,
} from "@/lib/whatsapp/contacts-service";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
type RouteContext = { params: Promise<{ action: string[] }> };
const PENDING_COOKIE = "crs_wa_pending";
async function handle(req: Request, route: RouteContext) {
  try {
    const ctx = await connectorContext();
    if (!ctx)
      return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    if (req.method !== "GET") {
      if (req.headers.get("origin") !== new URL(req.url).origin)
        throw new WhatsAppError("Origen no permitido", 403);
    }
    const action = (await route.params).action.join("/");
    const url = new URL(req.url),
      workspaceId = ctx.workspaceId;
    let body: Record<string, unknown> = {};
    if (req.method !== "GET") {
      const raw = await req.text();
      // CSV imports carry the whole file; every other operation is a small JSON body.
      if (raw.length > (action === "contacts/import" ? 4_500_000 : 65536))
        throw new WhatsAppError("Petición demasiado grande", 413);
      const parsed: unknown = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
        throw new WhatsAppError("Petición no válida");
      body = parsed as Record<string, unknown>;
    }
    const manageActions = [
      "connect/code",
      "connect/finish",
      "disconnect",
      "templates/sync",
      "templates/create",
      "contacts/delete",
    ];
    if (
      req.method !== "GET" &&
      manageActions.includes(action) &&
      !ctx.canManage
    )
      throw new WhatsAppError(
        "Solo el propietario o un administrador puede gestionar la conexión y las plantillas",
        403,
      );
    if (req.method === "GET" && action === "accounts") {
      const c = metaConfig();
      const checks = {
        appId: Boolean(c.appId?.trim()),
        appSecret: Boolean(c.secret?.trim()),
        configId: Boolean(c.configId?.trim()),
        encryptionKey: Boolean(process.env.CONNECTORS_ENCRYPTION_KEY?.trim()),
        webhookVerifyToken: Boolean(process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN?.trim()),
      };
      const missing = [
        ...(!checks.appId ? ["META_APP_ID"] : []),
        ...(!checks.appSecret ? ["META_APP_SECRET"] : []),
        ...(!checks.configId ? ["META_WHATSAPP_CONFIG_ID"] : []),
        ...(!checks.encryptionKey ? ["CONNECTORS_ENCRYPTION_KEY"] : []),
      ];
      const invalid: string[] = [];
      if (checks.encryptionKey) {
        try { connectorKey(); } catch {
          invalid.push("CONNECTORS_ENCRYPTION_KEY debe contener 32 bytes en base64");
        }
      }
      const webhookMissing = [
        ...(!checks.appSecret ? ["META_APP_SECRET"] : []),
        ...(!checks.webhookVerifyToken ? ["WHATSAPP_WEBHOOK_VERIFY_TOKEN"] : []),
      ];
      return NextResponse.json({
        items: await prisma.whatsapp_accounts.findMany({
          where: { workspace_id: workspaceId },
          select: accountSelect,
          orderBy: { created_at: "asc" },
        }),
        configuration: {
          appId: c.appId,
          configId: c.configId,
          version: c.version,
          ready: missing.length === 0 && invalid.length === 0,
          webhookReady: webhookMissing.length === 0,
          ...(ctx.canManage ? { checks, missing, invalid, webhookMissing } : {}),
          webhookPath: "/api/webhooks/whatsapp",
          canManage: ctx.canManage,
        },
      });
    }
    if (req.method === "GET" && action === "conversations") {
      const accountId = uuid(url.searchParams.get("accountId"));
      await accountFor(workspaceId, accountId);
      const q = (url.searchParams.get("q") || "").slice(0, 100);
      const offset = Math.max(
        0,
        Math.floor(
          Math.min(100000, Number(url.searchParams.get("offset")) || 0),
        ),
      );
      const items = await prisma.whatsapp_conversations.findMany({
        where: {
          workspace_id: workspaceId,
          account_id: accountId,
          ...(q
            ? {
                OR: [
                  { contact_phone: { contains: q } },
                  {
                    contact_name: { contains: q, mode: "insensitive" as const },
                  },
                ],
              }
            : {}),
        },
        orderBy: [{ last_message_at: "desc" }, { id: "desc" }],
        take: 51,
        skip: offset,
      });
      return NextResponse.json({
        items: items.slice(0, 50),
        hasMore: items.length > 50,
      });
    }
    if (req.method === "GET" && action === "messages") {
      const conversationId = uuid(url.searchParams.get("conversationId"));
      await conversationFor(workspaceId, conversationId);
      const before = url.searchParams.get("before");
      const cursor = before
        ? await prisma.whatsapp_messages.findFirst({
            where: {
              id: uuid(before),
              workspace_id: workspaceId,
              conversation_id: conversationId,
            },
          })
        : null;
      if (before && !cursor) throw new WhatsAppError("Cursor no válido");
      const items = await prisma.whatsapp_messages.findMany({
        where: {
          workspace_id: workspaceId,
          conversation_id: conversationId,
          ...(cursor
            ? {
                OR: [
                  { created_at: { lt: cursor.created_at } },
                  { created_at: cursor.created_at, id: { lt: cursor.id } },
                ],
              }
            : {}),
        },
        orderBy: [{ created_at: "desc" }, { id: "desc" }],
        take: 51,
      });
      return NextResponse.json({
        items: items.slice(0, 50).reverse(),
        hasMore: items.length > 50,
      });
    }
    if (req.method === "GET" && action === "templates") {
      const accountId = uuid(url.searchParams.get("accountId"));
      await accountFor(workspaceId, accountId);
      return NextResponse.json({
        items: await prisma.whatsapp_templates.findMany({
          where: { workspace_id: workspaceId, account_id: accountId },
          orderBy: [{ is_favorite: "desc" }, { name: "asc" }],
        }),
      });
    }
    if (req.method === "GET" && action === "contacts")
      return NextResponse.json(await listContacts(workspaceId, url));
    if (req.method === "GET" && action === "contacts/facets")
      return NextResponse.json(await contactFacets(workspaceId));
    if (req.method === "GET" && action === "contacts/ids")
      return NextResponse.json({ ids: await contactIds(workspaceId, url) });
    if (req.method === "GET" && action === "contacts/one")
      return NextResponse.json(
        await getContact(
          workspaceId,
          uuid(url.searchParams.get("id")),
          url.searchParams.get("accountId"),
        ),
      );
    if (req.method === "GET" && action === "campaigns/progress")
      return NextResponse.json(
        await campaignProgress(workspaceId, uuid(url.searchParams.get("campaignId"))),
      );
    if (req.method !== "POST")
      throw new WhatsAppError("Ruta no encontrada", 404);
    if (action === "contacts/import")
      return NextResponse.json(await importContacts(workspaceId, ctx.userId, body));
    if (action === "contacts/update")
      return NextResponse.json(await updateContacts(workspaceId, body));
    if (action === "contacts/delete")
      return NextResponse.json(await deleteContacts(workspaceId, body));
    if (action === "campaigns/preview")
      return NextResponse.json(await previewCampaign(workspaceId, body));
    if (action === "campaigns/create")
      return NextResponse.json(await createCampaign(workspaceId, ctx.userId, body));
    if (action === "campaigns/run")
      return NextResponse.json(await runCampaign(workspaceId, body));
    if (action === "connect/code") {
      const token = await exchangeCode(
        required(body.code, "Autorización", 4096),
      );
      (await cookies()).set(
        PENDING_COOKIE,
        encrypt(
          JSON.stringify({
            token,
            workspaceId,
            userId: ctx.userId,
            expires: Date.now() + 300000,
          }),
        ),
        {
          httpOnly: true,
          secure: process.env.NODE_ENV === "production",
          sameSite: "strict",
          path: "/api/whatsapp",
          maxAge: 300,
        },
      );
    } else if (action === "connect/finish") {
      const jar = await cookies();
      const sealed = jar.get(PENDING_COOKIE)?.value;
      if (!sealed)
        throw new WhatsAppError(
          "La autorización ha caducado. Vuelve a conectar.",
        );
      const pending = JSON.parse(decrypt(sealed));
      if (
        pending.workspaceId !== workspaceId ||
        pending.userId !== ctx.userId ||
        pending.expires < Date.now()
      )
        throw new WhatsAppError("Autorización no válida", 403);
      await connectNumber(workspaceId, pending.token, body);
      jar.delete({ name: PENDING_COOKIE, path: "/api/whatsapp" });
    } else if (action === "disconnect") {
      const account = await accountFor(workspaceId, uuid(body.accountId));
      // Local disconnect keeps history and cannot revoke a shared WABA subscription used by another number.
      await prisma.whatsapp_accounts.update({
        where: { id: account.id },
        data: { status: "disconnected", token_enc: "", updated_at: new Date() },
      });
    } else if (action === "send") {
      return NextResponse.json({ item: await sendMessage(workspaceId, body) });
    } else if (action === "read") {
      const c = await conversationFor(workspaceId, uuid(body.conversationId));
      // Clear only the unread count observed by this reader; concurrent incoming messages stay unread.
      const count = Number(body.unreadCount);
      if (!Number.isInteger(count) || count < 0)
        throw new WhatsAppError("Contador no válido");
      await prisma.whatsapp_conversations.updateMany({
        where: { id: c.id, workspace_id: workspaceId, unread_count: count },
        data: { unread_count: 0 },
      });
    } else if (action === "templates/sync")
      await syncTemplates(workspaceId, uuid(body.accountId));
    else if (action === "templates/create")
      await createTemplate(workspaceId, body);
    else if (action === "templates/favorite") {
      if (typeof body.favorite !== "boolean")
        throw new WhatsAppError("Favorito no válido");
      await prisma.whatsapp_templates.updateMany({
        where: { workspace_id: workspaceId, id: uuid(body.templateId) },
        data: { is_favorite: body.favorite },
      });
    } else throw new WhatsAppError("Ruta no encontrada", 404);
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof WhatsAppError)
      return NextResponse.json(
        { error: error.message },
        { status: error.status },
      );
    if (error instanceof SyntaxError)
      return NextResponse.json(
        { error: "Petición no válida" },
        { status: 400 },
      );
    console.error(
      "[whatsapp] Operation failed",
      error instanceof Error ? error.name : "unknown",
    );
    return NextResponse.json(
      { error: "No se pudo completar la operación de WhatsApp" },
      { status: 500 },
    );
  }
}
export const GET = handle;
export const POST = handle;
