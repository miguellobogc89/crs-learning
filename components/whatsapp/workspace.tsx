"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Loader2 } from "lucide-react";
import { waApi, errorText, fieldClass } from "./api";
import { WhatsAppChat } from "./chat";
import { WhatsAppTemplates } from "./templates";
import { WhatsAppSettings } from "./settings";
import { WhatsAppContacts } from "./contacts";
import type { Account, Configuration } from "@/lib/whatsapp/types";
export function WhatsAppWorkspace({ tab }: { tab: string }) {
  const [accounts, setAccounts] = useState<Account[]>([]),
    [config, setConfig] = useState<Configuration | null>(null);
  const [selected, setSelected] = useState(""),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true);
  const apply = useCallback(
    (data: { items: Account[]; configuration: Configuration }) => {
      setAccounts(data.items);
      setConfig(data.configuration);
      setError("");
      setSelected((old) =>
        data.items.some((a) => a.id === old && a.status === "active")
          ? old
          : data.items.find((a) => a.status === "active")?.id || "",
      );
    },
    [],
  );
  async function refresh() {
    try {
      apply(
        await waApi<{ items: Account[]; configuration: Configuration }>(
          "accounts",
        ),
      );
    } catch (e) {
      setError(errorText(e));
    }
  }
  useEffect(() => {
    const c = new AbortController();
    void waApi<{ items: Account[]; configuration: Configuration }>(
      "accounts",
      undefined,
      c.signal,
    )
      .then(apply)
      .catch((e) => {
        if (!c.signal.aborted) setError(errorText(e));
      })
      .finally(() => {
        if (!c.signal.aborted) setLoading(false);
      });
    return () => c.abort();
  }, [apply]);
  const active = accounts.filter((a) => a.status === "active");
  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      {error && (
        <p
          role="alert"
          className="rounded-lg bg-red-50 p-3 text-sm text-red-700"
        >
          {error}{" "}
          <button onClick={refresh} className="underline">
            Reintentar
          </button>
        </p>
      )}
      {loading ? (
        <div
          role="status"
          className="flex items-center gap-2 py-10 text-sm text-slate-500"
        >
          <Loader2 className="h-4 w-4 animate-spin" />
          Cargando WhatsApp…
        </div>
      ) : (
        <>
          {tab !== "settings" && !selected && (
            <p className="flex shrink-0 flex-wrap items-center gap-x-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
              No hay ningún número de WhatsApp conectado: puedes ver la interfaz, pero no enviar ni sincronizar.
              <Link href="/whatsapp/settings" className="font-medium underline">
                Conectar en Números
              </Link>
            </p>
          )}
          {tab !== "settings" && selected && active.length === 1 && (
            <p className="shrink-0 text-xs text-slate-500">
              Enviando desde{" "}
              <span className="font-medium text-slate-700">
                {active[0].display_phone}
                {active[0].verified_name ? ` · ${active[0].verified_name}` : ""}
              </span>
            </p>
          )}
          {tab !== "settings" && selected && active.length > 1 && (
            <label className="flex shrink-0 items-center gap-3 text-sm text-slate-500">
              Número
              <select
                aria-label="Número de WhatsApp"
                className={fieldClass + " max-w-xs"}
                value={selected}
                onChange={(e) => setSelected(e.target.value)}
              >
                {active.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.display_phone}
                      {a.verified_name ? ` · ${a.verified_name}` : ""}
                    </option>
                  ))}
              </select>
            </label>
          )}
          {tab === "settings" ? (
            config ? (
              <WhatsAppSettings
                accounts={accounts}
                config={config}
                onRefresh={refresh}
              />
            ) : (
              <p className="text-sm text-slate-500">
                No se pudo cargar la configuración de WhatsApp.
              </p>
            )
          ) : tab === "contacts" ? (
            <WhatsAppContacts
              key={selected || "none"}
              accountId={selected}
              canManage={Boolean(config?.canManage)}
            />
          ) : tab === "chat" ? (
            <WhatsAppChat key={selected || "none"} accountId={selected} />
          ) : (
            <WhatsAppTemplates
              key={selected || "none"}
              accountId={selected}
              canManage={Boolean(config?.canManage)}
            />
          )}
        </>
      )}
    </div>
  );
}
