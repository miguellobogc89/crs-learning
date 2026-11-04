"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Plus, RefreshCw, Star } from "lucide-react";
import { waApi, buttonClass, errorText, fieldClass } from "./api";
import { templateBody } from "./template-utils";
import { TemplateEditor } from "./template-editor";
import type { Template } from "@/lib/whatsapp/types";
export function WhatsAppTemplates({
  accountId,
  canManage,
}: {
  accountId: string;
  canManage: boolean;
}) {
  const [items, setItems] = useState<Template[]>([]),
    [selected, setSelected] = useState(""),
    [query, setQuery] = useState("");
  const [status, setStatus] = useState(""),
    [category, setCategory] = useState(""),
    [language, setLanguage] = useState(""),
    [favorites, setFavorites] = useState(false);
  const [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [creating, setCreating] = useState(false),
    [error, setError] = useState("");
  const apply = useCallback((data: { items: Template[] }) => {
    setItems(data.items);
    setSelected((old) =>
      data.items.some((t) => t.id === old) ? old : data.items[0]?.id || "",
    );
  }, []);
  async function refresh() {
    apply(
      await waApi<{ items: Template[] }>(`templates?accountId=${accountId}`),
    );
  }
  useEffect(() => {
    if (!accountId) {
      const t = setTimeout(() => setLoading(false), 0);
      return () => clearTimeout(t);
    }
    const c = new AbortController();
    void waApi<{ items: Template[] }>(
      `templates?accountId=${accountId}`,
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
  }, [accountId, apply]);
  async function sync() {
    setBusy(true);
    setError("");
    try {
      await waApi("templates/sync", { accountId });
      await refresh();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }
  async function favorite(t: Template) {
    setBusy(true);
    setError("");
    try {
      await waApi("templates/favorite", {
        templateId: t.id,
        favorite: !t.is_favorite,
      });
      await refresh();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }
  const filtered = useMemo(
    () =>
      items.filter(
        (t) =>
          t.name.toLowerCase().includes(query.toLowerCase()) &&
          (!status || t.status === status) &&
          (!category || t.category === category) &&
          (!language || t.language === language) &&
          (!favorites || t.is_favorite),
      ),
    [items, query, status, category, language, favorites],
  );
  const active = filtered.find((t) => t.id === selected) || filtered[0];
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-slate-500">
          {items.length} plantillas ·{" "}
          {items.filter((t) => t.status === "APPROVED").length} aprobadas
        </p>
        {canManage && (
          <div className="flex gap-2">
            <button
              onClick={sync}
              disabled={busy || !accountId}
              className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm disabled:opacity-50"
            >
              <RefreshCw className={`h-4 w-4 ${busy ? "animate-spin" : ""}`} />
              Sincronizar con Meta
            </button>
            <button
              onClick={() => setCreating(true)}
              disabled={busy || !accountId}
              className={buttonClass}
            >
              <Plus className="h-4 w-4" />
              Nueva plantilla
            </button>
          </div>
        )}
      </div>
      {error && (
        <p
          role="alert"
          className="rounded-lg bg-red-50 p-3 text-sm text-red-700"
        >
          {error}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <input
          aria-label="Buscar plantilla"
          placeholder="Buscar plantilla…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className={fieldClass + " min-w-40 flex-1"}
        />
        <select
          aria-label="Estado"
          className={fieldClass + " !w-auto"}
          value={status}
          onChange={(e) => setStatus(e.target.value)}
        >
          <option value="">Todos los estados</option>
          {[...new Set(items.map((t) => t.status))].sort().map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
        <select
          aria-label="Categoría"
          className={fieldClass + " !w-auto"}
          value={category}
          onChange={(e) => setCategory(e.target.value)}
        >
          <option value="">Todas las categorías</option>
          {[...new Set(items.map((t) => t.category))].sort().map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
        <select
          aria-label="Idioma"
          className={fieldClass + " !w-auto"}
          value={language}
          onChange={(e) => setLanguage(e.target.value)}
        >
          <option value="">Todos los idiomas</option>
          {[...new Set(items.map((t) => t.language))].sort().map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
        <button
          aria-pressed={favorites}
          onClick={() => setFavorites((v) => !v)}
          className={`rounded-lg border px-3 ${favorites ? "border-amber-300 bg-amber-50 text-amber-600" : "border-slate-200 text-slate-400"}`}
          title="Solo favoritas"
        >
          <Star className="h-4 w-4" />
        </button>
      </div>
      <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 overflow-y-auto md:grid-cols-[minmax(220px,1fr)_minmax(250px,1fr)]">
        <div className="min-h-0 overflow-y-auto rounded-xl border border-slate-200">
          {loading ? (
            <p role="status" className="p-5 text-sm text-slate-400">
              Cargando plantillas…
            </p>
          ) : !filtered.length ? (
            <p className="p-5 text-sm text-slate-400">
              {items.length
                ? "No hay plantillas con estos filtros."
                : "Sin plantillas. Sincroniza con Meta o crea la primera."}
            </p>
          ) : (
            filtered.map((t) => (
              <div
                key={t.id}
                className={`flex border-b border-slate-100 ${active?.id === t.id ? "bg-blue-50/70" : ""}`}
              >
                <button
                  onClick={() => setSelected(t.id)}
                  className="min-w-0 flex-1 p-4 text-left"
                >
                  <span className="block truncate text-sm font-medium">
                    {t.name}
                  </span>
                  <span className="mt-1 block text-xs text-slate-500">
                    {t.language} · {t.category} · {t.status}
                  </span>
                  <span className="mt-2 block truncate text-xs text-slate-400">
                    {templateBody(t)}
                  </span>
                </button>
                <button
                  aria-label={
                    t.is_favorite ? "Quitar de favoritas" : "Añadir a favoritas"
                  }
                  disabled={busy}
                  onClick={() => favorite(t)}
                  className="self-start p-4"
                >
                  <Star
                    className={`h-4 w-4 ${t.is_favorite ? "fill-amber-400 text-amber-400" : "text-slate-300"}`}
                  />
                </button>
              </div>
            ))
          )}
        </div>
        {active && (
          <section className="min-h-0 overflow-y-auto rounded-xl border border-slate-200 p-5">
            <h2 className="text-sm font-semibold">Vista previa</h2>
            <p className="mt-1 break-all text-xs text-slate-400">
              {active.name} · {active.language}
            </p>
            <div className="mt-5 rounded-xl bg-slate-50 p-4">
              <div className="space-y-2 rounded-xl bg-white p-4 shadow-sm">
                {active.components.map((c, i) => (
                  <div key={i}>
                    {c.text ? (
                      <p
                        className={`whitespace-pre-wrap break-words ${c.type === "FOOTER" ? "text-xs text-slate-400" : "text-sm text-slate-700"}`}
                      >
                        {c.text}
                      </p>
                    ) : c.type === "HEADER" ? (
                      <p className="rounded bg-slate-100 p-4 text-center text-xs text-slate-400">
                        {c.format || "Cabecera"}
                      </p>
                    ) : c.type === "BUTTONS" ? (
                      <p className="border-t pt-2 text-center text-xs text-blue-500">
                        {c.buttons?.length || 0} botones
                      </p>
                    ) : null}
                  </div>
                ))}
              </div>
            </div>
            <p className="mt-4 text-xs text-slate-500">
              Estado en Meta: <strong>{active.status}</strong>
            </p>
            <p className="mt-2 text-xs text-slate-400">
              Sincroniza para actualizar la aprobación y los cambios realizados
              en Meta.
            </p>
          </section>
        )}
      </div>
      {creating && (
        <TemplateEditor
          accountId={accountId}
          onClose={() => setCreating(false)}
          onCreated={async () => {
            setCreating(false);
            await refresh();
          }}
        />
      )}
    </div>
  );
}
