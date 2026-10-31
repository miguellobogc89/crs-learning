"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  Ban,
  ChevronLeft,
  ChevronRight,
  Filter,
  Loader2,
  MessageCircle,
  Search,
  Send,
  ShieldCheck,
  Star,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { waApi, buttonClass, errorText, fieldClass } from "./api";
import { ContactImport } from "./contact-import";
import { ContactPanel } from "./contact-panel";
import { CampaignDialog } from "./campaign-dialog";
import { STAGES } from "@/lib/whatsapp/contacts";
import type { ContactFacets, ContactRow, Facet } from "@/lib/whatsapp/types";

type Filters = Record<string, string>;
const FILTERS: { key: string; label: string; more?: boolean }[] = [
  { key: "category", label: "Categoría" },
  { key: "specialty", label: "Especialidad" },
  { key: "province", label: "Provincia" },
  { key: "classification", label: "Clasificación" },
  { key: "stage", label: "Seguimiento" },
  { key: "city", label: "Localidad", more: true },
];
const STATE_FILTERS: { key: string; label: string; options: [string, string][] }[] = [
  { key: "whatsapp", label: "WhatsApp", options: [["yes", "Con WhatsApp"], ["no", "Sin WhatsApp"]] },
  { key: "consent", label: "Autorización", options: [["yes", "Con autorización"], ["no", "Sin autorización"]] },
  {
    key: "contacted",
    label: "Contacto",
    options: [["no", "Nunca contactados"], ["yes", "Ya contactados"], ["replied", "Han respondido"], ["blocked", "No contactar"]],
  },
];
const ghost =
  "inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-50";

export const stageTone: Record<string, string> = {
  "Sin contactar": "bg-slate-100 text-slate-600",
  Contactado: "bg-blue-50 text-blue-700",
  Respondió: "bg-amber-50 text-amber-700",
  Interesado: "bg-emerald-50 text-emerald-700",
  Cliente: "bg-emerald-100 text-emerald-800",
  Descartado: "bg-red-50 text-red-700",
};
export function classificationTone(value: string | null) {
  const v = (value || "").toLowerCase();
  if (v.startsWith("descart")) return "bg-red-50 text-red-700";
  if (v.startsWith("revis")) return "bg-amber-50 text-amber-700";
  if (!v) return "";
  return "bg-emerald-50 text-emerald-700";
}
export function shortDate(value: string | null) {
  if (!value) return "";
  const d = new Date(value);
  const today = new Date();
  return d.toDateString() === today.toDateString()
    ? d.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" })
    : d.toLocaleDateString("es-ES", { day: "2-digit", month: "short" });
}

/** Stages always offer the standard steps, even before any contact reaches them. */
function optionsFor(key: string, facets: Record<string, Facet[]>): Facet[] {
  const list = facets[key] || [];
  if (key !== "stage") return list;
  const values = [...new Set([...STAGES, ...list.map((o) => o.value || "")])].filter(Boolean);
  return values.map((value) => ({ value, count: list.find((o) => o.value === value)?.count || 0 }));
}

function query(filters: Filters, extra: Record<string, string | number> = {}) {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries({ ...filters, ...extra })) if (v !== "" && v !== undefined) p.set(k, String(v));
  return p.toString();
}

export function WhatsAppContacts({
  accountId,
  canManage,
}: {
  accountId: string;
  canManage: boolean;
}) {
  const [filters, setFilters] = useState<Filters>({});
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<{ key: string; dir: "asc" | "desc" }>({ key: "rating", dir: "desc" });
  const [offset, setOffset] = useState(0);
  const [data, setData] = useState<{ items: ContactRow[]; total: number; all: number } | null>(null);
  const [facets, setFacets] = useState<ContactFacets | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [openId, setOpenId] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [sending, setSending] = useState(false);
  const [more, setMore] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [revision, setRevision] = useState(0);
  const reload = useCallback(() => setRevision((n) => n + 1), []);

  useEffect(() => {
    const t = setTimeout(() => {
      setFilters((f) => (f.q === search ? f : { ...f, q: search }));
      setOffset(0);
    }, 300);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    const c = new AbortController();
    void waApi<{ items: ContactRow[]; total: number; all: number }>(
      `contacts?${query(filters, { sort: sort.key, dir: sort.dir, offset, ...(accountId ? { accountId } : {}) })}`,
      undefined,
      c.signal,
    )
      .then((d) => {
        setData(d);
        setError("");
      })
      .catch((e) => {
        if (!c.signal.aborted) setError(errorText(e));
      });
    return () => c.abort();
  }, [filters, sort, offset, accountId, revision]);

  useEffect(() => {
    const c = new AbortController();
    void waApi<ContactFacets>("contacts/facets", undefined, c.signal)
      .then(setFacets)
      .catch(() => {});
    return () => c.abort();
  }, [revision]);

  function setFilter(key: string, value: string) {
    setFilters((f) => ({ ...f, [key]: value }));
    setOffset(0);
  }
  function toggleSort(key: string) {
    setSort((s) => (s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: key === "name" || key === "city" ? "asc" : "desc" }));
    setOffset(0);
  }
  const items = data?.items || [];
  const pageIds = items.map((c) => c.id);
  const allPageSelected = pageIds.length > 0 && pageIds.every((id) => selected.has(id));
  const activeFilters = Object.entries(filters).filter(([k, v]) => v && k !== "q").length;

  async function selectAllFiltered() {
    try {
      const d = await waApi<{ ids: string[] }>(`contacts/ids?${query(filters)}`);
      setSelected(new Set(d.ids));
    } catch (e) {
      setError(errorText(e));
    }
  }
  async function bulk(path: string, body: Record<string, unknown>, confirmText?: string) {
    if (confirmText && !window.confirm(confirmText)) return;
    setBusy(true);
    try {
      await waApi(path, { ids: [...selected], ...body });
      if (path === "contacts/delete") setSelected(new Set());
      reload();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }

  const facetOptions = useMemo(() => facets?.facets || {}, [facets]);

  if (data && data.all === 0 && !importing)
    return (
      <div className="grid flex-1 place-content-center gap-4 text-center">
        <div className="mx-auto grid h-14 w-14 place-content-center rounded-2xl bg-blue-50 text-blue-600">
          <Upload className="h-6 w-6" />
        </div>
        <div>
          <h3 className="text-base font-semibold text-slate-800">Importa tu lista de contactos</h3>
          <p className="mt-1 max-w-md text-sm text-slate-500">
            Sube un CSV con tus prospectos. Podrás filtrarlos por tipo, ver su historial de WhatsApp y enviarles plantillas.
          </p>
        </div>
        <button className={buttonClass + " mx-auto"} onClick={() => setImporting(true)}>
          <Upload className="h-4 w-4" /> Importar CSV
        </button>
      </div>
    );

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="flex shrink-0 flex-wrap items-center gap-2">
        <label className="relative min-w-56 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            aria-label="Buscar contactos"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por empresa, localidad, email o teléfono"
            className={fieldClass + " pl-9"}
          />
        </label>
        <button className={ghost} onClick={() => setMore((m) => !m)} aria-expanded={more}>
          <Filter className="h-4 w-4" /> Filtros{activeFilters ? ` (${activeFilters})` : ""}
        </button>
        <button className={ghost} onClick={() => setImporting(true)}>
          <Upload className="h-4 w-4" /> Importar CSV
        </button>
      </div>

      {more && (
        <div className="grid shrink-0 grid-cols-2 gap-2 rounded-xl border border-slate-200 bg-slate-50/60 p-3 sm:grid-cols-3 lg:grid-cols-5">
          {FILTERS.map((f) => (
            <label key={f.key} className="text-xs text-slate-500">
              {f.label}
              <select
                className={fieldClass + " mt-1"}
                value={filters[f.key] || ""}
                onChange={(e) => setFilter(f.key, e.target.value)}
              >
                <option value="">Todas</option>
                {optionsFor(f.key, facetOptions).map((o) => (
                  <option key={o.value ?? "__none__"} value={o.value ?? "__none__"}>
                    {o.value ?? "(vacío)"} · {o.count}
                  </option>
                ))}
              </select>
            </label>
          ))}
          {STATE_FILTERS.map((f) => (
            <label key={f.key} className="text-xs text-slate-500">
              {f.label}
              <select className={fieldClass + " mt-1"} value={filters[f.key] || ""} onChange={(e) => setFilter(f.key, e.target.value)}>
                <option value="">Todos</option>
                {f.options.map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </select>
            </label>
          ))}
          {activeFilters > 0 && (
            <button
              className="self-end text-left text-xs font-medium text-blue-600 sm:col-span-1"
              onClick={() => {
                setFilters((f) => ({ q: f.q || "" }));
                setOffset(0);
              }}
            >
              Quitar filtros
            </button>
          )}
        </div>
      )}

      {error && (
        <p role="alert" className="shrink-0 rounded-lg bg-red-50 p-3 text-sm text-red-700">
          {error}
        </p>
      )}

      {selected.size > 0 && (
        <div className="flex shrink-0 flex-wrap items-center gap-2 rounded-xl border border-blue-100 bg-blue-50/70 px-3 py-2 text-sm">
          <span className="font-medium text-blue-800">
            {selected.size} seleccionado{selected.size === 1 ? "" : "s"}
          </span>
          {data && selected.size < data.total && (
            <button className="text-blue-700 underline" onClick={selectAllFiltered}>
              Seleccionar los {data.total} de la lista
            </button>
          )}
          <button className="text-slate-500 hover:text-slate-700" onClick={() => setSelected(new Set())}>
            <X className="inline h-3.5 w-3.5" /> Quitar selección
          </button>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <select
              aria-label="Cambiar seguimiento"
              className={fieldClass + " w-auto py-1.5"}
              value=""
              disabled={busy}
              onChange={(e) => e.target.value && void bulk("contacts/update", { stage: e.target.value })}
            >
              <option value="">Cambiar seguimiento…</option>
              {STAGES.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
            <button
              className={ghost + " py-1.5"}
              disabled={busy}
              onClick={() => bulk("contacts/update", { do_not_contact: true }, `¿Marcar ${selected.size} contactos como «No contactar»?`)}
            >
              <Ban className="h-4 w-4" /> No contactar
            </button>
            {canManage && (
              <button
                className={ghost + " py-1.5 text-red-600"}
                disabled={busy}
                onClick={() => bulk("contacts/delete", {}, `¿Eliminar ${selected.size} contactos? El historial de WhatsApp se conserva.`)}
              >
                <Trash2 className="h-4 w-4" /> Eliminar
              </button>
            )}
            <button className={buttonClass + " py-1.5"} disabled={!accountId || busy} onClick={() => setSending(true)} title={accountId ? undefined : "Conecta un número en Configuración › Números"}>
              <Send className="h-4 w-4" /> Enviar plantilla
            </button>
          </div>
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-auto rounded-xl border border-slate-200 bg-white">
        <table className="w-full min-w-[860px] text-sm">
          <thead className="sticky top-0 z-10 bg-slate-50 text-left text-xs text-slate-500">
            <tr>
              <th className="w-10 px-3 py-2">
                <input
                  type="checkbox"
                  aria-label="Seleccionar página"
                  checked={allPageSelected}
                  onChange={() =>
                    setSelected((s) => {
                      const n = new Set(s);
                      for (const id of pageIds) {
                        if (allPageSelected) n.delete(id);
                        else n.add(id);
                      }
                      return n;
                    })
                  }
                />
              </th>
              <SortHeader label="Empresa" k="name" sort={sort} onSort={toggleSort} />
              <SortHeader label="Localidad" k="city" sort={sort} onSort={toggleSort} />
              <SortHeader label="Estrellas" k="rating" sort={sort} onSort={toggleSort} />
              <th className="px-3 py-2 font-medium">Clasificación</th>
              <th className="px-3 py-2 font-medium">Seguimiento</th>
              <th className="px-3 py-2 font-medium">WhatsApp</th>
              <SortHeader label="Último envío" k="recent" sort={sort} onSort={toggleSort} />
            </tr>
          </thead>
          <tbody>
            {!data && (
              <tr>
                <td colSpan={8} className="px-3 py-10 text-center text-slate-400">
                  <Loader2 className="mr-2 inline h-4 w-4 animate-spin" /> Cargando contactos…
                </td>
              </tr>
            )}
            {data && !items.length && (
              <tr>
                <td colSpan={8} className="px-3 py-10 text-center text-slate-400">
                  Ningún contacto coincide con la búsqueda o los filtros.
                </td>
              </tr>
            )}
            {items.map((c) => (
              <tr
                key={c.id}
                onClick={() => setOpenId(c.id)}
                className={`cursor-pointer border-t border-slate-100 hover:bg-slate-50 ${openId === c.id ? "bg-blue-50/50" : ""} ${c.do_not_contact ? "text-slate-400" : ""}`}
              >
                <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
                  <input
                    type="checkbox"
                    aria-label={`Seleccionar ${c.name}`}
                    checked={selected.has(c.id)}
                    onChange={() =>
                      setSelected((s) => {
                        const n = new Set(s);
                        if (n.has(c.id)) n.delete(c.id);
                        else n.add(c.id);
                        return n;
                      })
                    }
                  />
                </td>
                <td className="max-w-80 px-3 py-2">
                  <p className="truncate font-medium text-slate-800">{c.name}</p>
                  <p className="truncate text-xs text-slate-400">{[c.specialty, c.category].filter(Boolean).join(" · ")}</p>
                </td>
                <td className="px-3 py-2 text-slate-600">
                  {c.city || "—"}
                  {c.province && c.province !== c.city && <span className="block text-xs text-slate-400">{c.province}</span>}
                </td>
                <td className="whitespace-nowrap px-3 py-2">
                  {c.rating !== null ? (
                    <span className="inline-flex items-center gap-1 text-slate-700">
                      <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
                      {c.rating.toFixed(1)}
                    </span>
                  ) : (
                    <span className="text-slate-300">—</span>
                  )}
                </td>
                <td className="px-3 py-2">
                  {c.classification && (
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${classificationTone(c.classification)}`}>{c.classification}</span>
                  )}
                </td>
                <td className="px-3 py-2">
                  <span className={`whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ${stageTone[c.stage] || "bg-slate-100 text-slate-600"}`}>{c.stage}</span>
                  {c.do_not_contact && (
                    <span className="ml-1 whitespace-nowrap rounded-full bg-red-50 px-2 py-0.5 text-xs font-medium text-red-700">No contactar</span>
                  )}
                </td>
                <td className="whitespace-nowrap px-3 py-2">
                  {c.phone ? (
                    <span className="inline-flex items-center gap-1.5 text-slate-700">
                      +{c.phone}
                      {c.consent ? (
                        <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" aria-label="Con autorización" />
                      ) : (
                        <span className="rounded bg-amber-50 px-1 text-[10px] font-medium text-amber-700" title="Sin autorización registrada para recibir WhatsApp">
                          sin permiso
                        </span>
                      )}
                      {c.conversation?.unread_count ? (
                        <span className="inline-flex items-center gap-0.5 rounded-full bg-blue-600 px-1.5 text-[10px] font-semibold text-white">
                          <MessageCircle className="h-3 w-3" />
                          {c.conversation.unread_count}
                        </span>
                      ) : null}
                    </span>
                  ) : (
                    <span className="text-xs text-slate-400">Sin WhatsApp</span>
                  )}
                </td>
                <td className="whitespace-nowrap px-3 py-2 text-xs text-slate-500">
                  {c.last_contacted_at ? shortDate(c.last_contacted_at) : "—"}
                  {c.last_reply_at && <span className="block text-amber-700">Respondió {shortDate(c.last_reply_at)}</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {data && data.total > 0 && (
        <div className="flex shrink-0 items-center justify-between text-xs text-slate-500">
          <span>
            {offset + 1}–{Math.min(offset + 50, data.total)} de {data.total}
            {data.total !== data.all ? ` (de ${data.all} en total)` : ""}
          </span>
          <div className="flex gap-1">
            <button className={ghost + " px-2 py-1"} disabled={offset === 0} onClick={() => setOffset((o) => Math.max(0, o - 50))} aria-label="Página anterior">
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button className={ghost + " px-2 py-1"} disabled={offset + 50 >= data.total} onClick={() => setOffset((o) => o + 50)} aria-label="Página siguiente">
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {openId && (
        <ContactPanel
          key={openId}
          contactId={openId}
          accountId={accountId}
          onClose={() => setOpenId(null)}
          onChanged={reload}
        />
      )}
      <ContactImport
        open={importing}
        onClose={() => setImporting(false)}
        onImported={() => {
          reload();
        }}
      />
      {sending && (
        <CampaignDialog
          accountId={accountId}
          contactIds={[...selected]}
          columns={facets?.columns || []}
          onClose={() => setSending(false)}
          onDone={() => {
            setSelected(new Set());
            reload();
          }}
        />
      )}
    </div>
  );
}

function SortHeader({
  label,
  k,
  sort,
  onSort,
}: {
  label: string;
  k: string;
  sort: { key: string; dir: "asc" | "desc" };
  onSort: (k: string) => void;
}) {
  const active = sort.key === k;
  return (
    <th className="px-3 py-2 font-medium" aria-sort={active ? (sort.dir === "asc" ? "ascending" : "descending") : undefined}>
      <button className={`inline-flex items-center gap-1 ${active ? "text-slate-800" : ""}`} onClick={() => onSort(k)}>
        {label}
        {active && (sort.dir === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />)}
      </button>
    </th>
  );
}
