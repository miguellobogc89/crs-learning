"use client";
// Panel lateral de un agente: lo esencial de un vistazo (cómo va, qué tiene abierto, qué está haciendo y
// cómo opera) sin salir de la lista. Desde aquí se copia o se abre su ficha completa.
import Link from "next/link";
import { ArrowRight, Wallet } from "lucide-react";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { eur, eur0, pct, primary, tone } from "./format";
import { AgentAvatar, ReturnPill } from "./ui";
import { AssetIcon } from "./asset-icon";
import { EquityCurve, withLivePoint } from "./equity-chart";
import { SpecPills, SpecSheet } from "./agent-spec";
import { ChipMode, CopyBadges, type Agent } from "./agents-panel";

const price = (v: number | null | undefined) => (v === null || v === undefined ? "—" : eur(v, v < 1 ? 6 : 2));

export function AgentSheet({
  a,
  from = "agentes",
  canCopy,
  onMirror,
  onClose,
}: {
  a: Agent | null;
  /** De dónde se abre (para el «volver» de la ficha completa). */
  from?: "agentes" | "inicio";
  canCopy: boolean;
  onMirror: (a: Agent) => void;
  onClose: () => void;
}) {
  const open = a?.positions.filter((p) => p.status === "abierta" || p.status === "pendiente") ?? [];
  const s = a?.summary;
  return (
    <Sheet open={!!a} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right" className="w-full gap-0 overflow-y-auto p-0 data-[side=right]:w-full data-[side=right]:sm:max-w-md">
        {a && s && (
          <>
            <div className="border-b border-slate-100 px-5 pb-4 pt-5 pr-12">
              <div className="flex items-center gap-3">
                <AgentAvatar color={a.color} size="lg" />
                <div className="min-w-0">
                  <SheetTitle className="flex flex-wrap items-center gap-2 text-lg font-semibold text-slate-950">
                    {a.name}
                    <SpecPills spec={a.spec} />
                  </SheetTitle>
                  <SheetDescription className="mt-0.5 line-clamp-2 text-xs text-slate-500">{a.tagline}</SheetDescription>
                </div>
              </div>
              <div className="mt-4 flex flex-wrap items-end gap-2">
                <span className="text-3xl font-bold tabular-nums tracking-tight text-slate-950">{eur0(s.equity)}</span>
                <ReturnPill value={s.returnPct} big />
                <ChipMode a={a} />
                <span className="pb-1 text-xs text-slate-500">desde {eur0(s.initialCapital)}</span>
              </div>
              <div className="mt-3">
                <EquityCurve
                  points={withLivePoint(a.equity, s.equity)}
                  initial={s.initialCapital}
                  height={120}
                  empty="Su gráfica se dibuja con el cierre de cada día desde que empezó."
                />
              </div>
              <dl className="mt-3 grid grid-cols-3 gap-2 text-center">
                {[
                  ["Abiertas", String(open.length)],
                  ["Cerradas", String(s.stats.closed)],
                  ["Acierto", s.stats.closed ? `${Math.round(s.stats.winRate * 100)} %` : "—"],
                ].map(([label, value]) => (
                  <div key={label} className="rounded-xl bg-slate-50 px-2 py-2">
                    <dt className="text-[11px] text-slate-500">{label}</dt>
                    <dd className="text-base font-semibold tabular-nums text-slate-900">{value}</dd>
                  </div>
                ))}
              </dl>
              {a.kamikaze?.note && <p className="mt-3 rounded-xl bg-slate-50 px-3 py-2 text-xs text-slate-600">{a.kamikaze.note}</p>}
              {a.mirror && (
                <div className="mt-3">
                  <CopyBadges a={a} />
                </div>
              )}
            </div>

            <section className="border-b border-slate-100 px-5 py-4">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-400">Abiertas ahora</h3>
              {open.length === 0 ? (
                <p className="mt-2 text-sm text-slate-500">No tiene nada abierto.</p>
              ) : (
                <ul className="mt-2 divide-y divide-slate-100">
                  {open.map((p) => {
                    const entry = p.entryPrice ?? p.plannedEntry;
                    const res = p.unrealized;
                    const resPct = res !== null && entry ? (res / (entry * p.quantity)) * 100 : null;
                    return (
                      <li key={p.id} className="flex items-center gap-3 py-2.5">
                        <AssetIcon symbol={p.symbol} name={p.name} size="md" />
                        <span className="min-w-0 flex-1">
                          <b className="block truncate text-sm font-semibold text-slate-900">{p.name}</b>
                          <span className="block text-xs tabular-nums text-slate-500">
                            {p.status === "pendiente" ? "Orden puesta" : `${price(entry)} → ${price(p.lastPrice)}`}
                          </span>
                        </span>
                        <span className="text-right text-sm">
                          {res === null ? (
                            <span className="text-slate-400">—</span>
                          ) : (
                            <>
                              <b className={`block font-semibold tabular-nums ${tone(res)}`}>{eur(res, 2)}</b>
                              {resPct !== null && <span className={`text-xs tabular-nums ${tone(resPct)}`}>{pct(resPct, 1)}</span>}
                            </>
                          )}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>

            <section className="border-b border-slate-100">
              <h3 className="px-5 pt-4 text-xs font-semibold uppercase tracking-wide text-slate-400">Cómo opera</h3>
              <SpecSheet spec={a.spec} />
            </section>

            <div className="sticky bottom-0 flex gap-2 bg-white px-5 py-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
              {canCopy && (
                <button type="button" className={`${primary} flex-1 justify-center`} onClick={() => onMirror(a)}>
                  <Wallet className="h-4 w-4" /> Copiar con dinero real
                </button>
              )}
              <Link
                href={`/trading/agentes/${a.key}${from === "inicio" ? "?from=inicio" : ""}`}
                className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-800 hover:bg-slate-50"
              >
                Ver ficha completa <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
