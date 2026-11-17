"use client";
// Conexiones: bancos conectados (solo lectura), cuentas guardadas y extractos importados.
import { useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { CheckCircle2, FileUp, Landmark, Link2, Loader2, LockKeyhole, RefreshCw, Trash2, Unlink } from "lucide-react";
import type { accountsView } from "@/lib/finance/service";
import { card, eur, field, flat, ghost, primary } from "@/components/trading/format";
import { CardHeader, ErrorNote, Pill, SectionTitle } from "@/components/trading/ui";
import { SkeletonList } from "@/components/trading/skeletons";
import { errorText, fapi, longDay, refreshFinance, useFinance } from "./api";
import { requestClassify, requestSync } from "./shell";

type View = Awaited<ReturnType<typeof accountsView>>;

function ImportCard({ accounts }: { accounts: View["accounts"] }) {
  const [file, setFile] = useState<File | null>(null);
  const [target, setTarget] = useState<string>("new");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const submit = async () => {
    if (!file) return;
    setBusy(true);
    setErr(null);
    setResult(null);
    try {
      const form = new FormData();
      form.set("file", file);
      if (target === "new") form.set("newAccountName", name || file.name.replace(/\.[^.]+$/, ""));
      else form.set("accountId", target);
      const res = await fetch("/api/finance/import", { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "No se pudo importar");
      setResult(`${data.inserted} movimientos nuevos del ${longDay(data.from)} al ${longDay(data.to)}${data.skipped ? ` (${data.skipped} ya estaban y se han saltado)` : ""}.${data.method === "ia" ? " Leído con IA: revisa que cuadre." : ""}`);
      setFile(null);
      if (input.current) input.current.value = "";
      refreshFinance();
      requestClassify();
    } catch (e) {
      setErr(errorText(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className={`${card} ${flat} p-4 sm:p-6`}>
      <SectionTitle icon={FileUp} tint="violet" size="base">Importar un extracto</SectionTitle>
      <p className="mt-2 text-sm text-slate-500">CSV o Excel del banco (lo más fiable) o PDF. Sirve para traer historial antiguo o cuentas sin conexión. Lo que ya esté no se duplica.</p>
      <div className="mt-4 space-y-3 text-sm">
        <input ref={input} type="file" accept=".csv,.xlsx,.xls,.pdf,.txt" onChange={(e) => setFile(e.target.files?.[0] ?? null)} className="block w-full text-sm text-slate-600 file:mr-3 file:rounded-xl file:border-0 file:bg-slate-100 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-slate-800 hover:file:bg-slate-200" />
        <div className="flex flex-wrap gap-2">
          <select value={target} onChange={(e) => setTarget(e.target.value)} className={`${field} min-w-0 flex-1`}>
            <option value="new">Nueva cuenta importada…</option>
            {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}{a.bank ? ` (${a.bank})` : ""}</option>)}
          </select>
          {target === "new" && <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nombre de la cuenta" className={`${field} min-w-0 flex-1`} />}
        </div>
        <button type="button" onClick={() => void submit()} disabled={!file || busy} className={primary}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileUp className="h-4 w-4" />} {busy ? "Importando…" : "Importar"}</button>
        {result && <p className="flex items-start gap-2 rounded-xl bg-emerald-50 px-3 py-2 text-emerald-800"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />{result}</p>}
        {err && <ErrorNote>{err}</ErrorNote>}
      </div>
    </section>
  );
}

export function ConnectionsPanel() {
  const params = useSearchParams();
  const { data, error } = useFinance<View>("accounts");
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
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

  return (
    <div className="space-y-4 pb-4">
      {connected && <p className="flex items-center gap-2 rounded-xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm text-emerald-800"><CheckCircle2 className="h-4 w-4" /> Banco conectado. Trayendo tus movimientos…</p>}
      {callbackError && <ErrorNote>No se completó la conexión con el banco ({callbackError.replace(/_/g, " ")}). Inténtalo de nuevo.</ErrorNote>}
      {err && <ErrorNote>{err}</ErrorNote>}
      {!data.configured && <ErrorNote>Falta configurar Enable Banking en el servidor (credenciales y URL de retorno).</ErrorNote>}

      <section className={`${card} ${flat}`}>
        <CardHeader divider actions={<button type="button" onClick={() => requestSync()} className={ghost}><RefreshCw className="h-4 w-4" /> Sincronizar</button>}>
          <SectionTitle icon={Landmark} tint="blue" size="base">Bancos</SectionTitle>
        </CardHeader>
        <ul className="divide-y divide-slate-100">
          {data.banks.map((b) => (
            <li key={b.bank} className="flex flex-wrap items-center gap-3 px-4 py-4 sm:px-6">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-xs font-bold text-blue-700">{b.label.slice(0, 3).toUpperCase()}</span>
              <span className="min-w-0 flex-1">
                <span className="block font-semibold text-slate-900">{b.label}</span>
                <span className="text-xs text-slate-500">
                  {!b.connected ? "Sin conectar" : b.expired ? "Permiso caducado: renuévalo" : `Acceso hasta el ${longDay(b.expiresAt)} (${b.daysLeft} días)`}
                </span>
              </span>
              {b.connected && <Pill color={b.expired ? "amber" : b.daysLeft !== null && b.daysLeft <= 10 ? "amber" : "emerald"}>{b.expired ? "Caducado" : "Conectado"}</Pill>}
              <span className="flex gap-2">
                <a
                  href={`/api/finance/banks/connect?bank=${b.bank}`}
                  onClick={(e) => { if (!data.configured) e.preventDefault(); }}
                  className={`${b.connected && !b.expired ? ghost : primary} ${!data.configured ? "pointer-events-none opacity-50" : ""}`}
                >
                  <Link2 className="h-4 w-4" /> {b.connected ? "Renovar" : "Conectar"}
                </a>
                {b.connected && (
                  <button type="button" onClick={() => void disconnect(b.bank)} disabled={busy === b.bank} className={ghost} aria-label={`Desconectar ${b.label}`}>
                    {busy === b.bank ? <Loader2 className="h-4 w-4 animate-spin" /> : <Unlink className="h-4 w-4" />}
                  </button>
                )}
              </span>
            </li>
          ))}
        </ul>
        <p className="flex items-center gap-1.5 border-t border-slate-100 px-4 py-3 text-xs text-slate-500 sm:px-6">
          <LockKeyhole className="h-3.5 w-3.5" /> Solo lectura a través de Enable Banking. Los bancos piden renovar el permiso cada 90-180 días; te avisaré antes.
          {data.lastSyncAt && <> Última sincronización: {new Intl.DateTimeFormat("es-ES", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(data.lastSyncAt))}.</>}
        </p>
      </section>

      <section className={`${card} ${flat}`}>
        <CardHeader divider><SectionTitle icon={Landmark} tint="slate" size="base">Mis cuentas</SectionTitle></CardHeader>
        {data.accounts.length === 0 ? <p className="px-6 py-5 text-sm text-slate-500">Cuando conectes un banco o importes un extracto, tus cuentas aparecerán aquí.</p> : (
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

      <ImportCard accounts={data.accounts} />
    </div>
  );
}
