"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { CheckCircle2, Landmark, Link2, Loader2, LockKeyhole, Plus, RefreshCw, Trash2, Unlink } from "lucide-react";
import type { accountsView } from "@/lib/finance/service";
import { card, eur, flat, ghost, primary } from "@/components/trading/format";
import { CardHeader, ErrorNote, Pill, SectionTitle } from "@/components/trading/ui";
import { SkeletonList } from "@/components/trading/skeletons";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { errorText, fapi, longDay, refreshFinance, useFinance } from "./api";
import { BankLogo } from "./bank-logo";
import { YaxiBankConnect } from "./yaxi-bank-connect";
import { requestSync } from "./shell";

type View = Awaited<ReturnType<typeof accountsView>>;

export function AccountsPanel() {
  const params = useSearchParams();
  const { data, error } = useFinance<View>("accounts");
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [yaxiMode, setYaxiMode] = useState(false);
  const connected = params.get("banco") === "conectado";
  const callbackError = params.get("error");
  const synced = useRef(false);
  useEffect(() => {
    if (params.has("yaxi_return")) { setPickerOpen(true); setYaxiMode(true); }
  }, [params]);

  useEffect(() => {
    if (connected && !synced.current) {
      synced.current = true;
      requestSync();
    }
  }, [connected]);

  if (error && !data) return <ErrorNote>{error}</ErrorNote>;
  if (!data) return <SkeletonList rows={5} />;

  const toggleInclude = async (id: string, included: boolean) => {
    setBusy(id);
    setErr(null);
    try {
      await fapi("account", { id, included });
      refreshFinance();
    } catch (e) {
      setErr(errorText(e));
    } finally {
      setBusy(null);
    }
  };

  const removeImport = async (id: string, name: string) => {
    if (!window.confirm(`¿Borrar la cuenta importada «${name}» y todos sus movimientos?`)) return;
    setBusy(id);
    setErr(null);
    try {
      await fapi("account/delete", { id });
      refreshFinance();
    } catch (e) {
      setErr(errorText(e));
    } finally {
      setBusy(null);
    }
  };

  const syncYaxi = async (bank: string) => {
    setBusy(bank);
    setErr(null);
    try {
      const response = await fetch("/api/finance/banks/yaxi/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bank }),
      });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error || "No se pudo actualizar el banco");
      refreshFinance();
    } catch (e) {
      setErr(errorText(e));
    } finally {
      setBusy(null);
    }
  };

  const disconnectBank = async (bank: string) => {
    if (!window.confirm(bank.startsWith("yaxi:")
      ? "¿Dejar de sincronizar este banco? Se elimina el acceso guardado en CRS Finance, pero el consentimiento puede seguir vigente en el banco. Los movimientos guardados se conservan."
      : "¿Desconectar este banco? Se revoca el permiso de lectura. Los movimientos ya guardados se conservan.")) return;
    setBusy(bank);
    setErr(null);
    try {
      const response = await fetch("/api/finance/banks", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ bank }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "No se pudo desconectar");
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
        <CardHeader divider>
          <SectionTitle icon={Landmark} tint="blue" size="base">Mis cuentas</SectionTitle>
        </CardHeader>
        {data.accounts.length === 0 ? (
          <p className="px-4 py-5 text-sm text-slate-500 sm:px-6">No tienes cuentas todavía. Puedes añadir una con el botón de abajo.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {data.accounts.map((account: View["accounts"][number]) => (
              <li key={account.id} className={`flex items-center gap-3 px-4 py-4 sm:px-6 ${account.included ? "" : "opacity-60"}`}>
                <BankLogo bank={account.bank} className="h-10 w-10" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-slate-900">{account.name}{account.ibanLast4 ? <span className="font-normal text-slate-400"> · •••• {account.ibanLast4}</span> : null}</span>
                  <span className="block text-xs text-slate-500">{account.source === "import" ? "Importada" : account.bank?.startsWith("yaxi:") ? "Conexión bancaria" : account.bank} · {account.count} movimientos{account.since ? ` desde el ${longDay(account.since)}` : ""}{account.bank?.startsWith("yaxi:") ? account.lastSyncedAt ? ` · Actualizada ${new Date(account.lastSyncedAt).toLocaleString("es-ES", { timeZone: "Europe/Madrid", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}` : " · Primera actualización pendiente" : ""}</span>
                  {account.bank?.startsWith("yaxi:") && !account.lastSyncedAt && (
                    <button type="button" onClick={() => void syncYaxi(account.bank!)} disabled={busy === account.bank}
                      className="mt-2 flex items-center gap-1.5 text-xs font-medium text-blue-700 disabled:opacity-50">
                      {busy === account.bank ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                      Obtener saldo y movimientos
                    </button>
                  )}
                  <label className="mt-2 inline-flex items-center gap-2 text-xs text-slate-600" title="Si la excluyes, no cuenta en saldos, gastos ni previsiones">
                    <input type="checkbox" checked={account.included} disabled={busy === account.id} onChange={(e) => void toggleInclude(account.id, e.target.checked)} className="h-4 w-4 rounded border-slate-300" />
                    Incluir en mis finanzas
                  </label>
                </span>
                <div className="flex shrink-0 flex-col items-end gap-2">
                  <span className="amount whitespace-nowrap text-sm font-semibold tabular-nums text-slate-900">{account.balance === null ? "—" : account.currency === "EUR" ? eur(account.balance, 2) : `${account.balance.toFixed(2)} ${account.currency}`}</span>
                  {account.source === "import" && (
                    <button type="button" onClick={() => void removeImport(account.id, account.name)} disabled={busy === account.id} aria-label={`Borrar cuenta importada ${account.name}`} className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-50"><Trash2 className="h-4 w-4" /></button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
        <div className="border-t border-slate-100 px-4 py-4 sm:px-6">
          <button type="button" onClick={() => setPickerOpen(true)} className={`${primary} w-full justify-center sm:w-auto`}><Plus className="h-4 w-4" /> Conectar cuenta</button>
        </div>
      </section>

      <Sheet open={pickerOpen} onOpenChange={setPickerOpen}>
        <SheetContent side="bottom" className="mx-auto max-h-[85dvh] w-full max-w-xl gap-0 overflow-hidden rounded-t-3xl pb-[env(safe-area-inset-bottom)]">
          <SheetHeader className="border-b border-slate-100 px-5 pb-4 pt-5">
            <SheetTitle>Conectar cuenta bancaria</SheetTitle>
            <SheetDescription>Selecciona tu banco. El acceso a los movimientos es de solo lectura.</SheetDescription>
          </SheetHeader>
          {yaxiMode ? (
            <YaxiBankConnect
              onCancel={() => setYaxiMode(false)}
              onDone={() => { setPickerOpen(false); setYaxiMode(false); refreshFinance(); }}
            />
          ) : (
            <>
          {data.yaxiAvailable && (
            <button type="button" onClick={() => setYaxiMode(true)}
              className="m-4 flex w-[calc(100%-2rem)] items-center justify-between rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-left text-sm font-semibold text-blue-900 hover:bg-blue-100">
              <span>Buscar mi banco con YAXI</span><Plus className="h-4 w-4" />
            </button>
          )}
          {!data.configured && <p className="border-b border-slate-100 px-5 py-3 text-xs text-amber-700">La conexión bancaria de Enable Banking no está configurada.</p>}
          <ul className="min-h-0 overflow-y-auto divide-y divide-slate-100">
            {[...data.banks].sort((a, b) => Number(b.connected) - Number(a.connected)).map((bank) => (
              <li key={bank.bank} className="flex flex-wrap items-center gap-3 px-5 py-4">
                <BankLogo bank={bank.bank} className="h-11 w-11" />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold text-slate-900">{bank.label}</span>
                  <span className="block text-xs text-slate-500">{!bank.connected ? "Sin conectar" : bank.expired ? "Permiso caducado" : `Permiso hasta el ${longDay(bank.expiresAt)}`}</span>
                </span>
                {bank.connected && <Pill color={bank.expired ? "amber" : "emerald"}>{bank.expired ? "Caducado" : "Conectado"}</Pill>}
                <span className="flex shrink-0 items-center gap-1">
                  {bank.bank.startsWith("yaxi:") ? (
                    <button type="button" onClick={() => setYaxiMode(true)} disabled={!data.yaxiAvailable}
                      className={ghost}><Link2 className="h-4 w-4" /> Renovar</button>
                  ) : (
                    <a href={`/api/finance/banks/connect?bank=${bank.bank}`} onClick={(event) => { if (!data.configured) event.preventDefault(); }} className={`${bank.connected ? ghost : primary} ${!data.configured ? "pointer-events-none opacity-50" : ""}`}><Link2 className="h-4 w-4" /> {bank.connected ? "Renovar" : "Conectar"}</a>
                  )}
                  {bank.connected && <button type="button" onClick={() => void disconnectBank(bank.bank)} disabled={busy === bank.bank} className={ghost} aria-label={`Desconectar ${bank.label}`}>
                    {busy === bank.bank ? <Loader2 className="h-4 w-4 animate-spin" /> : <Unlink className="h-4 w-4" />}
                  </button>}
                </span>
              </li>
            ))}
          </ul>
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 px-5 py-4 text-xs text-slate-500">
            <span className="inline-flex items-center gap-1.5"><LockKeyhole className="h-3.5 w-3.5" /> Acceso seguro mediante entidades bancarias</span>
            <button type="button" onClick={() => requestSync()} className="inline-flex items-center gap-1.5 font-medium text-blue-700"><RefreshCw className="h-3.5 w-3.5" /> Sincronizar</button>
          </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
