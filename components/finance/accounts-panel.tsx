"use client";

import { useState } from "react";
import { Landmark, Trash2 } from "lucide-react";
import type { accountsView } from "@/lib/finance/service";
import { card, eur, flat } from "@/components/trading/format";
import { CardHeader, ErrorNote, SectionTitle } from "@/components/trading/ui";
import { SkeletonList } from "@/components/trading/skeletons";
import { errorText, fapi, longDay, refreshFinance, useFinance } from "./api";
import { BankLogo } from "./bank-logo";

type View = Awaited<ReturnType<typeof accountsView>>;

export function AccountsPanel() {
  const { data, error } = useFinance<View>("accounts");
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

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

  return (
    <div className="space-y-4 pb-4">
      {err && <ErrorNote>{err}</ErrorNote>}
      <section className={`${card} ${flat}`}>
        <CardHeader divider>
          <SectionTitle icon={Landmark} tint="blue" size="base">Mis cuentas</SectionTitle>
        </CardHeader>
        {data.accounts.length === 0 ? (
          <p className="px-4 py-5 text-sm text-slate-500 sm:px-6">No tienes cuentas todavía. Puedes conectar un banco desde Conexiones.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {data.accounts.map((account: View["accounts"][number]) => (
              <li key={account.id} className={`flex items-center gap-3 px-4 py-4 sm:px-6 ${account.included ? "" : "opacity-60"}`}>
                <BankLogo bank={account.bank} className="h-10 w-10" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-slate-900">{account.name}{account.ibanLast4 ? <span className="font-normal text-slate-400"> · •••• {account.ibanLast4}</span> : null}</span>
                  <span className="block text-xs text-slate-500">{account.source === "import" ? "Importada" : account.bank} · {account.count} movimientos{account.since ? ` desde el ${longDay(account.since)}` : ""}</span>
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
      </section>
    </div>
  );
}
