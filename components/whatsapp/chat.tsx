"use client";
import { useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  MessageCircle,
  Plus,
  Send,
  Search,
  Loader2,
} from "lucide-react";
import { waApi, buttonClass, errorText, fieldClass } from "./api";
import {
  canSendTemplate,
  templateBody,
  templateVariables,
} from "./template-utils";
import type { Conversation, Message, Template } from "@/lib/whatsapp/types";
export function WhatsAppChat({ accountId }: { accountId: string }) {
  const [items, setItems] = useState<Conversation[]>([]),
    [selected, setSelected] = useState<Conversation | null>(null);
  const [query, setQuery] = useState(""),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true);
  const [more, setMore] = useState(false),
    [offset, setOffset] = useState(0),
    [draft, setDraft] = useState(false),
    [phone, setPhone] = useState("");
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    let timeout: ReturnType<typeof setTimeout>;
    let first = true;
    async function poll() {
      try {
        const data = await waApi<{ items: Conversation[]; hasMore: boolean }>(
          `conversations?accountId=${accountId}&q=${encodeURIComponent(query)}&offset=0`,
          undefined,
          controller.signal,
        );
        const initial = first;
        first = false;
        setItems((old) =>
          initial
            ? data.items
            : [
                ...data.items,
                ...old.filter((c) => !data.items.some((fresh) => fresh.id === c.id)),
              ],
        );
        if (initial) {
          setMore(data.hasMore);
          setOffset(data.items.length);
        }
        setError("");
        setSelected((old) =>
          old ? data.items.find((c) => c.id === old.id) || old : null,
        );
      } catch (e) {
        if (!controller.signal.aborted) setError(errorText(e));
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
          timeout = setTimeout(poll, 8000);
        }
      }
    }
    const debounce = setTimeout(poll, 250);
    return () => {
      controller.abort();
      clearTimeout(timeout);
      clearTimeout(debounce);
    };
  }, [accountId, query, revision]);
  async function loadMore() {
    try {
      const data = await waApi<{ items: Conversation[]; hasMore: boolean }>(
        `conversations?accountId=${accountId}&q=${encodeURIComponent(query)}&offset=${offset}`,
      );
      setItems((old) => [
        ...new Map([...old, ...data.items].map((c) => [c.id, c])).values(),
      ]);
      setOffset(offset + data.items.length);
      setMore(data.hasMore);
    } catch (e) {
      setError(errorText(e));
    }
  }
  const showing = selected || draft;
  return (
    <div className="flex min-h-0 flex-1 overflow-hidden rounded-xl border border-slate-200">
      <aside
        className={`${showing ? "hidden md:flex" : "flex"} w-full flex-col border-r border-slate-200 md:w-72 md:shrink-0 lg:w-80`}
      >
        <div className="flex items-center justify-between border-b border-slate-100 p-4">
          <h2 className="text-sm font-semibold">Conversaciones</h2>
          <button
            title="Nueva conversación"
            aria-label="Nueva conversación"
            onClick={() => {
              setSelected(null);
              setDraft(true);
            }}
          >
            <Plus className="h-5 w-5 text-blue-600" />
          </button>
        </div>
        <label className="relative m-3">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
          <input
            aria-label="Buscar conversación"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar contacto"
            className={fieldClass + " pl-9"}
          />
        </label>
        {error && (
          <p role="alert" className="px-3 text-xs text-red-600">
            {error}
          </p>
        )}
        <div className="min-h-0 flex-1 overflow-y-auto">
          {loading ? (
            <p role="status" className="p-4 text-sm text-slate-400">
              Cargando…
            </p>
          ) : !items.length ? (
            <p className="p-5 text-sm text-slate-400">
              {query ? "Sin resultados." : "Todavía no hay conversaciones."}
            </p>
          ) : (
            items.map((c) => (
              <button
                key={c.id}
                onClick={() => {
                  setSelected(c);
                  setDraft(false);
                }}
                className={`flex w-full items-center gap-3 border-b border-slate-100 p-4 text-left ${selected?.id === c.id ? "bg-blue-50" : "hover:bg-slate-50"}`}
              >
                <span className="grid h-10 w-10 shrink-0 place-content-center rounded-full bg-slate-100 text-sm font-semibold text-slate-500">
                  {(c.contact_name || c.contact_phone)
                    .slice(0, 2)
                    .toUpperCase()}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">
                    {c.contact_name || `+${c.contact_phone}`}
                  </span>
                  <span className="text-xs text-slate-400">
                    {new Date(c.last_message_at).toLocaleString("es-ES", {
                      day: "2-digit",
                      month: "short",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                </span>
                {c.unread_count > 0 && (
                  <span className="rounded-full bg-blue-600 px-2 py-0.5 text-xs text-white">
                    {c.unread_count}
                  </span>
                )}
              </button>
            ))
          )}
          {more && (
            <button
              onClick={loadMore}
              className="w-full p-3 text-xs text-blue-600"
            >
              Cargar más
            </button>
          )}
        </div>
      </aside>
      {showing ? (
        <ChatThread
          key={selected?.id || "new"}
          accountId={accountId}
          conversation={selected}
          to={phone}
          onTo={setPhone}
          onBack={() => {
            setSelected(null);
            setDraft(false);
          }}
          onSent={() => setRevision((n) => n + 1)}
        />
      ) : (
        <div className="hidden flex-1 flex-col items-center justify-center gap-3 text-slate-400 md:flex">
          <MessageCircle className="h-10 w-10 stroke-1" />
          <p className="text-sm">
            Selecciona una conversación o inicia una nueva.
          </p>
        </div>
      )}
    </div>
  );
}
function ChatThread({
  accountId,
  conversation,
  to,
  onTo,
  onBack,
  onSent,
}: {
  accountId: string;
  conversation: Conversation | null;
  to: string;
  onTo: (v: string) => void;
  onBack: () => void;
  onSent: () => void;
}) {
  const [messages, setMessages] = useState<Message[]>([]),
    [templates, setTemplates] = useState<Template[]>([]),
    [more, setMore] = useState(false);
  const [text, setText] = useState(""),
    [templateId, setTemplateId] = useState(""),
    [values, setValues] = useState<string[]>([]),
    [error, setError] = useState("");
  const [busy, setBusy] = useState(false),
    [revision, setRevision] = useState(0),
    [loading, setLoading] = useState(Boolean(conversation));
  const [now, setNow] = useState(0);
  const conversationId = conversation?.id;
  const unreadCount = conversation?.unread_count || 0;
  const lastMessageId = messages.at(-1)?.id;
  useEffect(() => {
    const update = () => setNow(Date.now());
    const timer = setInterval(update, 1000);
    return () => clearInterval(timer);
  }, []);
  const bottom = useRef<HTMLDivElement>(null),
    lock = useRef(false);
  const request = useRef<{ signature: string; id: string } | null>(null);
  useEffect(() => {
    const c = new AbortController();
    void waApi<{ items: Template[] }>(
      `templates?accountId=${accountId}`,
      undefined,
      c.signal,
    )
      .then((d) => setTemplates(d.items.filter(canSendTemplate)))
      .catch((e) => {
        if (!c.signal.aborted) setError(errorText(e));
      });
    return () => c.abort();
  }, [accountId]);
  useEffect(() => {
    if (!conversationId) return;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    let first = true;
    async function poll() {
      try {
        const data = await waApi<{ items: Message[]; hasMore: boolean }>(
          `messages?conversationId=${conversationId}`,
          undefined,
          controller.signal,
        );
        setMessages((old) =>
          [
            ...new Map([...old, ...data.items].map((m) => [m.id, m])).values(),
          ].sort(
            (a, b) =>
              a.created_at.localeCompare(b.created_at) ||
              a.id.localeCompare(b.id),
          ),
        );
        if (first) {
          setMore(data.hasMore);
          first = false;
        }
      } catch (e) {
        if (!controller.signal.aborted) setError(errorText(e));
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
          timer = setTimeout(poll, 5000);
        }
      }
    }
    void poll();
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [conversationId, revision]);
  useEffect(() => {
    if (!loading && conversationId && unreadCount)
      void waApi("read", { conversationId, unreadCount }).catch((e) =>
        setError(errorText(e)),
      );
  }, [conversationId, unreadCount, loading]);
  useEffect(() => {
    bottom.current?.scrollIntoView({ block: "nearest" });
  }, [lastMessageId]);
  async function older() {
    try {
      const d = await waApi<{ items: Message[]; hasMore: boolean }>(
        `messages?conversationId=${conversation!.id}&before=${messages[0].id}`,
      );
      setMessages((old) => [
        ...new Map([...d.items, ...old].map((m) => [m.id, m])).values(),
      ]);
      setMore(d.hasMore);
    } catch (e) {
      setError(errorText(e));
    }
  }
  const template = templates.find((t) => t.id === templateId);
  const variables = template ? templateVariables(template) : [];
  const windowOpen = Boolean(
    now &&
    conversation?.last_inbound_at &&
    now - new Date(conversation.last_inbound_at).getTime() < 86400000,
  );
  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      const signature = JSON.stringify({
        conversationId: conversation?.id,
        to,
        templateId,
        values,
        text,
      });
      if (request.current?.signature !== signature)
        request.current = { signature, id: crypto.randomUUID() };
      const result = await waApi<{
        item: Message & { conversation_id: string };
      }>("send", {
        requestId: request.current.id,
        accountId,
        ...(conversation ? { conversationId: conversation.id } : { to }),
        ...(template ? { templateId, parameters: values } : { text }),
      });
      setText("");
      setTemplateId("");
      setValues([]);
      setMessages((old) => [
        ...old.filter((m) => m.id !== result.item.id),
        result.item,
      ]);
      setRevision((n) => n + 1);
      onSent();
      if (!conversation) onBack();
    } catch (e) {
      setError(errorText(e));
      setRevision((n) => n + 1);
      onSent();
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  return (
    <section className="flex min-h-0 min-w-0 flex-1 flex-col">
      <header className="flex min-h-16 shrink-0 items-center gap-3 border-b border-slate-100 px-4">
        <button
          aria-label="Volver a conversaciones"
          onClick={onBack}
          className="md:hidden"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div className="min-w-0">
          <h3 className="truncate text-sm font-semibold">
            {conversation
              ? conversation.contact_name || `+${conversation.contact_phone}`
              : "Nueva conversación"}
          </h3>
          <p className="text-xs text-slate-400">
            {conversation
              ? `+${conversation.contact_phone}`
              : "Envía una plantilla aprobada para iniciar el contacto"}
          </p>
        </div>
      </header>
      {!conversation && (
        <label className="p-4 text-xs text-slate-500">
          Teléfono con prefijo internacional
          <input
            value={to}
            onChange={(e) => onTo(e.target.value)}
            placeholder="+34 600 000 000"
            className={fieldClass + " mt-1"}
          />
        </label>
      )}
      <div
        className="min-h-0 flex-1 space-y-3 overflow-y-auto bg-slate-50/70 p-4"
        aria-label="Mensajes"
        aria-busy={loading}
      >
        {more && (
          <button className="w-full text-xs text-blue-600" onClick={older}>
            Cargar mensajes anteriores
          </button>
        )}
        {loading && (
          <p className="text-sm text-slate-400">Cargando mensajes…</p>
        )}
        {messages.map((m) => (
          <div
            key={m.id}
            className={`flex ${m.direction === "out" ? "justify-end" : "justify-start"}`}
          >
            <div
              className={`max-w-[88%] rounded-xl px-4 py-2 text-sm sm:max-w-[75%] ${m.direction === "out" ? "bg-blue-50" : "border border-slate-100 bg-white"}`}
            >
              <p className="whitespace-pre-wrap break-words">{m.text}</p>
              <p
                className={`mt-1 text-right text-[10px] ${["failed", "unknown"].includes(m.status) ? "text-red-600" : "text-slate-400"}`}
              >
                {new Date(m.created_at).toLocaleTimeString("es-ES", {
                  hour: "2-digit",
                  minute: "2-digit",
                })}{" "}
                ·{" "}
                {(
                  {
                    sent: "Enviado",
                    delivered: "Entregado",
                    read: "Leído",
                    sending: "Enviando",
                    failed: "Error",
                    unknown: "Sin confirmar",
                    received: "Recibido",
                  } as Record<string, string>
                )[m.status] || m.status}
              </p>
              {m.error && (
                <p className="mt-1 text-xs text-red-600">{m.error}</p>
              )}
            </div>
          </div>
        ))}
        <div ref={bottom} />
      </div>
      <form
        onSubmit={send}
        className="shrink-0 space-y-2 border-t border-slate-200 bg-white p-3"
      >
        {error && (
          <p role="alert" className="text-xs text-red-600">
            {error}
          </p>
        )}
        {!windowOpen && (
          <p className="text-xs text-slate-500">
            Selecciona una plantilla aprobada para enviar el mensaje.
          </p>
        )}
        <select
          aria-label="Plantilla de mensaje"
          value={templateId}
          disabled={busy}
          onChange={(e) => {
            setTemplateId(e.target.value);
            const t = templates.find((t) => t.id === e.target.value);
            setValues(t ? templateVariables(t).map(() => "") : []);
          }}
          className={fieldClass}
        >
          <option value="">
            {windowOpen
              ? "Mensaje libre o plantilla…"
              : "Seleccionar plantilla…"}
          </option>
          {templates.map((t) => (
            <option key={t.id} value={t.id}>
              {t.is_favorite ? "★ " : ""}
              {t.name} · {t.language}
            </option>
          ))}
        </select>
        {template && (
          <>
            <p className="max-h-24 overflow-y-auto whitespace-pre-wrap rounded-lg bg-blue-50 p-3 text-xs text-slate-600">
              {templateBody(template).replace(
                /\{\{(\d+)\}\}/g,
                (m, n) => values[Number(n) - 1] || m,
              )}
            </p>
            <div className="flex flex-wrap gap-2">
              {variables.map((n, i) => (
                <input
                  key={n}
                  aria-label={`Variable ${n}`}
                  placeholder={`Variable ${n}`}
                  required
                  disabled={busy}
                  value={values[i] || ""}
                  onChange={(e) =>
                    setValues((old) =>
                      old.map((v, j) => (j === i ? e.target.value : v)),
                    )
                  }
                  className={fieldClass + " min-w-28 flex-1"}
                />
              ))}
            </div>
          </>
        )}
        <div className="flex items-end gap-2">
          {!template && (
            <textarea
              aria-label="Mensaje"
              disabled={busy || !windowOpen}
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={2}
              maxLength={4096}
              placeholder={
                windowOpen
                  ? "Escribe un mensaje…"
                  : "Mensaje libre no disponible"
              }
              className={fieldClass + " resize-none"}
            />
          )}
          <button
            type="submit"
            className={buttonClass + " ml-auto"}
            disabled={
              busy ||
              (template
                ? variables.some((_, i) => !values[i]?.trim()) ||
                  (!conversation && !to.trim())
                : !windowOpen || !text.trim())
            }
          >
            {busy ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
            Enviar
          </button>
        </div>
      </form>
    </section>
  );
}
