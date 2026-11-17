"use client";
// Conexiones: bancos conectados y cuentas guardadas.
import { useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { CheckCircle2, ChevronDown, Ellipsis, Landmark, Link2, Loader2, LockKeyhole, RefreshCw, Trash2, Unlink } from "lucide-react";
import type { accountsView } from "@/lib/finance/service";
import { card, eur, flat, ghost, primary } from "@/components/trading/format";
import { CardHeader, ErrorNote, Pill, SectionTitle } from "@/components/trading/ui";
import { SkeletonList } from "@/components/trading/skeletons";
import { errorText, fapi, longDay, refreshFinance, useFinance } from "./api";
import { requestSync } from "./shell";
import { BankLogo } from "./bank-logo";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

type View = Awaited<ReturnType<typeof accountsView>>;

export function ConnectionsPanel() {
  const params = useSearchParams();
  const { data, error } = useFinance<View>("accounts");
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [collapsedBanks, setCollapsedBanks] = useState<Set<string>>(new Set());
  const connected = params.get("banco") === "conectado";
  const callbackError = params.get("error");
  const synced = useRef(false);
  useEffect(() => {
    // Recién conectado un banco: traer ya sus movimientos.
    if (connected && !synced.current) {
      synced.current = true;
      requestSync();
    }
  }, [connected]);

  if (error && !data) return <ErrorNote>{error}</ErrorNote>;
  if (!data) return <SkeletonList rows={6} />;

  const disconnect = async (bank: string) => {
    if (!window.confirm("¿Desconectar este banco? Se revoca el permiso de lectura. Los movimientos ya guardados se conservan.")) return;
    setBusy(bank);
    setErr(null);
    try {
      const res = await fetch("/api/finance/banks", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ bank }) });
      const r = await res.json();
      if (!res.ok) throw new Error(r.error || "No se pudo desconectar");
      refreshFinance();
    } catch (e) {
      setErr(errorText(e));
    } finally {
      setBusy(null);
    }
  };
  const toggleInclude = async (id: string, included: boolean) => {
    setBusy(id);
    try {
      await fapi("account", { id, included });
      refreshFinance();
    } finally {
      setBusy(null);
    }
  };
  const removeImport = async (id: string, name: string) => {
    if (!window.confirm(`¿Borrar la cuenta importada «${name}» y todos sus movimientos?`)) return;
    setBusy(id);
    try {
      await fapi("account/delete", { id });
      refreshFinance();
    } catch (e) {
      setErr(errorText(e));
    } finally {
      setBusy(null);
    }
  };

  const mobileBalance = (account: View["accounts"][number]) =>
    account.balance === null ? "—" : account.currency === "EUR" ? eur(account.balance, 2) : `${account.balance.toFixed(2)} ${account.currency}`;

  const accountGroups = data.banks.map((bank) => {
    const accounts = data.accounts.filter((account) => account.bank === bank.bank);
    const balance = accounts.length > 0 && accounts.every((account) => account.currency === "EUR" && account.balance !== null)
      ? eur(accounts.reduce((sum, account) => sum + (account.balance ?? 0), 0), 2)
      : "—";
    return { ...bank, accounts, balance };
  });

  return (
    <div className="space-y-4 pb-4">
      {connected && <p className="flex items-center gap-2 rounded-xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm text-emerald-800"><CheckCircle2 className="h-4 w-4" /> Banco conectado. Trayendo tus movimientos…</p>}
      {callbackError && <ErrorNote>No se completó la conexión con el banco ({callbackError.replace(/_/g, " ")}). Inténtalo de nuevo.</ErrorNote>}
      {err && <ErrorNote>{err}</ErrorNote>}
      {!data.configured && <ErrorNote>Falta configurar Enable Banking en el servidor (credenciales y URL de retorno).</ErrorNote>}

      {/* Móvil: una sola lista, con cada banco y sus cuentas dentro. */}
      <section className={`${card} ${flat} md:hidden`}>
        <CardHeader divider actions={<button type="button" onClick={() => requestSync()} className={ghost} aria-label="Sincronizar bancos" title="Sincronizar bancos"><RefreshCw className="h-4 w-4" /></button>}>
          <SectionTitle icon={Landmark} tint="blue" size="base">Cuentas conectadas</SectionTitle>
        </CardHeader>
        <ul className="divide-y divide-slate-100">
          {accountGroups.map((bank) => {
            const single = bank.accounts.length === 1 ? bank.accounts[0] : null;
            const expandable = bank.accounts.length > 1;
            const expanded = !collapsedBanks.has(bank.bank);
            return (
              <li key={bank.bank} className="px-4 py-3.5">
                <div className="flex min-w-0 items-center gap-3">
                  <button type="button" disabled={!expandable} aria-expanded={expandable ? expanded : undefined} aria-label={expandable ? `${expanded ? "Ocultar" : "Mostrar"} cuentas de ${bank.label}` : bank.label} onClick={() => setCollapsedBanks((previous) => {
                    const next = new Set(previous);
                    if (next.has(bank.bank)) next.delete(bank.bank);
                    else next.add(bank.bank);
                    return next;
                  })} className="flex min-w-0 flex-1 items-center gap-3 text-left disabled:cursor-default">
                    <span className="relative shrink-0">
                      <BankLogo bank={bank.bank} className="h-11 w-11" />
                      <span className={`absolute -bottom-1 -right-1 h-3.5 w-3.5 rounded-full border-[3px] border-white ${!bank.connected ? "bg-slate-300" : bank.expired ? "bg-amber-500" : "bg-emerald-500"}`} aria-hidden="true" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold text-slate-900">{bank.label}{single?.ibanLast4 ? <span className="font-normal text-slate-500"> ···· {single.ibanLast4}</span> : null}</span>
                      <span className="mt-0.5 block truncate text-xs text-slate-500">{!bank.connected ? "Sin conectar" : bank.expired ? "Permiso caducado" : `Válido hasta el ${longDay(bank.expiresAt)}`}</span>
                    </span>
                    {expandable && <ChevronDown className={`h-4 w-4 shrink-0 text-slate-400 transition-transform ${expanded ? "" : "-rotate-90"}`} />}
                  </button>
                  <span className="shrink-0 text-right text-sm font-semibold tabular-nums text-slate-900">{single ? mobileBalance(single) : bank.balance}</span>
                  {bank.connected ? (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button type="button" disabled={busy === bank.bank} aria-label={`Opciones de ${bank.label}`} className="flex h-9 w-8 shrink-0 items-center justify-center rounded-lg text-slate-500 active:bg-slate-100">
                          {busy === bank.bank ? <Loader2 className="h-4 w-4 animate-spin" /> : <Ellipsis className="h-5 w-5" />}
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-44">
                        <DropdownMenuItem asChild disabled={!data.configured}>
                          <a href={`/api/finance/banks/connect?bank=${bank.bank}`} onClick={(e) => { if (!data.configured) e.preventDefault(); }}><Link2 className="h-4 w-4" /> Renovar</a>
                        </DropdownMenuItem>
                        <DropdownMenuItem variant="destructive" onSelect={() => void disconnect(bank.bank)}><Unlink className="h-4 w-4" /> Desconectar</DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  ) : (
                    <a href={`/api/finance/banks/connect?bank=${bank.bank}`} onClick={(e) => { if (!data.configured) e.preventDefault(); }} className={`shrink-0 text-xs font-semibold text-blue-700 ${!data.configured ? "pointer-events-none opacity-50" : ""}`}>Conectar</a>
                  )}
                </div>
                {expandable && expanded && (
                  <ul className="ml-14 mt-3 divide-y divide-slate-100 border-t border-slate-100">
                    {bank.accounts.map((account) => (
                      <li key={account.id} className={`flex items-center justify-between gap-3 py-3 ${account.included ? "" : "opacity-50"}`}>
                        <span className="min-w-0 text-sm text-slate-600"><span className="block truncate">{account.name}</span>{account.ibanLast4 && <span className="text-xs text-slate-400">···· {account.ibanLast4}</span>}</span>
                        <span className="shrink-0 text-right text-sm font-medium tabular-nums text-slate-900">{mobileBalance(account)}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>
      </section>

      <section className={`${card} ${flat} hidden md:block`}>
        <CardHeader divider actions={<button type="button" onClick={() => requestSync()} className={ghost} aria-label="Sincronizar bancos" title="Sincronizar bancos"><RefreshCw className="h-4 w-4" /><span className="hidden md:inline">Sincronizar</span></button>}>
          <SectionTitle icon={Landmark} tint="blue" size="base">Bancos</SectionTitle>
        </CardHeader>
        <ul className="divide-y divide-slate-100">
          {data.banks.map((b) => (
            <li key={b.bank} className="px-4 py-4 sm:px-6">
              <div className="flex flex-wrap items-center gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-xs font-bold text-blue-700">{b.label.slice(0, 3).toUpperCase()}</span>
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold text-slate-900">{b.label}</span>
                  <span className="text-xs text-slate-500">
                    {!b.connected ? "Sin conectar" : b.expired ? "Permiso caducado: renuévalo" : `Acceso hasta el ${longDay(b.expiresAt)} (${b.daysLeft} días)`}
                  </span>
                </span>
                {b.connected && <Pill color={b.expired ? "amber" : b.daysLeft !== null && b.daysLeft <= 10 ? "amber" : "emerald"}>{b.expired ? "Caducado" : "Conectado"}</Pill>}
                <span className="flex gap-2">
                  <a href={`/api/finance/banks/connect?bank=${b.bank}`} onClick={(e) => { if (!data.configured) e.preventDefault(); }} className={`${b.connected && !b.expired ? ghost : primary} ${!data.configured ? "pointer-events-none opacity-50" : ""}`}>
                    <Link2 className="h-4 w-4" /> {b.connected ? "Renovar" : "Conectar"}
                  </a>
                  {b.connected && <button type="button" onClick={() => void disconnect(b.bank)} disabled={busy === b.bank} className={ghost} aria-label={`Desconectar ${b.label}`}>
                    {busy === b.bank ? <Loader2 className="h-4 w-4 animate-spin" /> : <Unlink className="h-4 w-4" />}
                  </button>}
                </span>
              </div>
            </li>
          ))}
        </ul>
        <p className="hidden items-center gap-1.5 border-t border-slate-100 px-4 py-3 text-xs text-slate-500 md:flex md:px-6">
          <LockKeyhole className="h-3.5 w-3.5" /> Solo lectura a través de Enable Banking. Los bancos piden renovar el permiso cada 90-180 días; te avisaré antes.
          {data.lastSyncAt && <> Última sincronización: {new Intl.DateTimeFormat("es-ES", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(data.lastSyncAt))}.</>}
        </p>
      </section>

      <section className={`${card} ${flat} hidden md:block`}>
        <CardHeader divider><SectionTitle icon={Landmark} tint="slate" size="base">Mis cuentas</SectionTitle></CardHeader>
        {data.accounts.length === 0 ? <p className="px-6 py-5 text-sm text-slate-500">Cuando conectes un banco, tus cuentas aparecerán aquí.</p> : (
          <ul className="divide-y divide-slate-100">
            {data.accounts.map((a) => (
              <li key={a.id} className={`flex flex-wrap items-center gap-3 px-4 py-3.5 sm:px-6 ${a.included ? "" : "opacity-60"}`}>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium text-slate-900">{a.name}{a.ibanLast4 ? <span className="font-normal text-slate-400"> · •••• {a.ibanLast4}</span> : null}</span>
                  <span className="text-xs text-slate-500">{a.source === "import" ? "Importada" : a.bank} · {a.count} movimientos{a.since ? ` desde el ${longDay(a.since)}` : ""}</span>
                </span>
                <span className="shrink-0 text-right font-semibold tabular-nums text-slate-900">{a.balance === null ? "—" : eur(a.balance, 2)}</span>
                <label className="flex shrink-0 items-center gap-2 text-xs text-slate-600" title="Si la excluyes, no cuenta en saldos, gastos ni previsiones">
                  <input type="checkbox" checked={a.included} disabled={busy === a.id} onChange={(e) => void toggleInclude(a.id, e.target.checked)} className="h-4 w-4 rounded border-slate-300" />
                  Incluir
                </label>
                {a.source === "import" && (
                  <button type="button" onClick={() => void removeImport(a.id, a.name)} disabled={busy === a.id} aria-label="Borrar cuenta importada" className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600"><Trash2 className="h-4 w-4" /></button>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

    </div>
  );
}
