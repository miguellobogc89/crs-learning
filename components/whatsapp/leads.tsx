"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  ArrowRight, Ban, Check, ExternalLink, Globe, Inbox, Loader2, MapPin, MessageCircle, Search, Send, ShieldCheck, Star,
  ThumbsDown, ThumbsUp, UserPlus, X,
} from "lucide-react";
import { waApi, buttonClass, errorText, fieldClass } from "./api";
import { ChatThread } from "./chat";
import { CampaignDialog } from "./campaign-dialog";
import { classificationTone, PermissionPill, shortDate, stageTone } from "./contacts";
import { LEAD_GROUPS, type GroupKey, type Lead } from "@/lib/whatsapp/leads";
import { STAGES } from "@/lib/whatsapp/contacts";
import type { ContactDetail, ContactFacets, Conversation } from "@/lib/whatsapp/types";
import { cn } from "@/lib/utils";

type Item = Lead & { lastMessage: { text: string; direction: string; status: string } | null };
type Overview = { counts: Record<GroupKey, number>; total: number; items: Item[] };
const SECTIONS = ["Bandeja", "Embudo", "Valoración", "Todos"] as const;
const ghost = "inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50";

/**
 * «Leads»: work the prospects group by group. Left, the groups (with how many leads each has); centre, the leads of
 * the chosen group, contacted or not; right, the lead: its conversation (or the first message, if never contacted),
 * quick moves through the funnel, «Siguiente» to go through the group one by one, and its record.
 */
export function WhatsAppLeads({ accountId }: { accountId: string }) {
  const params = useSearchParams();
  const [group, setGroup] = useState<GroupKey>(params.get("lead") ? "todos" : "por_contestar");
  const [search, setSearch] = useState("");
  const [q, setQ] = useState("");
  const [offset, setOffset] = useState(0);
  const [data, setData] = useState<Overview | null>(null);
  const [error, setError] = useState("");
  const [current, setCurrent] = useState<string | null>(params.get("lead"));
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [sending, setSending] = useState<string[] | null>(null);
  const [facets, setFacets] = useState<ContactFacets | null>(null);
  const [revision, setRevision] = useState(0);
  const reload = useCallback(() => setRevision(n => n + 1), []);

  useEffect(() => { const t = setTimeout(() => { setQ(search); setOffset(0); }, 300); return () => clearTimeout(t); }, [search]);

  useEffect(() => {
    const c = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    const load = () => waApi<Overview>(`leads?group=${group}&offset=${offset}&q=${encodeURIComponent(q)}${accountId ? `&accountId=${accountId}` : ""}`, undefined, c.signal)
      .then(d => { setData(d); setError(""); })
      .catch(e => { if (!c.signal.aborted) setError(errorText(e)); })
      .finally(() => { if (!c.signal.aborted) timer = setTimeout(load, 15000); });
    void load();
    return () => { c.abort(); clearTimeout(timer); };
  }, [group, offset, q, accountId, revision]);

  useEffect(() => { void waApi<ContactFacets>("contacts/facets").then(setFacets).catch(() => {}); }, []);

  const items = useMemo(() => data?.items ?? [], [data]);
  const index = items.findIndex(l => l.key === current);
  const lead = index >= 0 ? items[index] : null;
  function next() {
    if (index >= 0 && index + 1 < items.length) setCurrent(items[index + 1].key);
    else if (data && offset + 50 < data.total) { setOffset(o => o + 50); setCurrent(null); }
  }
  async function selectGroup() {
    try {
      const d = await waApi<{ ids: string[] }>(`leads/ids?group=${group}&q=${encodeURIComponent(q)}${accountId ? `&accountId=${accountId}` : ""}`);
      setSelected(new Set(d.ids));
    } catch (e) { setError(errorText(e)); }
  }
  const groupLabel = LEAD_GROUPS.find(g => g.key === group)?.label ?? "";

  return <div className="flex min-h-0 flex-1 overflow-hidden rounded-xl border border-slate-200 bg-white">
    {/* Groups */}
    <nav aria-label="Grupos de leads" className="hidden w-52 shrink-0 overflow-y-auto border-r border-slate-200 bg-slate-50/60 p-2 lg:block">
      {SECTIONS.map(section => <div key={section} className="mb-3">
        {section !== "Todos" && <p className="px-2 pb-1 pt-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400">{section}</p>}
        {LEAD_GROUPS.filter(g => g.section === section).map(g => {
          const n = data?.counts[g.key];
          return <button key={g.key} type="button" title={g.hint} onClick={() => { setGroup(g.key); setOffset(0); setSelected(new Set()); }}
            aria-current={group === g.key ? "page" : undefined}
            className={cn("flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-[13px]",
              group === g.key ? "bg-blue-50 font-medium text-blue-700" : "text-slate-600 hover:bg-white")}>
            <span className="truncate">{g.key.startsWith("estrellas") && <Star className="mr-1 inline size-3 fill-amber-400 text-amber-400" />}{g.label}</span>
            {n !== undefined && <span className={cn("tabular-nums text-xs", g.section === "Bandeja" && n > 0 ? "rounded-full bg-blue-600 px-1.5 text-white" : "text-slate-400")}>{n}</span>}
          </button>;
        })}
      </div>)}
      <p className="px-2 pt-2 text-[11px] leading-4 text-slate-400">Pronto podrás guardar tus propios grupos.</p>
    </nav>

    {/* Leads of the group */}
    <section aria-label={groupLabel} className={cn("flex w-full min-w-0 flex-col border-r border-slate-200 md:w-80 md:shrink-0", lead && "hidden md:flex")}>
      <div className="space-y-2 border-b border-slate-100 p-2.5">
        <select aria-label="Grupo" className={fieldClass + " lg:hidden"} value={group} onChange={e => { setGroup(e.target.value as GroupKey); setOffset(0); }}>
          {LEAD_GROUPS.map(g => <option key={g.key} value={g.key}>{g.label}{data ? ` (${data.counts[g.key]})` : ""}</option>)}
        </select>
        <label className="relative block">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
          <input aria-label="Buscar lead" value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar lead" className={fieldClass + " pl-8"} />
        </label>
        <div className="flex items-center justify-between text-xs text-slate-500">
          <span>{data ? `${data.total} ${data.total === 1 ? "lead" : "leads"}` : "Cargando…"}</span>
          {selected.size > 0
            ? <span className="flex items-center gap-2"><b className="font-medium text-blue-700">{selected.size} marcados</b>
                <button type="button" onClick={() => setSelected(new Set())} aria-label="Quitar selección"><X className="size-3.5" /></button></span>
            : data && data.total > 0 && <button type="button" onClick={selectGroup} className="font-medium text-blue-600 hover:underline">Marcar todo el grupo</button>}
        </div>
        {selected.size > 0 && <button type="button" disabled={!accountId} onClick={() => setSending([...selected])} className={buttonClass + " w-full py-1.5"}>
          <Send className="size-4" />Enviar plantilla a {selected.size}</button>}
      </div>
      {error && <p role="alert" className="m-2 rounded-lg bg-red-50 p-2 text-xs text-red-700">{error}</p>}
      <ul className="min-h-0 flex-1 overflow-y-auto">
        {data && !items.length && <li className="p-6 text-center text-sm text-slate-400">
          <Inbox className="mx-auto mb-2 size-6 stroke-1" />{q ? "Ningún lead coincide." : "No hay leads en este grupo."}</li>}
        {items.map(l => <LeadRow key={l.key} lead={l} active={l.key === current} checked={!!l.contact && selected.has(l.contact.id)}
          onOpen={() => setCurrent(l.key)}
          onCheck={l.contact ? () => setSelected(s => { const n = new Set(s); const id = l.contact!.id; if (n.has(id)) n.delete(id); else n.add(id); return n; }) : undefined} />)}
      </ul>
      {data && data.total > 50 && <div className="flex items-center justify-between border-t border-slate-100 px-3 py-2 text-xs text-slate-500">
        <button type="button" disabled={offset === 0} onClick={() => setOffset(o => Math.max(0, o - 50))} className="disabled:opacity-40">Anteriores</button>
        <span>{offset + 1}–{Math.min(offset + 50, data.total)} de {data.total}</span>
        <button type="button" disabled={offset + 50 >= data.total} onClick={() => setOffset(o => o + 50)} className="disabled:opacity-40">Siguientes</button>
      </div>}
    </section>

    {/* The lead */}
    <div className={cn("min-w-0 flex-1", !lead && !current && "hidden md:flex")}>
      {lead || current
        ? <LeadDetail key={(lead?.key ?? current)!} lead={lead}
            contactId={lead ? lead.contact?.id ?? null : current && !current.startsWith("conv:") ? current : null} accountId={accountId}
            hasNext={index >= 0 && (index + 1 < items.length || (!!data && offset + 50 < data.total))}
            onNext={next} onBack={() => setCurrent(null)} onChanged={reload} onAdopted={id => { setCurrent(id); reload(); }} />
        : <div className="m-auto flex flex-col items-center gap-2 p-8 text-center text-sm text-slate-400">
            <MessageCircle className="size-10 stroke-1" />
            <p>Elige un lead para ver su conversación,<br />o marca varios para enviarles una plantilla.</p>
          </div>}
    </div>

    {sending && <CampaignDialog accountId={accountId} contactIds={sending} columns={facets?.columns ?? []}
      onClose={() => setSending(null)} onDone={() => { setSelected(new Set()); reload(); }} />}
  </div>;
}

function LeadRow({ lead, active, checked, onOpen, onCheck }: { lead: Item; active: boolean; checked: boolean; onOpen: () => void; onCheck?: () => void }) {
  const c = lead.contact, conv = lead.conversation;
  const name = c?.name ?? conv?.contact_name ?? `+${conv?.contact_phone}`;
  const when = conv?.last_message_at ?? c?.last_contacted_at ?? null;
  const sub = c ? [c.specialty, c.city].filter(Boolean).join(" · ") : `+${conv?.contact_phone}`;
  const preview = lead.lastMessage
    ? `${lead.lastMessage.direction === "out" ? "Tú: " : ""}${lead.lastMessage.text}`
    : c && !c.phone ? "Sin WhatsApp" : c?.last_contacted_at ? "Plantilla enviada" : "Sin contactar";
  return <li className={cn("group flex items-start gap-2 border-b border-slate-100 px-2.5 py-2.5", active ? "bg-blue-50/70" : "hover:bg-slate-50")}>
    <input type="checkbox" aria-label={`Marcar ${name}`} className="mt-1 size-3.5 accent-blue-600 disabled:invisible" checked={checked} disabled={!onCheck} onChange={onCheck} />
    <button type="button" onClick={onOpen} className="min-w-0 flex-1 text-left">
      <span className="flex items-baseline justify-between gap-2">
        <span className={cn("truncate text-[13px]", conv?.unread_count ? "font-semibold text-slate-900" : "font-medium text-slate-800")}>{name}</span>
        <span className="shrink-0 text-[11px] text-slate-400">{when ? shortDate(typeof when === "string" ? when : new Date(when).toISOString()) : ""}</span>
      </span>
      <span className="flex items-center gap-1.5 text-xs text-slate-500">
        <span className="truncate">{sub}</span>
        {c?.rating != null && <span className="inline-flex shrink-0 items-center gap-0.5"><Star className="size-3 fill-amber-400 text-amber-400" />{c.rating.toFixed(1)}</span>}
      </span>
      <span className="mt-0.5 flex items-center gap-1.5">
        <span className={cn("min-w-0 flex-1 truncate text-xs", lead.lastMessage?.direction === "in" ? "text-slate-700" : "text-slate-400")}>{preview}</span>
        {!!conv?.unread_count && <span className="shrink-0 rounded-full bg-blue-600 px-1.5 text-[10px] font-semibold text-white">{conv.unread_count}</span>}
        {c && c.stage !== "Sin contactar" && <span className={cn("shrink-0 rounded-full px-1.5 py-px text-[10px] font-medium", stageTone[c.stage] ?? "bg-slate-100 text-slate-600")}>{c.stage}</span>}
      </span>
    </button>
  </li>;
}

type Detail = { item: ContactDetail; conversation: Conversation | null; sends: { campaign_id: string; template_name: string; status: string; updated_at: string }[] };

function LeadDetail({ lead, contactId, accountId, hasNext, onNext, onBack, onChanged, onAdopted }: {
  lead: Item | null; contactId: string | null; accountId: string; hasNext: boolean; onNext: () => void; onBack: () => void; onChanged: () => void;
  onAdopted: (contactId: string) => void;
}) {
  const [detail, setDetail] = useState<Detail | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [notes, setNotes] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!contactId) return;
    try {
      const d = await waApi<Detail>(`contacts/one?id=${contactId}${accountId ? `&accountId=${accountId}` : ""}`);
      setDetail(d); setNotes(n => n ?? d.item.notes ?? "");
    } catch (e) { setError(errorText(e)); }
  }, [contactId, accountId]);
  useEffect(() => { void load(); }, [load]);

  async function update(patch: Record<string, unknown>) {
    if (!contactId) return;
    setBusy(true); setError("");
    try { await waApi("contacts/update", { id: contactId, ...patch }); await load(); onChanged(); }
    catch (e) { setError(errorText(e)); }
    finally { setBusy(false); }
  }
  async function adopt() {
    if (!lead?.conversation) return;
    setBusy(true); setError("");
    try { const r = await waApi<{ id: string }>("leads/adopt", { conversationId: lead.conversation.id }); onAdopted(r.id); }
    catch (e) { setError(errorText(e)); }
    finally { setBusy(false); }
  }

  const c = detail?.item;
  const conversation = (c ? detail?.conversation : lead?.conversation as unknown as Conversation | null) ?? null;
  const phone = c?.phone ?? lead?.conversation?.contact_phone ?? null;
  const name = c?.name ?? lead?.conversation?.contact_name ?? (phone ? `+${phone}` : "Lead");

  if (!lead && !contactId) return <p className="m-auto p-8 text-sm text-slate-400">Elige un lead de la lista.</p>;
  return <div className="flex h-full min-h-0 flex-col">
    <header className="flex flex-wrap items-center gap-2 border-b border-slate-100 px-4 py-2.5">
      <button type="button" onClick={onBack} className="text-xs text-slate-500 md:hidden">← Leads</button>
      <div className="min-w-0 flex-1">
        <h3 className="truncate text-sm font-semibold text-slate-900">{name}</h3>
        <p className="flex flex-wrap items-center gap-1.5 text-xs text-slate-500">
          {c ? <>{[c.specialty, c.city].filter(Boolean).join(" · ")}
            {c.rating !== null && <span className="inline-flex items-center gap-0.5"><Star className="size-3 fill-amber-400 text-amber-400" />{c.rating.toFixed(1)}</span>}
            {c.classification && <span className={cn("rounded-full px-1.5 py-px text-[10px] font-medium", classificationTone(c.classification))}>{c.classification}</span>}</>
            : phone ? `+${phone} · no está en tus contactos` : ""}
        </p>
      </div>
      {c && <>
        <select aria-label="Seguimiento" value={c.stage} disabled={busy} onChange={e => void update({ stage: e.target.value })}
          className={cn("rounded-full border-0 py-1 pl-2.5 pr-7 text-xs font-medium", stageTone[c.stage] ?? "bg-slate-100")}>
          {[...new Set([c.stage, ...STAGES])].map(s => <option key={s}>{s}</option>)}
        </select>
        <button type="button" className={ghost} disabled={busy || c.stage === "Interesado"} onClick={() => void update({ stage: "Interesado" })}><ThumbsUp className="size-3.5 text-emerald-600" />Interesado</button>
        <button type="button" className={ghost} disabled={busy || c.stage === "Descartado"} onClick={() => void update({ stage: "Descartado" })}><ThumbsDown className="size-3.5 text-rose-600" />Descartar</button>
      </>}
      {!c && lead?.conversation && <button type="button" className={ghost} disabled={busy} onClick={() => void adopt()}><UserPlus className="size-3.5" />Añadir a contactos</button>}
      <button type="button" className={buttonClass + " px-3 py-1.5 text-xs"} disabled={!hasNext} onClick={onNext} title="Pasar al siguiente lead del grupo">
        Siguiente<ArrowRight className="size-3.5" /></button>
    </header>
    {error && <p role="alert" className="border-b border-red-100 bg-red-50 px-4 py-1.5 text-xs text-red-700">{error}</p>}

    <div className="grid min-h-0 flex-1 grid-cols-1 xl:grid-cols-[minmax(0,1fr)_260px]">
      <div className="flex min-h-0 flex-col">
        {contactId && !c ? <div className="m-auto"><Loader2 className="size-5 animate-spin text-slate-300" /></div>
          : !accountId ? <p className="m-auto max-w-xs p-6 text-center text-sm text-slate-400">Conecta un número en Configuración › Números para escribir a tus leads.</p>
          : !phone ? <p className="m-auto max-w-xs p-6 text-center text-sm text-slate-400">Este contacto no tiene WhatsApp. Puedes escribirle por email o completar su teléfono en Contactos.</p>
          : c?.do_not_contact && !conversation ? <p className="m-auto max-w-xs p-6 text-center text-sm text-slate-400">Está marcado como «No contactar».</p>
          : <>
            {!conversation && <div className="border-b border-blue-100 bg-blue-50/60 px-4 py-2 text-xs text-blue-900">
              <b className="font-semibold">Primer contacto.</b> Elige una plantilla aprobada: {"{{1}}"} se rellena con «{name}» y puedes cambiar cualquier variable antes de enviar.
              {c && !c.consent && <span className="block text-amber-800">No consta que haya dado permiso para recibir WhatsApp.</span>}
            </div>}
            <ChatThread key={conversation?.id ?? "new"} accountId={accountId} conversation={conversation} to={phone} onTo={() => {}}
              prefill={[name]} onBack={() => { void load(); onChanged(); }} onSent={() => { void load(); onChanged(); }} embedded />
          </>}
      </div>

      {c && <aside aria-label="Ficha del lead" className="hidden min-h-0 space-y-4 overflow-y-auto border-l border-slate-100 bg-slate-50/50 p-4 text-xs xl:block">
        <section className="space-y-1.5">
          <h4 className="font-semibold text-slate-700">Ficha</h4>
          <p className="text-slate-600">{phone ? `+${phone}` : "Sin WhatsApp"}</p>
          {c.email && <p className="truncate text-slate-600">{c.email}</p>}
          <p className="flex flex-wrap gap-3">
            {c.website && <a href={c.website} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-blue-600"><Globe className="size-3" />Web</a>}
            {c.maps_url && <a href={c.maps_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-blue-600"><MapPin className="size-3" />Maps</a>}
            <a href={`/whatsapp/contacts`} className="inline-flex items-center gap-1 text-slate-500 hover:text-blue-600"><ExternalLink className="size-3" />Contactos</a>
          </p>
          <div className="flex flex-wrap items-center gap-1.5 pt-1">
            <PermissionPill contact={c} />
            <button type="button" disabled={busy} onClick={() => void update({ consent: !c.consent })} className="text-[11px] text-blue-600 hover:underline">
              {c.consent ? "Quitar permiso" : <><ShieldCheck className="mr-0.5 inline size-3" />Registrar permiso</>}</button>
            <button type="button" disabled={busy} onClick={() => void update({ do_not_contact: !c.do_not_contact })} className="text-[11px] text-slate-500 hover:underline">
              {c.do_not_contact ? "Quitar «No contactar»" : <><Ban className="mr-0.5 inline size-3" />No contactar</>}</button>
          </div>
        </section>
        <section className="space-y-1.5">
          <h4 className="font-semibold text-slate-700">Historial</h4>
          <ol className="space-y-1 text-slate-600">
            {(detail?.sends ?? []).map(s => <li key={s.campaign_id}>{shortDate(s.updated_at)} · Plantilla «{s.template_name}» {s.status === "sent" ? "enviada" : s.status === "skipped" ? "no enviada" : s.status === "failed" ? "con error" : s.status}</li>)}
            {c.last_contacted_at && <li>{shortDate(c.last_contacted_at)} · Último envío</li>}
            {c.last_reply_at && <li className="text-amber-800">{shortDate(c.last_reply_at)} · Respondió</li>}
            <li className="text-slate-400">{shortDate(c.created_at)} · Importado</li>
          </ol>
        </section>
        <section className="space-y-1.5">
          <h4 className="font-semibold text-slate-700">Notas</h4>
          <textarea aria-label="Notas" rows={4} maxLength={5000} value={notes ?? ""} onChange={e => setNotes(e.target.value)} placeholder="Qué le interesa, cuándo volver a llamar…"
            className={fieldClass + " resize-none text-xs"} />
          {(notes ?? "") !== (c.notes ?? "") && <button type="button" disabled={busy} onClick={() => void update({ notes })} className={ghost}><Check className="size-3.5" />Guardar nota</button>}
        </section>
      </aside>}
    </div>
  </div>;
}
