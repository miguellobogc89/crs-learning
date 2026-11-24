"use client";

import { useEffect, useMemo, useState } from "react";
import {
  AccountField, Confirmation, Dialog, Field, RedirectHandle, Result,
  RoutexClient, Selection,
  type ConnectionInfo, type OBResponse,
} from "routex-client";
import { ArrowLeft, Check, Loader2, Search } from "lucide-react";
import { refreshFinance } from "./api";

type Stage = "loading" | "search" | "credentials" | "challenge" | "success";
type RedirectState = { ticket: string; connectionId: string; bankName: string; context: number[] };
const REDIRECT_KEY = "crs-finance-yaxi-redirect";

export function YaxiBankConnect({ onDone, onCancel }: { onDone: () => void; onCancel: () => void }) {
  const client = useMemo(() => new RoutexClient(), []);
  const [stage, setStage] = useState<Stage>("loading");
  const [ticket, setTicket] = useState("");
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<ConnectionInfo[]>([]);
  const [selected, setSelected] = useState<ConnectionInfo | null>(null);
  const [userId, setUserId] = useState("");
  const [password, setPassword] = useState("");
  const [challenge, setChallenge] = useState<Dialog | null>(null);
  const [answer, setAnswer] = useState("");
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function processResponse(response: OBResponse, activeTicket: string, bank: ConnectionInfo | { id: string; displayName: string }) {
    if (response instanceof Result) {
      const res = await fetch("/api/finance/banks/yaxi/result", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jwt: response.jwt, connectionId: bank.id, bankName: bank.displayName,
          connectionData: response.connectionData ?? null,
        }),
      });
      const data = await res.json() as { error?: string };
      if (!res.ok) throw new Error(data.error || "No se pudo guardar la cuenta bancaria");
      window.sessionStorage.removeItem(REDIRECT_KEY);
      setPassword("");
      setUserId("");
      setStage("success");
      refreshFinance();
      return;
    }
    if (response instanceof Dialog) {
      setChallenge(response);
      setAnswer("");
      setStage("challenge");
      return;
    }
    if (response instanceof RedirectHandle) {
      const state: RedirectState = {
        ticket: activeTicket, connectionId: bank.id, bankName: bank.displayName,
        context: Array.from(response.context),
      };
      window.sessionStorage.setItem(REDIRECT_KEY, JSON.stringify(state));
      const url = new URL(window.location.href);
      url.searchParams.set("yaxi_return", "1");
      const redirect = await client.registerRedirectUri({
        ticket: activeTicket, handle: response.handle, redirectUri: url.toString(),
      });
      window.location.assign(redirect);
      return;
    }
    throw new Error("YAXI devolvió una respuesta desconocida");
  }

  useEffect(() => {
    let cancelled = false;
    async function initialize() {
      try {
        const returning = new URL(window.location.href).searchParams.has("yaxi_return");
        const rawState = returning ? window.sessionStorage.getItem(REDIRECT_KEY) : null;
        if (returning && rawState) {
          const previous = JSON.parse(rawState) as RedirectState;
          if (!Array.isArray(previous.context) || previous.context.length > 100000) throw new Error("Retorno bancario inválido");
          const bank = { id: previous.connectionId, displayName: previous.bankName };
          setTicket(previous.ticket);
          setSelected(bank as ConnectionInfo);
          const response = await client.confirmAccounts({
            ticket: previous.ticket, context: new Uint8Array(previous.context),
          });
          if (!cancelled) await processResponse(response, previous.ticket, bank);
          return;
        }
        const response = await fetch("/api/finance/banks/yaxi/ticket", {
          method: "POST", headers: { "Content-Type": "application/json" },
        });
        const info = await response.json() as { ticket?: string; error?: string };
        if (!response.ok || !info.ticket) throw new Error(info.error || "No se pudo iniciar la conexión");
        if (!cancelled) { setTicket(info.ticket); setStage("search"); }
      } catch (e) {
        if (!cancelled) { setError(e instanceof Error ? e.message : "Error de conexión"); setStage("search"); }
      }
    }
    void initialize();
    return () => { cancelled = true; };
    // The initial authorization may require returning from the bank only once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client]);

  useEffect(() => {
    if (stage !== "search" || !ticket || search.trim().length < 3) {
      setResults([]);
      return;
    }
    let cancelled = false;
    const handle = setTimeout(() => {
      const filters = search.trim().split(/\s+/).map(term => ({ term }));
      client.search({ ticket, filters, ibanDetection: true, limit: 30 })
        .then(found => { if (!cancelled) setResults(found); })
        .catch(() => { if (!cancelled) setError("No se pudieron buscar bancos"); });
    }, 300);
    return () => { cancelled = true; clearTimeout(handle); };
  }, [search, stage, ticket, client]);

  const selectBank = async (bank: ConnectionInfo) => {
    setWorking(true);
    setError(null);
    try {
      const info = await client.info(ticket, bank.id);
      setSelected(info);
      setStage("credentials");
    } catch {
      setError("No se pudo consultar el banco");
    } finally {
      setWorking(false);
    }
  };

  const login = async () => {
    if (!selected) return;
    setError(null);
    setWorking(true);
    try {
      const credentials = {
        connectionId: selected.id,
        ...(userId ? { userId } : {}),
        ...(password ? { password } : {}),
      };
      const response = await client.accounts({
        ticket, credentials,
        fields: [AccountField.Iban, AccountField.Name, AccountField.DisplayName,
          AccountField.OwnerName, AccountField.Currency],
      });
      await processResponse(response, ticket, selected);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo conectar con el banco");
    } finally {
      setWorking(false);
    }
  };

  const continueChallenge = async () => {
    if (!challenge || !selected) return;
    setWorking(true);
    setError(null);
    try {
      const input = challenge.input;
      const response = input instanceof Confirmation
        ? await client.confirmAccounts({ ticket, context: input.context })
        : await client.respondAccounts({ ticket, context: input.context, response: answer });
      await processResponse(response, ticket, selected);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo completar la autorización");
    } finally {
      setWorking(false);
    }
  };

  return (
    <div className="space-y-4 p-5">
      <div className="flex items-center gap-3">
        <button type="button" onClick={onCancel} className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100" aria-label="Volver a bancos">
          <ArrowLeft className="h-4 w-4" />
        </button>
        <div><p className="text-sm font-semibold text-slate-900">Conectar banco con YAXI</p><p className="text-xs text-slate-500">Solo lectura · autorización protegida</p></div>
      </div>

      {error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p>}
      {(stage === "loading" || working) && <p className="flex items-center gap-2 text-xs text-slate-500"><Loader2 className="h-4 w-4 animate-spin" /> Procesando…</p>}
      {stage === "search" && ticket && (
        <>
          <label className="block text-xs font-medium text-slate-600">Buscar entidad bancaria</label>
          <div className="flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2">
            <Search className="h-4 w-4 text-slate-400" />
            <input autoFocus value={search} onChange={event => { setSearch(event.target.value); setError(null); }}
              placeholder="Escribe Santander, BBVA, Revolut…" className="min-w-0 flex-1 border-0 bg-transparent text-sm outline-none" />
          </div>
          <ul className="max-h-64 divide-y divide-slate-100 overflow-y-auto">
            {results.map(bank => (
              <li key={bank.id}>
                <button type="button" disabled={working} onClick={() => void selectBank(bank)}
                  className="w-full px-3 py-3 text-left text-sm hover:bg-slate-50 disabled:opacity-50">{bank.displayName}</button>
              </li>
            ))}
          </ul>
          {search.length > 2 && results.length === 0 && !error && <p className="text-xs text-slate-500">No se encontraron resultados.</p>}
        </>
      )}
      {stage === "credentials" && selected && (
        <form onSubmit={event => { event.preventDefault(); void login(); }} className="space-y-3">
          <p className="text-sm font-semibold">{selected.displayName}</p>
          {selected.advice && <p className="rounded-lg bg-blue-50 p-3 text-xs text-blue-900">{selected.advice}</p>}
          {(!selected.credentials || selected.credentials.userId || selected.credentials.full) && (
            <label className="block text-xs text-slate-600">{selected.userId || "Identificador bancario"}
              <input autoComplete="username" value={userId} onChange={e => setUserId(e.target.value)}
                className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-blue-600 focus:outline-none" />
            </label>
          )}
          {(!selected.credentials || selected.credentials.full) && (
            <label className="block text-xs text-slate-600">Contraseña bancaria
              <input type="password" autoComplete="off" value={password} onChange={e => setPassword(e.target.value)}
                className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-blue-600 focus:outline-none" />
            </label>
          )}
          <p className="text-xs text-slate-500">Los datos bancarios se envían directamente mediante el cliente cifrado de YAXI, nunca a CRS Finance.</p>
          <button disabled={working} className="rounded-xl bg-blue-700 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">Continuar</button>
        </form>
      )}
      {stage === "challenge" && challenge && (
        <div className="space-y-3">
          <p className="text-sm text-slate-700">{challenge.message || "Confirma el acceso desde tu banco."}</p>
          {challenge.input instanceof Selection && (
            <select value={answer} onChange={e => setAnswer(e.target.value)} className="w-full rounded-xl border border-slate-200 p-2 text-sm">
              <option value="">Selecciona una opción</option>
              {challenge.input.options.map(item => <option key={item.key} value={item.key}>{item.label}</option>)}
            </select>
          )}
          {challenge.input instanceof Field && (
            <input value={answer} onChange={e => setAnswer(e.target.value)} aria-label="Código de confirmación"
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" />
          )}
          <button disabled={working || (!(challenge.input instanceof Confirmation) && !answer)} onClick={() => void continueChallenge()}
            className="rounded-xl bg-blue-700 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">Confirmar</button>
        </div>
      )}
      {stage === "success" && (
        <div className="space-y-3 text-sm">
          <p className="flex items-center gap-2 text-emerald-700"><Check className="h-4 w-4" /> Cuentas vinculadas correctamente.</p>
          <p className="text-xs text-slate-500">El saldo y los movimientos se incorporarán al configurar la sincronización de YAXI.</p>
          <button onClick={onDone} className="rounded-xl bg-blue-700 px-4 py-2 text-white">Ver mis cuentas</button>
        </div>
      )}
    </div>
  );
}
