"use client";
// Una «idea de operación» con dos ventanas: «Más info» (para entender de qué va, sin jerga)
// y «Ejecutar orden» (confirmación clara antes de tocar la cartera).
import { useMemo, useState } from "react";
import Link from "next/link";
import { BarChart3, CheckCircle2, ChevronDown, ExternalLink, FileText, Info, LineChart, Loader2, ShieldAlert, ThumbsUp, Wallet } from "lucide-react";
import type { Evidence } from "@/lib/trading/committee/service";
import type { Recommendation } from "@/lib/trading/recommend";
import { api, errorText, eur, eur0, field, ghost, int, num, primary } from "./format";
import { refreshTrading } from "./navigation";
import { Tone } from "./news-panel";
import { Modal, Rich } from "./ui";
import { AssetIcon } from "./asset-icon";

export type TradeIdea = {
  key: string;
  source: "comite" | "figura" | "agente";
  symbol: string;
  name: string;
  market: "bolsa" | "crypto";
  action: "comprar" | "vender" | "mantener" | "vigilar" | "vender_corto" | "evitar" | "cerrar";
  direction: "long" | "short";
  price: number;
  stop: number | null;
  target: number | null;
  quantity: number | null;
  /** Texto principal del porqué (admite **negritas**). */
  rationale: string;
  pros: string[];
  cons: string[];
  evidence: Evidence[];
  /** Qué ha detectado: «Doble suelo», «Comité de inversión»… */
  origin: string;
  conviction?: number;
  score?: number;
  horizonDays?: number | null;
  proposalId?: string;
  signalKey?: string;
  pattern?: string | null;
};

export const unitOf = (idea: Pick<TradeIdea, "market" | "symbol">) => (idea.market === "crypto" ? idea.symbol.replace(/-EUR$/, "") : "acciones");
const qtyText = (idea: Pick<TradeIdea, "market" | "symbol" | "name">, q: number) =>
  idea.market === "crypto" ? `${int(q)} ${unitOf(idea)}` : `${int(q)} acciones de ${idea.name}`;

export function ideaFromRecommendation(r: Recommendation): TradeIdea {
  return {
    key: r.key,
    source: "figura",
    symbol: r.symbol,
    name: r.name,
    market: /-EUR$/.test(r.symbol) ? "crypto" : "bolsa",
    action: r.action,
    direction: r.direction,
    price: r.lastClose,
    stop: r.stop,
    target: r.target,
    quantity: r.sizing?.quantity ?? null,
    rationale: r.plan,
    pros: r.pros,
    cons: r.cons,
    evidence: [],
    origin: r.patternName,
    score: r.score,
    horizonDays: r.maxHoldDays,
    signalKey: r.key,
    pattern: r.pattern,
  };
}

const EVIDENCE_ICON = { noticia: FileText, figura: LineChart, tecnico: BarChart3, posicion: Wallet } as const;

export function EvidenceList({ items }: { items: Evidence[] }) {
  if (!items.length) return null;
  return (
    <ul className="space-y-1.5">
      {items.map((e) => {
        const Icon = EVIDENCE_ICON[e.kind] ?? FileText;
        return (
          <li key={e.id} className="flex gap-2 text-xs leading-snug text-slate-600">
            {e.kind === "noticia" && e.sentiment !== undefined ? (
              <Tone sentiment={e.sentiment} className="mt-px h-3.5 w-3.5 shrink-0" />
            ) : (
              <Icon className="mt-px h-3.5 w-3.5 shrink-0 text-slate-400" />
            )}
            {e.url ? (
              <a href={e.url} target="_blank" rel="noopener noreferrer" className="hover:text-blue-700">
                {e.label} <ExternalLink className="inline h-3 w-3 text-slate-300" />
              </a>
            ) : (
              <span>{e.label}</span>
            )}
          </li>
        );
      })}
    </ul>
  );
}

function Numbers({ idea, quantity }: { idea: TradeIdea; quantity: number | null }) {
  const q = quantity ?? 0;
  const loss = idea.stop !== null && q ? Math.abs(idea.price - idea.stop) * q : null;
  const gain = idea.target !== null && q ? Math.abs(idea.target - idea.price) * q : null;
  return (
    <dl className="grid grid-cols-3 gap-px overflow-hidden rounded-2xl border border-slate-100 bg-slate-100 text-center">
      <div className="bg-white px-2 py-3">
        <dt className="text-[11px] text-slate-500">Precio ahora</dt>
        <dd className="text-base font-semibold tabular-nums text-slate-900">{eur(idea.price)}</dd>
        {q > 0 && <dd className="text-[11px] tabular-nums text-slate-500">inviertes ≈ {eur0(q * idea.price)}</dd>}
      </div>
      <div className="bg-white px-2 py-3">
        <dt className="text-[11px] text-red-700">Si sale mal, vende a</dt>
        <dd className="text-base font-semibold tabular-nums text-red-700">{idea.stop !== null ? eur(idea.stop) : "—"}</dd>
        {loss !== null && <dd className="text-[11px] tabular-nums text-red-700">pierdes ≈ {eur0(loss)}</dd>}
      </div>
      <div className="bg-white px-2 py-3">
        <dt className="text-[11px] text-emerald-700">Si sale bien, vende a</dt>
        <dd className="text-base font-semibold tabular-nums text-emerald-700">{idea.target !== null ? eur(idea.target) : "—"}</dd>
        {gain !== null && <dd className="text-[11px] tabular-nums text-emerald-700">ganas ≈ {eur0(gain)}</dd>}
      </div>
    </dl>
  );
}

function headline(idea: TradeIdea) {
  const q = idea.quantity;
  if (idea.action === "comprar" && q) return `La app propone **comprar ${qtyText(idea, q)}** por unos **${eur0(q * idea.price)}**.`;
  if (idea.action === "vender_corto" && q) return `La app propone **vender en corto ${qtyText(idea, q)}**: ganas si el precio baja.`;
  if (idea.action === "vender" || idea.action === "cerrar") return `La app propone **vender tu posición en ${idea.name}**.`;
  if (idea.action === "mantener") return `La app propone **mantener ${idea.name}** en tu cartera.`;
  if (idea.action === "evitar") return `La app ve **señales de bajada en ${idea.name}**: mejor no comprar ahora.`;
  return `La app propone **vigilar ${idea.name}**: todavía no es momento de entrar.`;
}

/** «Más info»: de qué va la operación, explicado para quien nunca ha invertido. */
export function TradeInfoModal({ idea, onClose, onExecute }: { idea: TradeIdea; onClose: () => void; onExecute?: () => void }) {
  const [glossary, setGlossary] = useState(false);
  const executable = !!onExecute && (idea.action === "comprar" || idea.action === "vender_corto" || idea.action === "vender") && (idea.action === "vender" || !!idea.quantity);
  return (
    <Modal
      open
      onClose={onClose}
      width="max-w-2xl"
      title={
        <span className="flex items-center gap-2.5">
          <AssetIcon symbol={idea.symbol} name={idea.name} size="md" />
          <span>
            {idea.name} <span className="text-sm font-normal text-slate-500">{idea.symbol}</span>
          </span>
        </span>
      }
      subtitle={`${idea.origin}${idea.market === "crypto" ? " · Crypto" : " · Bolsa"}${idea.conviction ? ` · convicción ${idea.conviction}/5` : ""}${idea.score !== undefined ? ` · nota ${idea.score}/100` : ""}`}
      footer={
        <>
          <button type="button" className={ghost} onClick={onClose}>
            Cerrar
          </button>
          {executable && (
            <button type="button" className={primary} onClick={onExecute}>
              Ejecutar orden
            </button>
          )}
        </>
      }
    >
      <div className="space-y-5 text-sm leading-relaxed text-slate-700">
        <p className="text-[15px] text-slate-800">
          <Rich text={headline(idea)} />
        </p>

        {(idea.action === "comprar" || idea.action === "vender_corto") && (
          <section className="space-y-2">
            <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Los números</h4>
            <Numbers idea={idea} quantity={idea.quantity} />
            <p className="text-xs text-slate-500">
              {idea.stop !== null && idea.target !== null ? (
                <Rich
                  text={`Si el precio **baja hasta ${eur(idea.stop)}**, la app vende sola para que la pérdida no pase de ahí. Si **sube hasta ${eur(idea.target)}**, vende y te quedas la ganancia.${idea.horizonDays ? ` Si en unas ${idea.horizonDays} sesiones no ha pasado ninguna de las dos cosas, sale igualmente.` : ""}`}
                />
              ) : null}
            </p>
          </section>
        )}

        <section className="space-y-2">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500">¿Por qué?</h4>
          <p>
            <Rich text={idea.rationale} />
          </p>
          {idea.pros.length > 0 && (
            <ul className="space-y-1">
              {idea.pros.map((p) => (
                <li key={p} className="flex gap-2">
                  <ThumbsUp className="mt-1 h-3.5 w-3.5 shrink-0 text-emerald-600" /> <Rich text={p} />
                </li>
              ))}
            </ul>
          )}
        </section>

        {idea.evidence.length > 0 && (
          <section className="space-y-2">
            <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500">En qué se basa</h4>
            <EvidenceList items={idea.evidence} />
          </section>
        )}

        {idea.cons.length > 0 && (
          <section className="space-y-2">
            <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500">¿Qué puede salir mal?</h4>
            <ul className="space-y-1">
              {idea.cons.map((p) => (
                <li key={p} className="flex gap-2">
                  <ShieldAlert className="mt-1 h-3.5 w-3.5 shrink-0 text-amber-600" /> <Rich text={p} />
                </li>
              ))}
            </ul>
          </section>
        )}

        <section className="rounded-xl border border-slate-100 bg-slate-50/60">
          <button type="button" onClick={() => setGlossary(!glossary)} className="flex w-full items-center justify-between px-3 py-2 text-left text-xs font-medium text-slate-700">
            <span className="inline-flex items-center gap-1.5">
              <Info className="h-3.5 w-3.5" /> ¿Nuevo en esto? Las palabras clave
            </span>
            <ChevronDown className={`h-3.5 w-3.5 transition-transform ${glossary ? "rotate-180" : ""}`} />
          </button>
          {glossary && (
            <dl className="space-y-2 border-t border-slate-100 px-3 py-3 text-xs text-slate-600">
              <div>
                <dt className="font-semibold text-slate-800">Stop</dt>
                <dd>El precio al que la app vende si las cosas van mal. Es tu límite de pérdida: lo decides antes de entrar.</dd>
              </div>
              <div>
                <dt className="font-semibold text-slate-800">Objetivo</dt>
                <dd>El precio al que la app vende para recoger la ganancia.</dd>
              </div>
              <div>
                <dt className="font-semibold text-slate-800">Cartera virtual</dt>
                <dd>Dinero ficticio para practicar. Nada de lo que hagas aquí mueve dinero real.</dd>
              </div>
              <div>
                <dt className="font-semibold text-slate-800">Riesgo por operación</dt>
                <dd>Lo máximo que puedes perder en una operación si salta el stop. La app calcula cuánto comprar para que no pase de tu límite (por defecto, el 1 % de tu cartera).</dd>
              </div>
            </dl>
          )}
        </section>
      </div>
    </Modal>
  );
}

/** «Ejecutar orden»: confirmación clara, con la opción de ajustar antes de confirmar. */
export function ConfirmOrderModal({
  idea,
  cash,
  onClose,
  broker,
}: {
  idea: TradeIdea;
  cash?: number;
  onClose: () => void;
  /** Bróker conectado a la cartera (desde Integraciones) para enviar propuestas del comité. */
  broker?: { available: boolean; autonomy: string; provider?: string | null; environment?: string | null } | null;
}) {
  const crypto = idea.market === "crypto";
  const canBroker = !!broker?.available && broker.autonomy !== "nada" && !!idea.proposalId && idea.market === "bolsa" && idea.action === "comprar";
  const [dest, setDest] = useState<"crs" | "broker">("crs");
  const brokerName = `${broker?.provider ?? "Bróker"}${broker?.environment === "demo" ? " Demo" : broker?.environment === "real" ? " (dinero real)" : ""}`;
  const sell = idea.action === "vender" || idea.action === "cerrar";
  const [adjust, setAdjust] = useState(false);
  const [quantity, setQuantity] = useState(String(idea.quantity ?? ""));
  const [stop, setStop] = useState(idea.stop !== null ? String(Number(idea.stop.toFixed(4))) : "");
  const [target, setTarget] = useState(idea.target !== null ? String(Number(idea.target.toFixed(4))) : "");
  const [execution, setExecution] = useState<"next_open" | "now">("next_open");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const values = useMemo(() => {
    const parse = (v: string) => Number(v.replace(",", "."));
    const raw = parse(quantity);
    const q = crypto ? Math.floor(raw * 1e6) / 1e6 : Math.floor(raw);
    return { q, s: parse(stop), t: parse(target) };
  }, [quantity, stop, target, crypto]);
  const shown: TradeIdea = { ...idea, quantity: values.q || null, stop: values.s || idea.stop, target: values.t || idea.target };
  const notional = values.q * idea.price;

  const confirm = async () => {
    setSaving(true);
    setError(null);
    try {
      if (dest === "broker" && idea.proposalId) {
        const r = await api<{ quantity: number; orderId: string; status: string }>("committee/execute-broker", { proposalId: idea.proposalId, confirmDemo: true });
        setDone(
          `Compra de ${int(r.quantity)} acciones enviada a ${brokerName} (orden ${r.orderId}, ${r.status}). En cuanto el bróker la registre, la app pondrá el stop y vigilará el objetivo.`,
        );
      } else if (idea.proposalId) {
        const r = await api<{ status: string; order: string | null }>("committee/decide", {
          proposalId: idea.proposalId,
          decision: "ejecutar",
          quantity: values.q,
          stop: values.s,
          target: values.t,
          execution,
        });
        setDone(sell ? "Posición cerrada al último precio." : r.order === "abierta" ? "Posición abierta en tu cartera." : "Orden programada para la apertura de la próxima sesión.");
      } else {
        const r = await api<{ status: string }>("order", {
          symbol: idea.symbol,
          direction: idea.direction,
          quantity: values.q,
          stop: values.s,
          target: values.t,
          execution,
          pattern: idea.pattern ?? null,
          signalKey: idea.signalKey ?? null,
          score: idea.score ?? null,
          maxHoldDays: idea.horizonDays ?? null,
          notes: idea.rationale.replace(/\*\*/g, ""),
          source: idea.source === "agente" ? "agente" : undefined,
        });
        setDone(r.status === "pendiente" ? "Orden programada para la apertura de la próxima sesión." : "Posición abierta en tu cartera.");
      }
      refreshTrading();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setSaving(false);
    }
  };

  if (done)
    return (
      <Modal
        open
        onClose={onClose}
        title="Hecho"
        footer={
          <>
            <button type="button" className={ghost} onClick={onClose}>
              Seguir mirando
            </button>
            <Link href={dest === "broker" ? "/trading/integraciones" : "/trading/cartera"} className={primary} onClick={onClose}>
              {dest === "broker" ? "Ver integraciones" : "Ver mi cartera"}
            </Link>
          </>
        }
      >
        <div className="flex gap-3">
          <CheckCircle2 className="h-6 w-6 shrink-0 text-emerald-600" />
          <div className="space-y-1 text-sm text-slate-700">
            <p className="font-medium text-slate-900">{done}</p>
            {!sell && (
              <p>
                A partir de ahora la app vigila la posición cada día: si toca el stop o el objetivo, la cierra sola. Lo verás en
                «Mi cartera».
              </p>
            )}
          </div>
        </div>
      </Modal>
    );

  return (
    <Modal
      open
      onClose={onClose}
      title={sell ? `Vender ${idea.name}` : `Ejecutar orden · ${idea.name}`}
      subtitle="Cartera virtual: no se mueve dinero real"
      footer={
        <>
          <button type="button" className={ghost} onClick={onClose}>
            Cancelar
          </button>
          <button type="button" className={primary} onClick={confirm} disabled={saving || (!sell && !(values.q > 0))}>
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            {sell ? "Confirmar venta" : "Confirmar orden"}
          </button>
        </>
      }
    >
      <div className="space-y-4 text-sm text-slate-700">
        {canBroker && (
          <fieldset className="grid grid-cols-2 gap-2">
            <legend className="mb-1.5 text-xs font-medium text-slate-600">¿Dónde la ejecutas?</legend>
            {(
              [
                ["crs", "Simulador CRS", "Tu cartera virtual de la app."],
                ["broker", brokerName, "Tu cuenta del bróker, con stop y objetivo protegidos."],
              ] as const
            ).map(([key, label, text]) => (
              <button
                key={key}
                type="button"
                onClick={() => setDest(key)}
                className={`rounded-xl border px-3 py-2 text-left ${dest === key ? "border-blue-500 bg-blue-50/60 ring-1 ring-blue-500" : "border-slate-200 hover:bg-slate-50"}`}
              >
                <span className="block text-sm font-semibold text-slate-900">{label}</span>
                <span className="mt-0.5 block text-xs text-slate-500">{text}</span>
              </button>
            ))}
          </fieldset>
        )}
        {dest === "broker" ? (
          <div className="space-y-2">
            <p className="text-[15px] leading-relaxed">
              <Rich text={`Vas a **comprar ${idea.name} en ${brokerName}** a mercado (si la bolsa está cerrada, se ejecuta en la apertura).`} />
            </p>
            <ul className="list-disc space-y-1 pl-5 text-xs text-slate-600">
              <li>
                La <b>cantidad</b> la calcula la app con el saldo de tu cuenta del bróker y tu riesgo por operación (máximo el 20 % del patrimonio).
              </li>
              <li>
                El <b>stop a {idea.stop !== null ? eur(idea.stop) : "—"}</b> queda puesto en el bróker en cuanto se registre la compra.
              </li>
              <li>
                El <b>objetivo a {idea.target !== null ? eur(idea.target) : "—"}</b> lo vigila la app mientras la tengas abierta: al tocarlo, cancela el stop y vende.
              </li>
            </ul>
          </div>
        ) : sell ? (
          <p className="text-[15px]">
            <Rich text={`Vas a **cerrar tu posición en ${idea.name}** al último precio disponible (**${eur(idea.price)}**).`} />
          </p>
        ) : (
          <>
            <p className="text-[15px] leading-relaxed">
              <Rich
                text={`Vas a ${idea.direction === "long" ? "comprar" : "vender en corto"} **${qtyText(idea, values.q || 0)}** por unos **${eur0(notional)}**${
                  execution === "next_open" ? " a la apertura de la próxima sesión" : " al último precio"
                }.`}
              />
            </p>
            <Numbers idea={shown} quantity={values.q} />
            {cash !== undefined && (
              <p className="text-xs text-slate-500">
                Te quedarán unos <b className={cash - notional < 0 ? "text-red-700" : "text-slate-800"}>{eur0(cash - notional)}</b> de efectivo
                virtual.
              </p>
            )}
            <button type="button" onClick={() => setAdjust(!adjust)} className="inline-flex items-center gap-1 text-xs font-medium text-blue-700 hover:underline">
              <ChevronDown className={`h-3.5 w-3.5 transition-transform ${adjust ? "rotate-180" : ""}`} />
              {adjust ? "Ocultar ajustes" : "Ajustar cantidad, stop u objetivo"}
            </button>
            {adjust && (
              <div className="space-y-3 rounded-xl border border-slate-100 bg-slate-50/60 p-3">
                <div className="grid grid-cols-3 gap-3">
                  <label className="text-xs">
                    <span className="mb-1 block font-medium text-slate-600">{crypto ? "Cantidad" : "Acciones"}</span>
                    <input className={`${field} w-full tabular-nums`} value={quantity} onChange={(e) => setQuantity(e.target.value)} inputMode="decimal" />
                  </label>
                  <label className="text-xs">
                    <span className="mb-1 block font-medium text-red-700">Stop</span>
                    <input className={`${field} w-full tabular-nums`} value={stop} onChange={(e) => setStop(e.target.value)} inputMode="decimal" />
                  </label>
                  <label className="text-xs">
                    <span className="mb-1 block font-medium text-emerald-700">Objetivo</span>
                    <input className={`${field} w-full tabular-nums`} value={target} onChange={(e) => setTarget(e.target.value)} inputMode="decimal" />
                  </label>
                </div>
                <fieldset className="space-y-1.5 text-xs">
                  <label className="flex items-start gap-2">
                    <input type="radio" className="mt-0.5" checked={execution === "next_open"} onChange={() => setExecution("next_open")} />
                    <span>
                      <b className="font-medium text-slate-800">A la apertura de la próxima sesión</b> (lo realista)
                    </span>
                  </label>
                  <label className="flex items-start gap-2">
                    <input type="radio" className="mt-0.5" checked={execution === "now"} onChange={() => setExecution("now")} />
                    <span>
                      <b className="font-medium text-slate-800">Ahora, al último precio</b> (para practicar)
                    </span>
                  </label>
                </fieldset>
                {values.s > 0 && values.t > 0 && values.q > 0 && (
                  <p className="text-xs text-slate-500">
                    Beneficio/riesgo: <b>{num(Math.abs(values.t - idea.price) / Math.abs(idea.price - values.s), 1)} a 1</b>
                  </p>
                )}
              </div>
            )}
          </>
        )}
        {error && <p className="rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-red-700">{error}</p>}
      </div>
    </Modal>
  );
}
