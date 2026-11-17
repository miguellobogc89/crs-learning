"use client";
// Movimientos: por ciclo o buscando en todo, con su significado (gasto, interna, ahorro…) y su categoría.
// Al corregir uno, se puede aplicar a los parecidos: la app crea una regla y aprende.
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeftRight, ChevronLeft, ChevronRight, Loader2, Search, Sparkles, Star } from "lucide-react";
import type { listTransactions } from "@/lib/finance/service";
import { CATEGORIES, KINDS, KIND_LABEL, categoryOf, type Kind } from "@/lib/finance/categories";
import { eur, field, ghost, panel, primary, th } from "@/components/trading/format";
import { ErrorNote, Modal, Pill } from "@/components/trading/ui";
import { SkeletonList } from "@/components/trading/skeletons";
import { errorText, fapi, longDay, refreshFinance, shortDay, useFinance } from "./api";

type List = Awaited<ReturnType<typeof listTransactions>>;
type Item = List["items"][number];

const SOURCE_LABEL: Record<string, string> = {
  usuario: "Corregido por ti",
  regla: "Por una regla tuya",
  interna: "Detectado entre tus cuentas",
  palabra: "Por el comercio",
  ia: "Clasificado por la IA",
  auto: "Sin entender: revísalo",
  pendiente: "Pendiente",
};

const KIND_COLOR: Record<Kind, string> = { gasto: "slate", ingreso: "emerald", regalo: "violet", devolucion: "teal", interna: "blue", ahorro: "amber" };

function CategoryPill({ t }: { t: Pick<Item, "category" | "kind"> }) {
  const c = categoryOf(t.category);
  return <Pill color={t.kind === "gasto" ? c.color : KIND_COLOR[t.kind]}>{t.kind === "gasto" || t.kind === "devolucion" ? c.label : KIND_LABEL[t.kind]}</Pill>;
}

function Amount({ t }: { t: Item }) {
  const muted = t.kind === "interna";
  return <span className={`whitespace-nowrap font-semibold tabular-nums ${muted ? "text-slate-400" : t.amount > 0 ? "text-emerald-700" : "text-slate-900"}`}>{t.amount > 0 ? "+" : ""}{eur(t.amount, 2)}</span>;
}

function EditModal({ item, onClose }: { item: Item | null; onClose: () => void }) {
  const [category, setCategory] = useState("otros_gastos");
  const [kind, setKind] = useState<Kind>("gasto");
  const [extra, setExtra] = useState(false);
  const [note, setNote] = useState("");
  const [similar, setSimilar] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  useEffect(() => {
    if (!item) return;
    setCategory(item.category);
    setKind(item.kind);
    setExtra(item.extraordinary);
    setNote(item.note ?? "");
    setSimilar(true);
    setErr(null);
    setDone(null);
  }, [item]);
  if (!item) return null;
  const options = CATEGORIES.filter((c) => c.key !== "sin_clasificar" && (kind === "gasto" || kind === "devolucion" ? c.kind === "gasto" : kind === "ingreso" ? c.kind === "ingreso" : c.kind === kind));
  const save = async () => {
    setBusy(true);
    setErr(null);
    try {
      const cat = options.some((o) => o.key === category) ? category : options[0]?.key ?? "otros_gastos";
      const r = await fapi<{ similar: number }>("transaction", { id: item.id, category: cat, kind, extraordinary: extra, note, applyToSimilar: similar });
      refreshFinance();
      if (r.similar) setDone(`Guardado. También se han actualizado ${r.similar} movimientos parecidos y la regla queda aprendida.`);
      else onClose();
    } catch (e) {
      setErr(errorText(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal
      open={!!item}
      onClose={onClose}
      title={item.counterparty || item.description}
      subtitle={`${longDay(item.date)} · ${item.account}${item.bank ? ` (${item.bank})` : ""} · ${SOURCE_LABEL[item.source] ?? item.source}`}
      footer={done ? <button type="button" onClick={onClose} className={primary}>Hecho</button> : (
        <>
          <button type="button" onClick={onClose} className={ghost}>Cancelar</button>
          <button type="button" onClick={() => void save()} disabled={busy} className={primary}>{busy && <Loader2 className="h-4 w-4 animate-spin" />} Guardar</button>
        </>
      )}
    >
      {done ? <p className="text-sm text-emerald-800">{done}</p> : (
        <div className="space-y-4 text-sm">
          <div className="flex items-baseline justify-between gap-3 rounded-xl bg-slate-50 px-3 py-2.5">
            <span className="min-w-0 truncate text-slate-600" title={item.description}>{item.description}</span>
            <Amount t={item} />
          </div>
          <div>
            <p className="mb-1.5 font-medium text-slate-800">¿Qué es este movimiento?</p>
            <div className="flex flex-wrap gap-1.5">
              {KINDS.map((k) => (
                <button key={k} type="button" onClick={() => setKind(k)} className={`rounded-full border px-3 py-1.5 text-xs font-medium ${kind === k ? "border-blue-600 bg-blue-600 text-white" : "border-slate-200 text-slate-700 hover:bg-slate-50"}`}>{KIND_LABEL[k]}</button>
              ))}
            </div>
            <p className="mt-1.5 text-xs text-slate-500">
              {kind === "interna" ? "No cuenta como gasto ni ingreso: es dinero que pasa entre tus cuentas." : kind === "ahorro" ? "Cuenta como ahorro, no como gasto." : kind === "devolucion" ? "Resta del gasto de la categoría que elijas." : kind === "regalo" ? "Se muestra aparte y no se proyecta como ingreso." : null}
            </p>
          </div>
          {options.length > 1 && (
            <label className="block">
              <span className="mb-1.5 block font-medium text-slate-800">Categoría</span>
              <select value={options.some((o) => o.key === category) ? category : options[0].key} onChange={(e) => setCategory(e.target.value)} className={`${field} w-full`}>
                {options.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
              </select>
            </label>
          )}
          {(kind === "gasto" || kind === "devolucion") && (
            <label className="flex items-start gap-2.5">
              <input type="checkbox" checked={extra} onChange={(e) => setExtra(e.target.checked)} className="mt-0.5 h-4 w-4 rounded border-slate-300" />
              <span><span className="font-medium text-slate-800">Gasto extraordinario</span><span className="block text-xs text-slate-500">Puntual: no se tiene en cuenta para proyectar ni como hábito.</span></span>
            </label>
          )}
          <label className="block">
            <span className="mb-1.5 block font-medium text-slate-800">Nota (opcional)</span>
            <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="P. ej. «mi parte de la cena de Ana»" className={`${field} w-full`} />
          </label>
          <label className="flex items-start gap-2.5">
            <input type="checkbox" checked={similar} onChange={(e) => setSimilar(e.target.checked)} className="mt-0.5 h-4 w-4 rounded border-slate-300" />
            <span><span className="font-medium text-slate-800">Aplicar a los movimientos parecidos</span><span className="block text-xs text-slate-500">Crea una regla con este comercio para ahora y para los que lleguen.</span></span>
          </label>
          {err && <ErrorNote>{err}</ErrorNote>}
        </div>
      )}
    </Modal>
  );
}

export function MovementsPanel() {
  const params = useSearchParams();
  const [cycle, setCycle] = useState(0);
  const [q, setQ] = useState("");
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState(params.get("categoria") ?? "");
  const [kind, setKind] = useState("");
  const [review, setReview] = useState(params.get("revisar") === "1");
  const [editing, setEditing] = useState<Item | null>(null);
  const [reclassifying, setReclassifying] = useState(false);
  const path = useMemo(() => {
    const p = new URLSearchParams();
    if (search) p.set("q", search);
    else p.set("cycle", String(cycle));
    if (category) p.set("category", category);
    if (kind) p.set("kind", kind);
    if (review) p.set("review", "1");
    return `transactions?${p}`;
  }, [cycle, search, category, kind, review]);
  const { data, error, loading } = useFinance<List>(path);
  useEffect(() => {
    const t = window.setTimeout(() => setSearch(q.trim()), 350);
    return () => window.clearTimeout(t);
  }, [q]);

  const reclassify = async () => {
    setReclassifying(true);
    try {
      await fapi("reclassify", {});
      refreshFinance();
    } finally {
      setReclassifying(false);
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      {/* Filtros en una fila */}
      <div className="flex flex-wrap items-center gap-2">
        {!search && (
          <div className="flex items-center rounded-xl border border-slate-200 bg-white">
            <button type="button" onClick={() => setCycle((c) => Math.max(-36, c - 1))} aria-label="Ciclo anterior" className="rounded-l-xl p-2 text-slate-600 hover:bg-slate-50"><ChevronLeft className="h-4 w-4" /></button>
            <span className="min-w-[8.5rem] px-1 text-center text-sm font-medium text-slate-800">{data?.cycle?.label ?? "…"}</span>
            <button type="button" onClick={() => setCycle((c) => Math.min(0, c + 1))} disabled={cycle === 0} aria-label="Ciclo siguiente" className="rounded-r-xl p-2 text-slate-600 hover:bg-slate-50 disabled:opacity-30"><ChevronRight className="h-4 w-4" /></button>
          </div>
        )}
        <label className="relative min-w-[10rem] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar en todos los movimientos" className={`${field} w-full pl-9`} />
        </label>
        <select value={kind} onChange={(e) => setKind(e.target.value)} className={field} aria-label="Tipo">
          <option value="">Todos los tipos</option>
          {KINDS.map((k) => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}
        </select>
        <select value={category} onChange={(e) => setCategory(e.target.value)} className={`${field} max-w-[11rem]`} aria-label="Categoría">
          <option value="">Todas las categorías</option>
          {CATEGORIES.filter((c) => c.key !== "sin_clasificar").map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
        </select>
        <button type="button" onClick={() => setReview((r) => !r)} className={`inline-flex items-center gap-1.5 rounded-xl border px-3 py-2 text-sm font-medium ${review ? "border-amber-300 bg-amber-50 text-amber-800" : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"}`}>
          <Sparkles className="h-4 w-4" /> Por revisar
        </button>
      </div>

      {data && (
        <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-sm text-slate-600">
          <span>{data.count} movimientos</span>
          <span>Ingresos <b className="tabular-nums text-emerald-700">{eur(data.totals.income, 2)}</b></span>
          <span>Gastos <b className="tabular-nums text-slate-900">{eur(data.totals.expenses, 2)}</b></span>
          {data.totals.saved ? <span>A inversión <b className="tabular-nums text-slate-900">{eur(data.totals.saved, 2)}</b></span> : null}
          {data.totals.internal ? <span className="text-slate-400">Entre cuentas {eur(data.totals.internal, 2)}</span> : null}
          {review && data.count > 0 && (
            <button type="button" onClick={() => void reclassify()} disabled={reclassifying} className="ml-auto inline-flex items-center gap-1.5 text-sm font-medium text-blue-700 hover:underline disabled:opacity-50">
              {reclassifying ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />} Volver a intentarlo con la IA
            </button>
          )}
        </div>
      )}
      {error && <ErrorNote>{error}</ErrorNote>}

      <div className={`${panel} min-h-0 flex-1 max-md:-mx-3 max-md:rounded-none max-md:border-x-0 max-md:shadow-none`}>
        {!data ? <SkeletonList rows={10} /> : data.items.length === 0 ? (
          <p className="p-10 text-center text-sm text-slate-500">{search ? "Nada coincide con la búsqueda." : review ? "No hay nada por revisar. 👌" : "No hay movimientos en este ciclo."}</p>
        ) : (
          <div className={`h-full overflow-auto ${loading ? "opacity-70" : ""}`}>
            {/* Ordenador: tabla */}
            <table className="hidden w-full text-sm md:table">
              <thead className="sticky top-0 z-10 bg-white shadow-[0_1px_0_#f1f5f9]">
                <tr>
                  <th className={th}>Fecha</th>
                  <th className={th}>Concepto</th>
                  <th className={th}>Categoría</th>
                  <th className={th}>Cuenta</th>
                  <th className={`${th} text-right`}>Importe</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.items.map((t) => (
                  <tr key={t.id} onClick={() => setEditing(t)} className="cursor-pointer hover:bg-slate-50">
                    <td className="whitespace-nowrap px-3 py-2.5 text-slate-500">{shortDay(t.date)}</td>
                    <td className="max-w-[28rem] px-3 py-2.5">
                      <span className="flex items-center gap-1.5">
                        {t.kind === "interna" && <ArrowLeftRight className="h-3.5 w-3.5 shrink-0 text-slate-400" />}
                        {t.extraordinary && <Star className="h-3.5 w-3.5 shrink-0 text-amber-500" aria-label="Extraordinario" />}
                        <span className="truncate font-medium text-slate-900" title={t.description}>{t.counterparty || t.description}</span>
                      </span>
                      {t.note ? <span className="block truncate text-xs text-slate-500">{t.note}</span> : t.counterparty ? <span className="block truncate text-xs text-slate-400">{t.description}</span> : null}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5">
                      <CategoryPill t={t} />
                      {(t.source === "auto" || t.source === "pendiente") && <span className="ml-1.5 text-xs text-amber-700">revisar</span>}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5 text-slate-500">{t.account}</td>
                    <td className="whitespace-nowrap px-3 py-2.5 text-right"><Amount t={t} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
            {/* Móvil: filas */}
            <ul className="divide-y divide-slate-100 md:hidden">
              {data.items.map((t) => (
                <li key={t.id}>
                  <button type="button" onClick={() => setEditing(t)} className="flex w-full items-center gap-3 px-4 py-3 text-left active:bg-slate-50">
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-1.5">
                        {t.kind === "interna" && <ArrowLeftRight className="h-3.5 w-3.5 shrink-0 text-slate-400" />}
                        {t.extraordinary && <Star className="h-3.5 w-3.5 shrink-0 text-amber-500" />}
                        <span className="truncate text-[15px] font-medium text-slate-900">{t.counterparty || t.description}</span>
                      </span>
                      <span className="mt-1 flex items-center gap-2 text-xs text-slate-500">
                        <span>{shortDay(t.date)}</span>
                        <CategoryPill t={t} />
                        {(t.source === "auto" || t.source === "pendiente") && <span className="text-amber-700">revisar</span>}
                      </span>
                    </span>
                    <Amount t={t} />
                  </button>
                </li>
              ))}
            </ul>
            {data.count > data.items.length && <p className="p-4 text-center text-xs text-slate-400">Se muestran {data.items.length} de {data.count}. Usa los filtros para afinar.</p>}
          </div>
        )}
      </div>
      <EditModal item={editing} onClose={() => setEditing(null)} />
    </div>
  );
}
