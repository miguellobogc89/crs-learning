"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { CheckCircle2, Link2, Loader2, LockKeyhole, Mail, Plug, RefreshCw, Unlink } from "lucide-react";
import type { accountsView } from "@/lib/finance/service";
import { card, flat, ghost, primary } from "@/components/trading/format";
import { CardHeader, ErrorNote, Pill, SectionTitle } from "@/components/trading/ui";
import { SkeletonList } from "@/components/trading/skeletons";
import { errorText, longDay, refreshFinance, useFinance } from "./api";
import { requestSync } from "./shell";
import { BankLogo } from "./bank-logo";
import { GmailCard } from "./gmail-card";

type View = Awaited<ReturnType<typeof accountsView>>;

export function ConnectionsPanel() {
  const params = useSearchParams();
  const { data, error } = useFinance<View>("accounts");
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const connected = params.get("banco") === "conectado";
  const callbackError = params.get("error");
  const synced = useRef(false);

  useEffect(() => {
    if (connected && !synced.current) {
      synced.current = true;
      requestSync();
    }
  }, [connected]);

  if (error && !data) return <ErrorNote>{error}</ErrorNote>;
  if (!data) return <SkeletonList rows={5} />;

  const disconnect = async (bank: string) => {
    if (!window.confirm("¿Desconectar este banco? Se revoca el permiso de lectura. Los movimientos ya guardados se conservan.")) return;
    setBusy(bank);
    setErr(null);
    try {
      const res = await fetch("/api/finance/banks", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ bank }) });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || "No se pudo desconectar");
      refreshFinance();
    } catch (e) {
      setErr(errorText(e));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-4 pb-4">
      {connected && <p className="flex items-center gap-2 rounded-xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm text-emerald-800"><CheckCircle2 className="h-4 w-4" /> Banco conectado. Trayendo tus movimientos…</p>}
      {callbackError && <ErrorNote>No se completó la conexión con el banco ({callbackError.replace(/_/g, " ")}). Inténtalo de nuevo.</ErrorNote>}
      {err && <ErrorNote>{err}</ErrorNote>}

      <section className={`${card} ${flat}`}>
        <CardHeader divider><SectionTitle icon={Mail} tint="blue" size="base">Correo electrónico</SectionTitle></CardHeader>
        <div className="flex items-start gap-3 px-4 py-4 sm:px-6">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-red-50 text-red-600"><Mail className="h-6 w-6" /></span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-semibold text-slate-900">Gmail</span>
              <Pill color="slate">Próximamente</Pill>
            </div>
            <p className="mt-1 text-sm text-slate-500">Detectar facturas, recibos, renovaciones, cancelaciones y avisos de subida de precios.</p>
            <p className="mt-2 text-xs text-slate-400">Todavía no está habilitada la conexión de solo lectura con Google.</p>
          </div>
        </div>
      </section>

      <section className={`${card} ${flat}`}>
        <CardHeader divider actions={<button type="button" onClick={() => requestSync()} className={ghost} aria-label="Sincronizar bancos" title="Sincronizar bancos"><RefreshCw className="h-4 w-4" /><span className="hidden sm:inline">Sincronizar</span></button>}>
          <SectionTitle icon={Plug} tint="blue" size="base">Bancos</SectionTitle>
        </CardHeader>
        {!data.configured && <p className="border-b border-slate-100 px-4 py-3 text-xs text-amber-700 sm:px-6">Falta configurar Enable Banking en el servidor para conectar bancos.</p>}
        <ul className="divide-y divide-slate-100">
          {[...data.banks].sort((a, b) => Number(b.connected) - Number(a.connected)).map((bank) => (
            <li key={bank.bank} className="flex flex-wrap items-center gap-3 px-4 py-4 sm:px-6">
              <BankLogo bank={bank.bank} className="h-11 w-11" />
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold text-slate-900">{bank.label}</span>
                <span className="block text-xs text-slate-500">{!bank.connected ? "Sin conectar" : bank.expired ? "Permiso caducado: renuévalo" : `Permiso válido hasta el ${longDay(bank.expiresAt)}`}</span>
              </span>
              {bank.connected && <Pill color={bank.expired || bank.daysLeft !== null && bank.daysLeft <= 10 ? "amber" : "emerald"}>{bank.expired ? "Caducado" : "Conectado"}</Pill>}
              <span className="flex shrink-0 items-center gap-1.5">
                <a href={`/api/finance/banks/connect?bank=${bank.bank}`} onClick={(event) => { if (!data.configured) event.preventDefault(); }} className={`${bank.connected && !bank.expired ? ghost : primary} ${!data.configured ? "pointer-events-none opacity-50" : ""}`}>
                  <Link2 className="h-4 w-4" /> {bank.connected ? "Renovar" : "Conectar"}
                </a>
                {bank.connected && <button type="button" onClick={() => void disconnect(bank.bank)} disabled={busy === bank.bank} className={ghost} aria-label={`Desconectar ${bank.label}`}>
                  {busy === bank.bank ? <Loader2 className="h-4 w-4 animate-spin" /> : <Unlink className="h-4 w-4" />}
                </button>}
              </span>
            </li>
          ))}
        </ul>
        <p className="flex items-start gap-1.5 border-t border-slate-100 px-4 py-3 text-xs text-slate-500 sm:px-6">
          <LockKeyhole className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>Acceso bancario de solo lectura mediante Enable Banking.{data.lastSyncAt && <> Última sincronización: {new Intl.DateTimeFormat("es-ES", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(data.lastSyncAt))}.</>}</span>
        </p>
      </section>
      <GmailCard />
    </div>
  );
}
