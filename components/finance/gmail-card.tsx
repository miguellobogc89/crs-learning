"use client";
// Conexiones · Gmail: conectar el correo (solo lectura), leer avisos de suscripciones y ver las zombi.
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { AlertTriangle, Loader2, Mail, RefreshCw, Unlink } from "lucide-react";
import type { gmailView } from "@/lib/finance/gmail";
import { card, eur, flat, ghost, primary } from "@/components/trading/format";
import { ErrorNote, SectionTitle } from "@/components/trading/ui";
import { errorText, fapi, longDay, refreshFinance, useFinance } from "./api";

type View = Awaited<ReturnType<typeof gmailView>>;
const KIND: Record<string, string> = { cancelacion: "cancelaciones", subida: "subidas de precio", renovacion: "renovaciones", factura: "facturas" };

export function GmailCard() {
  const params = useSearchParams();
  const { data, reload } = useFinance<View>("gmail");
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(params.get("gmail") === "error" ? params.get("message") : null);
  const [note, setNote] = useState<string | null>(params.get("gmail") === "connected" ? "Gmail conectado. Ya se han leído tus correos de suscripciones." : null);
  const run = async (key: string, fn: () => Promise<unknown>) => {
    setBusy(key);
    setErr(null);
    try {
      const r = await fn();
      if (key === "sync") setNote(`Leídos: ${(r as { added: number }).added} correos nuevos de suscripciones o facturas.`);
      reload();
      refreshFinance();
    } catch (e) {
      setErr(errorText(e));
    } finally {
      setBusy(null);
    }
  };
  const on = data && data.status !== "disconnected";
  return (
    <section className={`${card} ${flat} p-4 sm:p-5`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <SectionTitle icon={Mail} tint="red" size="base">Gmail</SectionTitle>
        {on ? (
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => void run("sync", () => fapi("gmail/sync", {}))} disabled={!!busy} className={ghost}>
              {busy === "sync" ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />} Leer correo
            </button>
            <button type="button" onClick={() => void run("off", () => fapi("gmail/disconnect", {}))} disabled={!!busy} className={ghost} aria-label="Desconectar Gmail"><Unlink className="h-4 w-4" /></button>
          </div>
        ) : (
          <a href="/api/finance/gmail/connect" className={primary}><Mail className="h-4 w-4" /> Conectar Gmail</a>
        )}
      </div>
      <p className="mt-2 text-sm text-slate-500">
        {on
          ? `${data.email ?? "Conectado"} · solo lectura${data.lastSyncAt ? ` · leído el ${longDay(data.lastSyncAt)}` : ""}`
          : "Solo lectura. CRS busca los correos de cancelaciones, renovaciones, subidas de precio y facturas para avisarte si te siguen cobrando algo que cancelaste."}
      </p>
      {data?.status === "error" && data.lastError && <div className="mt-3"><ErrorNote>{data.lastError}</ErrorNote></div>}
      {err && <div className="mt-3"><ErrorNote>{err}</ErrorNote></div>}
      {note && <p className="mt-3 text-sm text-emerald-700">{note}</p>}
      {on && Object.keys(data.counts).length > 0 && (
        <p className="mt-3 text-xs text-slate-500">
          Detectados: {Object.entries(data.counts).map(([k, n]) => `${n} ${KIND[k] ?? k}`).join(" · ")}
        </p>
      )}
      {on && data.zombies.length > 0 && (
        <ul className="mt-3 space-y-2">
          {data.zombies.map((z) => (
            <li key={z.merchant} className="flex items-start gap-2.5 rounded-xl bg-red-50 px-3 py-2.5 text-sm text-red-900">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>
                <b className="capitalize">{z.merchant}</b>: cancelaste el {longDay(z.cancelledOn)} y después te han cobrado{" "}
                {z.charges.map((c) => `${eur(-c.amount, 2)} (${longDay(c.date)})`).join(", ")}.
              </span>
            </li>
          ))}
        </ul>
      )}
      {on && data.recent.length > 0 && (
        <details className="mt-3 text-sm">
          <summary className="cursor-pointer text-slate-600">Últimas cancelaciones y subidas detectadas</summary>
          <ul className="mt-2 divide-y divide-slate-100">
            {data.recent.map((e) => (
              <li key={e.messageId} className="flex justify-between gap-3 py-2">
                <span className="min-w-0 truncate text-slate-700" title={e.subject}>{e.subject}</span>
                <span className="shrink-0 text-xs text-slate-400">{longDay(e.date)}</span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}
