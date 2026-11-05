"use client";
import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Loader2,
  RefreshCw,
  Search,
} from "lucide-react";
import type { ReviewStatus, TenderRow } from "@/lib/tenders/service";

const REVIEW_STATUSES: ReviewStatus[] = ["Nueva", "Interesa", "Preparando", "Presentada", "Descartada"];

const reviewTone: Record<ReviewStatus, string> = {
  Nueva: "bg-slate-100 text-slate-700",
  Interesa: "bg-blue-50 text-blue-700",
  Preparando: "bg-amber-50 text-amber-800",
  Presentada: "bg-emerald-50 text-emerald-800",
  Descartada: "bg-red-50 text-red-700",
};
const kindTone: Record<string, string> = {
  abreviado: "bg-blue-50 text-blue-700",
  simplificado: "bg-slate-100 text-slate-700",
  menor: "bg-violet-50 text-violet-700",
};
const kindShort: Record<string, string> = {
  abreviado: "Abreviado",
  simplificado: "Simplificado",
  menor: "Menor",
};

type SyncFeed = {
  feed: string;
  lastRunAt: string | null;
  backfillDone: boolean;
  pending: boolean;
  lastResult: { error?: string | null } | null;
};
type ListResponse = {
  items: TenderRow[];
  total: number;
  page: number;
  pageSize: number;
  provinces: string[];
  sync: SyncFeed[];
  canSync: boolean;
};
type SyncSummary = {
  feeds: {
    feed: string;
    pages: number;
    tenders: number;
    backfillDone: boolean;
    reached: string | null;
    skipped?: boolean;
    error?: string;
  }[];
  open: number;
  target: string;
};
const FEED_LABELS: Record<string, string> = {
  licitaciones: "Plataforma estatal",
  agregadas: "plataformas autonómicas",
  menores: "contratos menores",
};
/** Tope de pasadas por pulsación (~45 s cada una). */
const MAX_SYNC_ROUNDS = 80;
type Filters = {
  q: string;
  kind: string;
  scope: string;
  province: string;
  review: string;
  sort: string;
};

const field =
  "rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100";
const ghost =
  "inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-50";

const money = new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
const dateFmt = new Intl.DateTimeFormat("es-ES", {
  day: "2-digit",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Europe/Madrid",
});

function errorText(e: unknown) {
  return e instanceof Error ? e.message : "No se pudo completar la operación";
}
async function api<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(`/api/tenders/${path}`, {
    method: body === undefined ? "GET" : "POST",
    cache: "no-store",
    ...(body === undefined
      ? {}
      : { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "No se pudo completar la operación");
  return data as T;
}

function daysLeft(deadline: string | null) {
  if (!deadline) return null;
  return Math.ceil((new Date(deadline).getTime() - Date.now()) / 86_400_000);
}
function DeadlineCell({ deadline }: { deadline: string | null }) {
  const days = daysLeft(deadline);
  if (days === null) return <span className="text-slate-400">Sin fecha</span>;
  const tone =
    days <= 3 ? "text-red-700" : days <= 7 ? "text-amber-700" : "text-slate-700";
  return (
    <div className="leading-tight">
      <div className={`text-sm font-semibold ${tone}`}>
        {days <= 0 ? "Hoy" : days === 1 ? "1 día" : `${days} días`}
      </div>
      <div className="text-xs text-slate-500">{dateFmt.format(new Date(deadline!))}</div>
    </div>
  );
}

export function TendersWorkspace() {
  const [filters, setFilters] = useState<Filters>({
    q: "",
    kind: "todos",
    scope: "software",
    province: "",
    review: "pendientes",
    sort: "plazo",
  });
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<ListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const params = new URLSearchParams({ ...filters, page: String(page) });
    try {
      setData(await api<ListResponse>(`list?${params}`));
    } catch (e) {
      setError(errorText(e));
    } finally {
      setLoading(false);
    }
  }, [filters, page]);

  useEffect(() => {
    void load();
  }, [load]);

  // La búsqueda se aplica al dejar de escribir.
  useEffect(() => {
    const t = setTimeout(() => {
      setFilters((f) => (f.q === query ? f : { ...f, q: query }));
      setPage(1);
    }, 350);
    return () => clearTimeout(t);
  }, [query]);

  const setFilter = (key: keyof Filters, value: string) => {
    setFilters((f) => ({ ...f, [key]: value }));
    setPage(1);
  };

  const [stopRequested, setStopRequested] = useState(false);
  const stopRef = useRef(false);

  // Una sola pulsación sigue leyendo (en tramos de ~45 s) hasta terminar la carga inicial.
  const sync = async () => {
    setSyncing(true);
    setSyncMessage(null);
    stopRef.current = false;
    setStopRequested(false);
    const dayFmt = new Intl.DateTimeFormat("es-ES", { day: "numeric", month: "short", timeZone: "Europe/Madrid" });
    try {
      for (let round = 1; round <= MAX_SYNC_ROUNDS; round++) {
        const r = await api<SyncSummary>("sync", {});
        const errors = r.feeds.filter((f) => f.error);
        const pages = r.feeds.reduce((n, f) => n + f.pages, 0);
        // Progreso del primer feed que aún esté en carga inicial.
        const main = r.feeds.find((f) => !f.backfillDone && f.feed !== "menores");
        const pending = r.feeds.some((f) => !f.backfillDone);
        await load();
        // Un fallo puntual de un feed no detiene la carga si los demás siguen avanzando.
        if (errors.length && pages === 0) {
          setSyncMessage(`Error al leer la Plataforma: ${errors.map((f) => `${FEED_LABELS[f.feed] ?? f.feed}: ${f.error}`).join(" · ")}`);
          break;
        }
        const progress =
          main && main.reached
            ? ` Carga inicial (${FEED_LABELS[main.feed] ?? main.feed}): leído hasta el ${dayFmt.format(new Date(main.reached))} (objetivo: ${dayFmt.format(new Date(r.target))}).`
            : main
              ? ` Carga inicial (${FEED_LABELS[main.feed] ?? main.feed}): empezando.`
              : "";
        if (!pending) {
          setSyncMessage(`Actualizado. ${r.open.toLocaleString("es-ES")} licitaciones en plazo.`);
          break;
        }
        if (stopRef.current) {
          setSyncMessage(`Detenido.${progress} Pulsa Actualizar para continuar.`);
          break;
        }
        if (pages === 0) {
          setSyncMessage(`No se pudo avanzar en esta pasada.${progress} Vuelve a intentarlo en unos minutos.`);
          break;
        }
        setSyncMessage(
          `Leyendo… pasada ${round}, ${pages} páginas en la última.${progress} ${r.open.toLocaleString("es-ES")} licitaciones en plazo hasta ahora.`,
        );
      }
    } catch (e) {
      setSyncMessage(errorText(e));
    } finally {
      setSyncing(false);
    }
  };

  const updateReview = (id: string, review: TenderRow["review"]) =>
    setData((d) => d && { ...d, items: d.items.map((t) => (t.id === id ? { ...t, review } : t)) });

  const lastRun = data?.sync
    .map((s) => s.lastRunAt)
    .filter((d): d is string => !!d)
    .sort()
    .at(-1);
  const neverSynced = data && !data.sync.length;
  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  return (
    <div className="space-y-4 px-5 sm:px-6 lg:px-8">
      <div className="flex flex-wrap items-center gap-2 border border-slate-200 bg-white p-3">
        <label className="relative min-w-[220px] flex-1">
          <span className="sr-only">Buscar</span>
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar por título, órgano, expediente o CPV"
            className={`${field} w-full pl-9`}
          />
        </label>
        <label>
          <span className="sr-only">Ámbito</span>
          <select className={field} value={filters.scope} onChange={(e) => setFilter("scope", e.target.value)}>
            <option value="software">Solo software e informática</option>
            <option value="todo">Todos los sectores</option>
          </select>
        </label>
        <label>
          <span className="sr-only">Tipo de contrato</span>
          <select className={field} value={filters.kind} onChange={(e) => setFilter("kind", e.target.value)}>
            <option value="todos">Todos los tipos</option>
            <option value="abreviado">Simplificado abreviado (&lt; 60.000 €)</option>
            <option value="simplificado">Simplificado (hasta 140.000 €)</option>
            <option value="menor">Contrato menor</option>
          </select>
        </label>
        <label>
          <span className="sr-only">Provincia</span>
          <select className={field} value={filters.province} onChange={(e) => setFilter("province", e.target.value)}>
            <option value="">Toda España</option>
            {data?.provinces.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className="sr-only">Valoración</span>
          <select className={field} value={filters.review} onChange={(e) => setFilter("review", e.target.value)}>
            <option value="pendientes">Sin descartar ni presentar</option>
            <option value="todas">Todas las valoraciones</option>
            {REVIEW_STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className="sr-only">Ordenar</span>
          <select className={field} value={filters.sort} onChange={(e) => setFilter("sort", e.target.value)}>
            <option value="plazo">Cierran antes</option>
            <option value="importe">Mayor importe</option>
            <option value="recientes">Publicadas recientemente</option>
          </select>
        </label>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-slate-600">
        <div>
          {data ? (
            <>
              <span className="font-semibold text-slate-900">{data.total.toLocaleString("es-ES")}</span>{" "}
              licitaciones en plazo
              {lastRun ? ` · Última lectura: ${dateFmt.format(new Date(lastRun))}` : ""}
            </>
          ) : (
            " "
          )}
        </div>
        {data?.canSync && (
          <div className="flex items-center gap-2">
            {syncing && (
              <button
                type="button"
                className={ghost}
                disabled={stopRequested}
                onClick={() => {
                  stopRef.current = true;
                  setStopRequested(true);
                }}
              >
                {stopRequested ? "Deteniendo al terminar la pasada…" : "Detener"}
              </button>
            )}
            <button type="button" className={ghost} onClick={sync} disabled={syncing}>
              {syncing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              {syncing ? "Leyendo la Plataforma…" : "Actualizar"}
            </button>
          </div>
        )}
      </div>

      {syncMessage && (
        <p role="status" className="border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
          {syncMessage}
        </p>
      )}
      {error && (
        <p role="alert" className="border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}

      {neverSynced && !loading && (
        <div className="border border-slate-200 bg-white p-6 text-sm text-slate-600">
          Todavía no se ha leído la Plataforma de Contratación.{" "}
          {data?.canSync
            ? "Pulsa Actualizar para hacer la primera carga. Lee unos 45 días hacia atrás y puede tardar varios minutos; puedes seguir usando la página mientras tanto."
            : "Pide a un administrador del espacio que pulse Actualizar."}
        </div>
      )}

      <div className="overflow-x-auto border border-slate-200 bg-white">
        <table className="w-full min-w-[920px] border-collapse text-left text-sm">
          <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
            <tr>
              <th scope="col" className="w-24 px-4 py-3">Plazo</th>
              <th scope="col" className="px-4 py-3">Licitación</th>
              <th scope="col" className="w-32 px-4 py-3">Tipo</th>
              <th scope="col" className="w-32 px-4 py-3 text-right">Importe</th>
              <th scope="col" className="w-36 px-4 py-3">Provincia</th>
              <th scope="col" className="w-36 px-4 py-3">Valoración</th>
              <th scope="col" className="w-10 px-2 py-3"><span className="sr-only">Detalle</span></th>
            </tr>
          </thead>
          <tbody>
            {loading && !data ? (
              <tr>
                <td colSpan={7} className="px-4 py-10 text-center text-slate-500">
                  <Loader2 className="mx-auto h-5 w-5 animate-spin" />
                </td>
              </tr>
            ) : data && data.items.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-10 text-center text-slate-500">
                  No hay licitaciones en plazo con estos filtros.
                </td>
              </tr>
            ) : (
              data?.items.map((t) => (
                <Fragment key={t.id}>
                  <tr className="border-t border-slate-100 align-top hover:bg-slate-50/60">
                    <td className="px-4 py-3">
                      <DeadlineCell deadline={t.deadline} />
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-medium text-slate-900">{t.title}</div>
                      <div className="mt-0.5 text-xs text-slate-500">
                        {[t.contractingBody, t.folderId && `Exp. ${t.folderId}`, t.contractType]
                          .filter(Boolean)
                          .join(" · ")}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-block rounded px-2 py-0.5 text-xs font-medium ${kindTone[t.kind] ?? "bg-slate-100 text-slate-700"}`}>
                        {kindShort[t.kind] ?? t.kind}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-slate-900">
                      {t.amount !== null ? money.format(t.amount) : <span className="text-slate-400">—</span>}
                    </td>
                    <td className="px-4 py-3 text-slate-700">
                      {t.province ?? <span className="text-slate-400">—</span>}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-block rounded px-2 py-0.5 text-xs font-medium ${reviewTone[t.review?.status ?? "Nueva"]}`}>
                        {t.review?.status ?? "Nueva"}
                      </span>
                    </td>
                    <td className="px-2 py-3">
                      <button
                        type="button"
                        aria-label={open === t.id ? "Ocultar detalle" : "Ver detalle y valorar"}
                        aria-expanded={open === t.id}
                        onClick={() => setOpen(open === t.id ? null : t.id)}
                        className="flex h-8 w-8 items-center justify-center rounded text-slate-500 hover:bg-slate-100"
                      >
                        <ChevronDown className={`h-4 w-4 transition-transform ${open === t.id ? "rotate-180" : ""}`} />
                      </button>
                    </td>
                  </tr>
                  {open === t.id && (
                    <tr className="border-t border-slate-100 bg-slate-50/60">
                      <td colSpan={7} className="px-4 py-4">
                        <TenderDetail tender={t} onSaved={(r) => updateReview(t.id, r)} />
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))
            )}
          </tbody>
        </table>
      </div>

      {data && data.total > data.pageSize && (
        <div className="flex items-center justify-end gap-2 text-sm text-slate-600">
          <button type="button" className={ghost} disabled={page <= 1 || loading} onClick={() => setPage(page - 1)}>
            <ChevronLeft className="h-4 w-4" /> Anterior
          </button>
          <span>
            Página {page} de {totalPages}
          </span>
          <button type="button" className={ghost} disabled={page >= totalPages || loading} onClick={() => setPage(page + 1)}>
            Siguiente <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      )}
    </div>
  );
}

function TenderDetail({
  tender,
  onSaved,
}: {
  tender: TenderRow;
  onSaved: (review: TenderRow["review"]) => void;
}) {
  const [status, setStatus] = useState<ReviewStatus>(tender.review?.status ?? "Nueva");
  const [notes, setNotes] = useState(tender.review?.notes ?? "");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const save = async () => {
    setSaving(true);
    setMessage(null);
    try {
      const r = await api<{ status: ReviewStatus; notes: string | null; updatedAt: string }>("review", {
        tenderId: tender.id,
        status,
        notes,
      });
      onSaved(r);
      setMessage("Guardado");
    } catch (e) {
      setMessage(errorText(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="grid gap-6 md:grid-cols-2">
      <dl className="grid grid-cols-[140px_1fr] gap-x-4 gap-y-2 text-sm">
        <dt className="text-slate-500">Procedimiento</dt>
        <dd className="text-slate-900">{tender.procedure ?? "—"}</dd>
        <dt className="text-slate-500">Importe sin IVA</dt>
        <dd className="text-slate-900">{tender.amount !== null ? money.format(tender.amount) : "—"}</dd>
        <dt className="text-slate-500">Importe con IVA</dt>
        <dd className="text-slate-900">{tender.amountWithTax !== null ? money.format(tender.amountWithTax) : "—"}</dd>
        <dt className="text-slate-500">Lugar</dt>
        <dd className="text-slate-900">{[tender.city, tender.province].filter(Boolean).join(", ") || "—"}</dd>
        <dt className="text-slate-500">Códigos CPV</dt>
        <dd className="text-slate-900">{tender.cpvCodes.length ? tender.cpvCodes.join(", ") : "—"}</dd>
        <dt className="text-slate-500">Fin de plazo</dt>
        <dd className="text-slate-900">{tender.deadline ? dateFmt.format(new Date(tender.deadline)) : "—"}</dd>
        {tender.url && (
          <>
            <dt className="text-slate-500">Pliegos</dt>
            <dd>
              <a
                href={tender.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 font-medium text-blue-600 hover:text-blue-700"
              >
                Abrir en la Plataforma de Contratación <ExternalLink className="h-3.5 w-3.5" />
              </a>
            </dd>
          </>
        )}
      </dl>
      <div className="space-y-3">
        <label className="block text-sm">
          <span className="mb-1 block font-medium text-slate-700">Valoración</span>
          <select className={`${field} w-full`} value={status} onChange={(e) => setStatus(e.target.value as ReviewStatus)}>
            {REVIEW_STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm">
          <span className="mb-1 block font-medium text-slate-700">Notas</span>
          <textarea
            className={`${field} min-h-[96px] w-full`}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Encaje, solvencia que piden, esfuerzo estimado, precio que ofrecerías…"
            maxLength={4000}
          />
        </label>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={save}
            disabled={saving}
            className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            Guardar valoración
          </button>
          {message && (
            <span role="status" className="text-sm text-slate-600">
              {message}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
