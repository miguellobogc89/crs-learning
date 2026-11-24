"use client";
// Laboratorio · Datos de prueba (24/11/2026). Perfiles ficticios con seis meses de movimientos realistas. «Generar»
// rehace el usuario de prueba desde cero y pasa la clasificación de verdad (reglas, palabras clave e IA), por tandas,
// como al conectar un banco. Debajo, cómo ha quedado cada comercio, para ver si la ingesta acierta. Tus datos no se
// tocan: todo va al usuario ficticio del perfil.
import { useCallback, useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { categoryLabel } from "@/lib/finance/categories";
import { eur } from "@/components/trading/format";
import { ErrorNote } from "@/components/trading/ui";
import { fapi } from "./api";
import { SOURCE_LABEL, type List } from "./movement-edit";

type Status = { key: string; label: string; detail: string; exists: boolean; total: number; bySource: Record<string, number> }[];
type Stats = { reglas: number; internas: number; palabras: number; ia: number; auto: number; remaining: number };

/** Llamada como el usuario ficticio de un perfil (sin tocar la caché de la app). */
async function asLab<T>(profile: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`/api/finance/${path}`, {
    method: body === undefined ? "GET" : "POST", cache: "no-store",
    headers: { "x-crs-lab": profile, ...(body === undefined ? {} : { "Content-Type": "application/json" }) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error || "No se pudo completar la operación");
  return data as T;
}

const SOURCE_ORDER = ["pendiente", "auto", "ia", "palabra", "regla", "interna", "usuario"];
const SHORT: Record<string, string> = { pendiente: "Sin procesar", auto: "Sin entender", ia: "IA", palabra: "Palabra clave", regla: "Regla", interna: "Entre cuentas", usuario: "A mano" };

/** Comercio de un concepto: sin números de TPV ni referencias, para agrupar. */
const merchantOf = (d: string) => d.replace(/\b[A-Z0-9]*\d{3,}[A-Z0-9]*\b/g, "").replace(/\s+/g, " ").trim().slice(0, 48);

export function LabDatasets() {
  const [status, setStatus] = useState<Status | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<{ key: string; text: string } | null>(null);
  const [view, setView] = useState<string | null>(null);
  const [rows, setRows] = useState<List["items"] | null>(null);

  const load = useCallback(() => { fapi<Status>("lab/status").then(setStatus).catch((e) => setError(e instanceof Error ? e.message : String(e))); }, []);
  useEffect(load, [load]);
  useEffect(() => {
    if (!view) { setRows(null); return; }
    setRows(null);
    asLab<List>(view, "transactions?all=1").then((l) => setRows(l.items)).catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, [view, status]);

  const generate = async (key: string) => {
    setError(null);
    try {
      setBusy({ key, text: "Generando movimientos…" });
      const r = await fapi<{ movements: number }>("lab/reset", { profile: key });
      // Clasificación de verdad, por tandas, hasta que no quede nada o deje de avanzar.
      let last = Infinity;
      for (let i = 0; i < 20; i++) {
        setBusy({ key, text: `Clasificando ${r.movements} movimientos… (tanda ${i + 1})` });
        const s = await asLab<Stats>(key, "classify", {});
        if (s.remaining <= 0 || s.remaining >= last) break;
        last = s.remaining;
      }
      setView(key);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
      load();
    }
  };

  // Por comercio: cuántas veces, cuánto, cómo se ha clasificado (categoría y por qué vía).
  const merchants = (() => {
    if (!rows) return [];
    const by = new Map<string, { name: string; n: number; amount: number; cats: Map<string, number>; source: string }>();
    for (const t of rows) {
      const k = merchantOf(t.description);
      const x = by.get(k) ?? { name: k, n: 0, amount: 0, cats: new Map(), source: t.source };
      x.n++; x.amount += t.amount;
      const c = t.kind === "gasto" || t.kind === "devolucion" ? categoryLabel(t.category) : t.kind;
      x.cats.set(c, (x.cats.get(c) ?? 0) + 1);
      by.set(k, x);
    }
    return [...by.values()].sort((a, b) => SOURCE_ORDER.indexOf(a.source) - SOURCE_ORDER.indexOf(b.source) || b.n - a.n);
  })();

  return (
    <div className="pb-4">
      {error && <ErrorNote>{error}</ErrorNote>}
      <ul className="divide-y divide-slate-100">
        {(status ?? []).map((p) => (
          <li key={p.key} className="py-3">
            <div className="flex items-start gap-3">
              <span className="min-w-0 flex-1">
                <span className="block text-[15px] font-semibold text-slate-900">{p.label}</span>
                <span className="block text-xs text-slate-500">{p.detail}</span>
                {p.exists && (
                  <span className="mt-1 block text-xs text-slate-600">
                    {p.total} movimientos · {SOURCE_ORDER.filter((s) => p.bySource[s]).map((s) => `${SHORT[s]} ${p.bySource[s]}`).join(" · ")}
                  </span>
                )}
              </span>
              <button type="button" disabled={!!busy} onClick={() => void generate(p.key)}
                className="h-9 shrink-0 rounded-full bg-blue-600 px-4 text-sm font-semibold text-white disabled:opacity-50">
                {p.exists ? "Rehacer" : "Generar"}
              </button>
            </div>
            {busy?.key === p.key && <p className="mt-2 flex items-center gap-2 text-sm text-blue-700"><Loader2 className="h-4 w-4 animate-spin" />{busy.text}</p>}
            {p.exists && !busy && (
              <button type="button" onClick={() => setView(view === p.key ? null : p.key)} className="mt-1 text-sm font-medium text-blue-700">
                {view === p.key ? "Ocultar cómo ha quedado" : "Ver cómo ha quedado"}
              </button>
            )}
            {view === p.key && (
              rows === null ? <p className="py-3 text-sm text-slate-500">Cargando…</p> : (
                <ul className="mt-2 divide-y divide-slate-100 rounded-xl bg-slate-50 px-3">
                  {merchants.map((m) => (
                    <li key={m.name} className="flex items-start gap-3 py-2">
                      <span className="min-w-0 flex-1">
                        <span className="block break-words text-[13px] text-slate-800">{m.name}</span>
                        <span className={`block text-xs ${m.source === "auto" || m.source === "pendiente" ? "font-semibold text-amber-700" : "text-slate-500"}`}>
                          {[...m.cats.entries()].map(([c, n]) => (m.cats.size > 1 ? `${c} (${n})` : c)).join(", ")} · {SOURCE_LABEL[m.source] ?? SHORT[m.source] ?? m.source}
                        </span>
                      </span>
                      <span className="amount shrink-0 text-right text-xs tabular-nums text-slate-500">{m.n}× · {eur(m.amount, 0)}</span>
                    </li>
                  ))}
                </ul>
              )
            )}
          </li>
        ))}
      </ul>
      {!status && !error && <p className="py-6 text-sm text-slate-500">Cargando perfiles…</p>}
    </div>
  );
}
