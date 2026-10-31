"use client";
import { useCallback, useEffect, useState } from "react";
import { Ban, Check, ChevronDown, ExternalLink, Globe, Loader2, Mail, MapPin, ShieldCheck, Star, X } from "lucide-react";
import { waApi, errorText, fieldClass } from "./api";
import { ChatThread } from "./chat";
import { classificationTone, shortDate, stageTone } from "./contacts";
import { STAGES } from "@/lib/whatsapp/contacts";
import type { ContactDetail, Conversation } from "@/lib/whatsapp/types";

type Detail = {
  item: ContactDetail;
  conversation: Conversation | null;
  sharedWith: { id: string; name: string }[];
  sends: { campaign_id: string; template_name: string; status: string; reason: string | null; error: string | null; updated_at: string }[];
};
const SEND_STATUS: Record<string, string> = {
  pending: "Pendiente",
  sending: "Enviando",
  sent: "Enviada",
  failed: "Error",
  unknown: "Sin confirmar",
  skipped: "No enviada",
};

export function ContactPanel({
  contactId,
  accountId,
  onClose,
  onChanged,
}: {
  contactId: string;
  accountId: string;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [data, setData] = useState<Detail | null>(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [showData, setShowData] = useState(false);
  const [notes, setNotes] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const load = useCallback(
    async (signal?: AbortSignal) => {
      try {
        const d = await waApi<Detail>(`contacts/one?id=${contactId}${accountId ? `&accountId=${accountId}` : ""}`, undefined, signal);
        setData(d);
        setNotes((n) => (n === null ? d.item.notes || "" : n));
      } catch (e) {
        if (!signal?.aborted) setError(errorText(e));
      }
    },
    [contactId, accountId],
  );
  useEffect(() => {
    const c = new AbortController();
    void load(c.signal);
    return () => c.abort();
  }, [load]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function update(patch: Record<string, unknown>) {
    setSaving(true);
    setError("");
    try {
      await waApi("contacts/update", { id: contactId, ...patch });
      await load();
      onChanged();
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setSaving(false);
    }
  }

  const c = data?.item;
  return (
    <aside
      aria-label="Ficha del contacto"
      className="fixed bottom-0 right-0 top-[68px] z-40 flex w-full flex-col border-l border-t border-slate-200 bg-white shadow-2xl sm:w-[520px] sm:rounded-tl-xl"
    >
      <header className="flex shrink-0 items-start gap-3 border-b border-slate-100 px-5 py-4">
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-base font-semibold text-slate-900">{c?.name || "Cargando…"}</h3>
          {c && (
            <p className="truncate text-xs text-slate-500">
              {[c.specialty, c.category].filter(Boolean).join(" · ")}
            </p>
          )}
        </div>
        <button aria-label="Cerrar ficha" onClick={onClose} className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700">
          <X className="h-5 w-5" />
        </button>
      </header>

      {!c ? (
        <div className="grid flex-1 place-content-center text-sm text-slate-400">
          {error || <Loader2 className="h-5 w-5 animate-spin" />}
        </div>
      ) : (
        <>
          <div className="max-h-[48%] shrink-0 space-y-3 overflow-y-auto border-b border-slate-100 px-5 py-4 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <select
                aria-label="Seguimiento"
                className={`rounded-full border-0 py-1 pl-2.5 pr-7 text-xs font-medium ${stageTone[c.stage] || "bg-slate-100"}`}
                value={c.stage}
                disabled={saving}
                onChange={(e) => update({ stage: e.target.value })}
              >
                {[...new Set([c.stage, ...STAGES])].map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
              {c.classification && (
                <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${classificationTone(c.classification)}`}>{c.classification}</span>
              )}
              {c.rating !== null && (
                <span className="inline-flex items-center gap-1 text-xs text-slate-600">
                  <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" /> {c.rating.toFixed(1)}
                </span>
              )}
              {saving ? (
                <Loader2 className="h-4 w-4 animate-spin text-slate-400" />
              ) : (
                saved && (
                  <span role="status" className="inline-flex items-center gap-1 text-xs text-emerald-600">
                    <Check className="h-3.5 w-3.5" /> Guardado
                  </span>
                )
              )}
              <span className="ml-auto text-[11px] text-slate-400">Los cambios se guardan solos</span>
            </div>

            <dl className="grid grid-cols-[110px_1fr] gap-x-3 gap-y-1.5 text-xs">
              <dt className="text-slate-400">WhatsApp</dt>
              <dd className="text-slate-700">{c.phone ? `+${c.phone}` : "Sin teléfono de WhatsApp"}</dd>
              <dt className="text-slate-400">Localidad</dt>
              <dd className="text-slate-700">{[c.city, c.province].filter(Boolean).join(", ") || "—"}</dd>
              {c.email && (
                <>
                  <dt className="text-slate-400">Email</dt>
                  <dd>
                    <a className="inline-flex items-center gap-1 text-blue-600" href={`mailto:${c.email}`}>
                      <Mail className="h-3 w-3" /> {c.email}
                    </a>
                  </dd>
                </>
              )}
              <dt className="text-slate-400">Enlaces</dt>
              <dd className="flex flex-wrap gap-3">
                {c.website && (
                  <a className="inline-flex items-center gap-1 text-blue-600" href={c.website} target="_blank" rel="noreferrer">
                    <Globe className="h-3 w-3" /> Web
                  </a>
                )}
                {c.maps_url && (
                  <a className="inline-flex items-center gap-1 text-blue-600" href={c.maps_url} target="_blank" rel="noreferrer">
                    <MapPin className="h-3 w-3" /> Google Maps
                  </a>
                )}
                {!c.website && !c.maps_url && <span className="text-slate-400">—</span>}
              </dd>
              <dt className="text-slate-400">Autorización</dt>
              <dd className="text-slate-700">
                {c.consent ? (
                  <span className="inline-flex items-center gap-1 text-emerald-700">
                    <ShieldCheck className="h-3.5 w-3.5" /> Sí{c.consent_source ? ` · ${c.consent_source}` : ""}
                    {c.consent_at ? ` · ${new Date(c.consent_at).toLocaleDateString("es-ES")}` : ""}
                  </span>
                ) : (
                  <span className="text-amber-700">No registrada</span>
                )}
              </dd>
            </dl>

            {data.sharedWith.length > 0 && (
              <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
                Este teléfono también es de {data.sharedWith.map((s) => s.name).join(", ")}. Comparten conversación.
              </p>
            )}

            <div className="flex flex-wrap gap-2">
              <button
                className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs ${c.do_not_contact ? "border-red-200 bg-red-50 text-red-700" : "border-slate-200 text-slate-600 hover:bg-slate-50"}`}
                disabled={saving}
                onClick={() => update({ do_not_contact: !c.do_not_contact })}
              >
                <Ban className="h-3.5 w-3.5" /> {c.do_not_contact ? "No contactar (quitar)" : "Marcar «No contactar»"}
              </button>
              <button
                className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs ${c.consent ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-slate-200 text-slate-600 hover:bg-slate-50"}`}
                disabled={saving}
                onClick={() => update({ consent: !c.consent })}
              >
                <ShieldCheck className="h-3.5 w-3.5" /> {c.consent ? "Autorización registrada (quitar)" : "Registrar autorización"}
              </button>
            </div>

            <label className="block text-xs text-slate-500">
              Notas
              <textarea
                className={fieldClass + " mt-1 resize-none text-xs"}
                rows={2}
                value={notes || ""}
                maxLength={5000}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Apuntes sobre este contacto…"
              />
            </label>
            {(notes || "") !== (c.notes || "") && (
              <div className="-mt-1 flex justify-end gap-2">
                <button className="rounded-lg px-3 py-1 text-xs text-slate-500 hover:bg-slate-100" disabled={saving} onClick={() => setNotes(c.notes || "")}>
                  Descartar
                </button>
                <button className="rounded-lg bg-blue-600 px-3 py-1 text-xs font-medium text-white hover:bg-blue-700" disabled={saving} onClick={() => update({ notes })}>
                  Guardar nota
                </button>
              </div>
            )}

            {data.sends.length > 0 && (
              <div className="text-xs">
                <p className="mb-1 font-medium text-slate-600">Plantillas enviadas</p>
                <ul className="space-y-0.5 text-slate-500">
                  {data.sends.map((s) => (
                    <li key={s.campaign_id}>
                      {shortDate(s.updated_at)} · {s.template_name} · {SEND_STATUS[s.status] || s.status}
                      {s.error ? ` (${s.error})` : ""}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <button className="inline-flex items-center gap-1 text-xs font-medium text-slate-500" onClick={() => setShowData((s) => !s)} aria-expanded={showData}>
              <ChevronDown className={`h-3.5 w-3.5 transition ${showData ? "rotate-180" : ""}`} /> Datos del archivo importado
            </button>
            {showData && (
              <dl className="grid grid-cols-[140px_1fr] gap-x-3 gap-y-1 rounded-lg bg-slate-50 p-3 text-xs">
                {Object.entries(c.attributes).map(([k, v]) => (
                  <div key={k} className="contents">
                    <dt className="text-slate-400">{k}</dt>
                    <dd className="break-words text-slate-700">
                      {/^https?:\/\//.test(v) ? (
                        <a href={v} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-blue-600">
                          Abrir <ExternalLink className="h-3 w-3" />
                        </a>
                      ) : (
                        v
                      )}
                    </dd>
                  </div>
                ))}
              </dl>
            )}
            {error && (
              <p role="alert" className="text-xs text-red-600">
                {error}
              </p>
            )}
          </div>

          <div className="flex min-h-0 flex-1 flex-col">
            {!accountId ? (
              <p className="m-auto max-w-xs text-center text-sm text-slate-400">Conecta un número en Configuración › Números para escribir a este contacto.</p>
            ) : !c.phone ? (
              <p className="m-auto max-w-xs text-center text-sm text-slate-400">Este contacto no tiene teléfono de WhatsApp.</p>
            ) : c.do_not_contact && !data.conversation ? (
              <p className="m-auto max-w-xs text-center text-sm text-slate-400">Marcado como «No contactar». Quita la marca para escribirle.</p>
            ) : (
              <ChatThread
                key={data.conversation?.id || "new"}
                accountId={accountId}
                conversation={data.conversation}
                to={c.phone}
                onTo={() => {}}
                onBack={() => void load()}
                onSent={() => {
                  void load();
                  onChanged();
                }}
                embedded
              />
            )}
          </div>
        </>
      )}
    </aside>
  );
}
