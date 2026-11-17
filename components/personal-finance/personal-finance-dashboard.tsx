"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertCircle, ArrowDownLeft, ArrowUpRight, Landmark, Link2, Loader2, LockKeyhole, RefreshCw, Unlink } from "lucide-react";

type Movement = { id: string; date: string; concept: string; amount: number | null; currency: string };
type Account = {
  id: string; name: string; iban: string | null; currency: string; balance: number | null;
  transactions: Movement[]; warning: string | null;
};
type Connection = {
  bank: string; institution: string; expiresAt: string; expired: boolean;
  accounts: Account[]; error: string | null;
};
type FinanceResponse = { configured: boolean; connections: Connection[]; error?: string };

const BANKS = [
  { key: "santander", label: "Santander" },
  { key: "bbva", label: "BBVA" },
  { key: "revolut", label: "Revolut" },
] as const;

function money(value: number, currency: string) {
  try { return new Intl.NumberFormat("es-ES", { style: "currency", currency }).format(value); }
  catch { return `${value.toFixed(2)} ${currency}`; }
}

export function PersonalFinanceDashboard({ callbackError }: { callbackError: boolean }) {
  const [data, setData] = useState<FinanceResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [problem, setProblem] = useState<string | null>(null);
  const [disconnecting, setDisconnecting] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/finance/banks", { cache: "no-store" });
      const result = await response.json() as FinanceResponse;
      if (!response.ok) throw new Error(result.error ?? "No se pudieron consultar tus cuentas");
      setData(result);
    } catch (error) {
      setProblem(error instanceof Error ? error.message : "Error al cargar tus finanzas");
    } finally { setLoading(false); }
  }, []);

  const refresh = useCallback(async () => {
    setLoading(true);
    setProblem(null);
    await load();
  }, [load]);

  useEffect(() => {
    const timer = window.setTimeout(() => { void load(); }, 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  async function disconnect(bank: string) {
    if (!window.confirm("¿Desconectar este banco? Se revocará el consentimiento de lectura.")) return;
    setDisconnecting(bank);
    setProblem(null);
    try {
      const response = await fetch("/api/finance/banks", {
        method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ bank }),
      });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error ?? "No se pudo desconectar el banco");
      await refresh();
    } catch (error) {
      setProblem(error instanceof Error ? error.message : "No se pudo desconectar el banco");
    } finally { setDisconnecting(null); }
  }

  const connections = data?.connections ?? [];
  const active = connections.filter((connection) => !connection.expired);
  const accounts = active.flatMap((connection) => connection.accounts.map((account) => ({ ...account, institution: connection.institution })));
  const eurBalances = accounts.filter((account) => account.currency === "EUR" && account.balance !== null);
  const eurTotal = eurBalances.reduce((total, account) => total + (account.balance ?? 0), 0);
  const movements = accounts.flatMap((account) => account.transactions.map((movement) => ({ ...movement, bank: account.institution, account: account.name })))
    .sort((a, b) => b.date.localeCompare(a.date)).slice(0, 50);

  return (
    <div className="space-y-5 pt-3 pb-8">
      {callbackError && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">No se completó la vinculación. Revisa el consentimiento e inténtalo de nuevo.</div>
      )}
      {problem && <div role="alert" className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700"><AlertCircle className="size-4 shrink-0" />{problem}</div>}
      {data && !data.configured && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          Falta configurar Enable Banking en el servidor. Las conexiones se habilitarán al añadir las credenciales y la URL de retorno.
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-3">
        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-medium text-slate-500">Saldo conocido en EUR</p>
          <p className="mt-2 text-2xl font-semibold tabular-nums text-slate-950">{eurBalances.length ? money(eurTotal, "EUR") : "—"}</p>
          <p className="mt-1 text-xs text-slate-500">Suma de cuentas EUR con saldo disponible</p>
        </section>
        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-medium text-slate-500">Bancos conectados</p>
          <p className="mt-2 text-2xl font-semibold tabular-nums text-slate-950">{active.length}</p>
          <p className="mt-1 text-xs text-slate-500">De Santander, BBVA y Revolut</p>
        </section>
        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-medium text-slate-500">Movimientos consultados</p>
          <p className="mt-2 text-2xl font-semibold tabular-nums text-slate-950">{movements.length}</p>
          <p className="mt-1 text-xs text-slate-500">Últimos 90 días, según disponibilidad bancaria</p>
        </section>
      </div>

      <div className="flex items-center justify-between gap-3">
        <h2 className="text-base font-semibold text-slate-900">Mis bancos</h2>
        <button type="button" onClick={() => void refresh()} disabled={loading} className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50">
          <RefreshCw className={`size-3.5 ${loading ? "animate-spin" : ""}`} /> Actualizar
        </button>
      </div>
      <div className="grid gap-3 lg:grid-cols-3">
        {BANKS.map((bank) => {
          const connection = connections.find((item) => item.bank === bank.key);
          return <section key={bank.key} className="min-w-0 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2"><span className="flex size-9 items-center justify-center rounded-xl bg-blue-50 text-blue-700"><Landmark className="size-4" /></span><h3 className="font-semibold text-slate-900">{bank.label}</h3></div>
              <span className={`rounded-full px-2.5 py-1 text-[11px] font-medium ${connection && !connection.expired ? "bg-emerald-50 text-emerald-700" : connection?.expired ? "bg-amber-50 text-amber-700" : "bg-slate-100 text-slate-500"}`}>{connection && !connection.expired ? "Conectado" : connection?.expired ? "Caducado" : "Sin conectar"}</span>
            </div>
            {connection && !connection.expired ? <div className="mt-4 space-y-2">
              {connection.accounts.map((account) => <div key={account.id} className="rounded-xl bg-slate-50 px-3 py-2.5">
                <p className="truncate text-xs text-slate-600">{account.name} {account.iban ?? ""}</p>
                <p className="mt-1 text-lg font-semibold tabular-nums text-slate-950">{account.balance === null ? "Saldo no disponible" : money(account.balance, account.currency)}</p>
                {account.warning && <p className="mt-1 text-[11px] text-amber-700">{account.warning}</p>}
              </div>)}
              {connection.error && <p className="text-xs text-amber-700">{connection.error}</p>}
              <p className="text-xs text-slate-500">Permiso hasta el {new Date(connection.expiresAt).toLocaleDateString("es-ES")}</p>
            </div> : <p className="mt-4 min-h-12 text-sm text-slate-500">{connection?.expired ? "Tu permiso de lectura ha caducado. Renuévalo para consultar la cuenta." : "Conecta tu cuenta para consultar saldos y extractos."}</p>}
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <a href={`/api/finance/banks/connect?bank=${bank.key}`} aria-disabled={!data?.configured || loading} onClick={(event) => { if (!data?.configured || loading) event.preventDefault(); }} className={`inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-2 text-xs font-medium text-white hover:bg-blue-700 ${!data?.configured || loading ? "pointer-events-none opacity-50" : ""}`}><Link2 className="size-3.5" />{connection ? "Renovar" : "Conectar"}</a>
              {connection && <button type="button" disabled={disconnecting === bank.key} onClick={() => void disconnect(bank.key)} className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50">
                {disconnecting === bank.key ? <Loader2 className="size-3.5 animate-spin" /> : <Unlink className="size-3.5" />} Desconectar
              </button>}
            </div>
          </section>;
        })}
      </div>

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-slate-100 px-4 py-4">
          <h2 className="text-base font-semibold text-slate-900">Movimientos recientes</h2>
          <span className="inline-flex items-center gap-1.5 text-xs text-slate-500"><LockKeyhole className="size-3.5" /> Solo lectura</span>
        </div>
        {loading ? <div className="flex items-center justify-center gap-2 p-12 text-sm text-slate-500"><Loader2 className="size-4 animate-spin" /> Consultando los bancos…</div>
          : movements.length === 0 ? <p className="p-10 text-center text-sm text-slate-500">Cuando conectes tus bancos, aquí aparecerán los movimientos que permitan consultar.</p>
          : <div className="overflow-x-auto"><table className="w-full min-w-[560px] text-sm"><thead><tr className="bg-slate-50 text-left text-xs text-slate-500"><th className="px-4 py-3 font-medium">Fecha</th><th className="px-4 py-3 font-medium">Concepto</th><th className="px-4 py-3 font-medium">Banco</th><th className="px-4 py-3 text-right font-medium">Importe</th></tr></thead>
            <tbody className="divide-y divide-slate-100">{movements.map((movement, index) => <tr key={`${movement.bank}-${movement.account}-${movement.id}-${index}`}>
              <td className="whitespace-nowrap px-4 py-3 text-slate-500">{movement.date || "—"}</td>
              <td className="max-w-[350px] truncate px-4 py-3 text-slate-900" title={movement.concept}>{movement.concept}</td>
              <td className="px-4 py-3 text-slate-500">{movement.bank}</td>
              <td className={`whitespace-nowrap px-4 py-3 text-right font-medium tabular-nums ${movement.amount !== null && movement.amount > 0 ? "text-emerald-700" : "text-slate-900"}`}><span className="inline-flex items-center gap-1">{movement.amount === null ? "—" : movement.amount > 0 ? <ArrowDownLeft className="size-3.5" /> : <ArrowUpRight className="size-3.5" />}{movement.amount === null ? "—" : money(movement.amount, movement.currency)}</span></td>
            </tr>)}</tbody></table></div>}
      </section>
    </div>
  );
}
