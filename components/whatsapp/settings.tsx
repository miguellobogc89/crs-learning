"use client";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Plus, Unplug, Copy, Loader2 } from "lucide-react";
import { waApi, buttonClass, errorText } from "./api";
import { loadMeta, signup } from "./meta-signup";
import type { Account, Configuration } from "@/lib/whatsapp/types";
const subscribe = () => () => {};
export function WhatsAppSettings({
  accounts,
  config,
  onRefresh,
}: {
  accounts: Account[];
  config: Configuration;
  onRefresh: () => Promise<void>;
}) {
  const [ready, setReady] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [confirm, setConfirm] = useState(""),
    [copied, setCopied] = useState(false);
  const url = useSyncExternalStore(
    subscribe,
    () => window.location.origin + config.webhookPath,
    () => config.webhookPath,
  );
  const cleanup = useRef<(() => void) | null>(null);
  useEffect(() => {
    if (!config.ready || !config.canManage) return;
    let active = true;
    void loadMeta(config)
      .then(() => {
        if (active) setReady(true);
      })
      .catch((e) => {
        if (active) setError(errorText(e));
      });
    return () => {
      active = false;
      cleanup.current?.();
    };
  }, [config]);
  function connect() {
    setError("");
    setBusy(true);
    const flow = signup(config);
    cleanup.current = flow.cancel;
    void flow.promise
      .then(onRefresh)
      .catch((e) => setError(errorText(e)))
      .finally(() => setBusy(false));
  }
  async function disconnect(accountId: string) {
    setBusy(true);
    setError("");
    try {
      await waApi("disconnect", { accountId });
      setConfirm("");
      await onRefresh();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="space-y-5 overflow-y-auto pb-4">
      {error && (
        <p
          role="alert"
          className="rounded-lg bg-red-50 p-3 text-sm text-red-700"
        >
          {error}
        </p>
      )}
      <section className="rounded-xl border border-slate-200 p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="font-semibold">Números de WhatsApp</h2>
            <p className="mt-1 text-sm text-slate-500">
              Conexiones de este espacio de trabajo.
            </p>
          </div>
          {config.canManage && (
            <button
              className={buttonClass}
              disabled={!ready || busy}
              onClick={connect}
            >
              {busy ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Plus className="h-4 w-4" />
              )}
              Añadir número
            </button>
          )}
        </div>
        {!config.ready && (
          <p className="mt-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-800">
            La integración con Meta está pendiente de configurar en el servidor.
          </p>
        )}
        {!config.canManage && (
          <p className="mt-4 text-sm text-slate-500">
            La conexión la gestiona el propietario o un administrador.
          </p>
        )}
        <div className="mt-5 divide-y divide-slate-100">
          {accounts.length ? (
            accounts.map((a) => (
              <div
                key={a.id}
                className="flex flex-wrap items-center justify-between gap-3 py-4"
              >
                <div>
                  <p className="text-sm font-medium">{a.display_phone}</p>
                  <p className="text-xs text-slate-500">{a.verified_name}</p>
                </div>
                <span
                  className={`rounded-full px-2 py-1 text-xs ${a.status === "active" ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"}`}
                >
                  {a.status === "active" ? "Conectado" : "Desconectado"}
                </span>
                {config.canManage &&
                  a.status === "active" &&
                  (confirm === a.id ? (
                    <div className="flex items-center gap-3 text-xs">
                      <span>¿Desconectar?</span>
                      <button
                        disabled={busy}
                        onClick={() => disconnect(a.id)}
                        className="text-red-600"
                      >
                        Confirmar
                      </button>
                      <button disabled={busy} onClick={() => setConfirm("")}>
                        Cancelar
                      </button>
                    </div>
                  ) : (
                    <button
                      disabled={busy}
                      onClick={() => setConfirm(a.id)}
                      className="flex items-center gap-1 text-xs text-slate-500"
                    >
                      <Unplug className="h-4 w-4" />
                      Desconectar
                    </button>
                  ))}
              </div>
            ))
          ) : (
            <p className="py-5 text-sm text-slate-500">
              No hay números conectados.
            </p>
          )}
        </div>
        <p className="mt-3 text-xs text-slate-400">
          Al desconectar se conserva el historial. Puedes retirar el acceso de
          la aplicación desde Meta.
        </p>
      </section>
      <section className="rounded-xl border border-slate-200 p-5">
        <h2 className="font-semibold">Recepción de mensajes</h2>
        <p className="mt-1 text-sm text-slate-500">
          Dirección del webhook que debe estar configurada en tu aplicación de
          Meta.
        </p>
        <div className="mt-3 flex items-center gap-2">
          <code className="min-w-0 flex-1 break-all rounded-lg bg-slate-50 p-3 text-xs">
            {url}
          </code>
          <button
            aria-label="Copiar dirección del webhook"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(url);
                setCopied(true);
              } catch {
                setError("No se pudo copiar la dirección");
              }
            }}
            className="p-2"
          >
            <Copy className="h-4 w-4" />
          </button>
        </div>
        {copied && (
          <p role="status" className="mt-2 text-xs text-emerald-700">
            Dirección copiada
          </p>
        )}
        <p className="mt-3 text-xs text-slate-500">
          {config.webhookReady
            ? "Credenciales del webhook configuradas. La entrega debe comprobarse con un mensaje real."
            : "Faltan las credenciales del webhook en el servidor."}
        </p>
      </section>
    </div>
  );
}
