"use client";
import { useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, FileUp, Loader2 } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { waApi, buttonClass, errorText, fieldClass } from "./api";
import {
  CONTACT_FIELDS,
  detectMapping,
  parseCsv,
  planImport,
  type ContactFieldKey,
  type Mapping,
} from "@/lib/whatsapp/contacts";

type Result = {
  total: number;
  created: number;
  updated: number;
  merged: number;
  skipped: { row: number; reason: string }[];
  withWhatsapp: number;
  sharedPhones: { phone: string; names: string[] }[];
};
const IMPORTANT: ContactFieldKey[] = ["name", "whatsapp", "mobile", "category", "specialty", "city", "classification", "consent", "do_not_contact", "stage"];

export function ContactImport({
  open,
  onClose,
  onImported,
}: {
  open: boolean;
  onClose: () => void;
  onImported: () => void;
}) {
  const [file, setFile] = useState<{ name: string; text: string } | null>(null);
  const [mapping, setMapping] = useState<Mapping>({});
  const [showAll, setShowAll] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<Result | null>(null);

  const parsed = useMemo(() => (file ? parseCsv(file.text) : null), [file]);
  const plan = useMemo(() => {
    if (!parsed) return null;
    try {
      return planImport(parsed.headers, parsed.rows, mapping);
    } catch (e) {
      return { error: errorText(e) } as const;
    }
  }, [parsed, mapping]);

  function reset() {
    setFile(null);
    setMapping({});
    setResult(null);
    setError("");
    setShowAll(false);
  }
  async function pick(f: File | undefined) {
    if (!f) return;
    setError("");
    if (f.size > 4_000_000) return setError("El archivo supera 4 MB. Divídelo en partes.");
    const text = await f.text();
    const p = parseCsv(text);
    if (!p.headers.length || !p.rows.length) return setError("No se encontraron filas en el archivo.");
    setFile({ name: f.name, text });
    setMapping(detectMapping(p.headers));
  }
  async function submit() {
    if (!file) return;
    setBusy(true);
    setError("");
    try {
      const r = await waApi<Result>("contacts/import", { fileName: file.name, csv: file.text, mapping });
      setResult(r);
      onImported();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }

  const fields = showAll ? CONTACT_FIELDS : CONTACT_FIELDS.filter((f) => IMPORTANT.includes(f.key));
  const ok = plan && !("error" in plan) ? plan : null;

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o && !busy) {
          reset();
          onClose();
        }
      }}
    >
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Importar contactos desde CSV</DialogTitle>
          <DialogDescription>
            Si un contacto ya existe (misma ficha de Google Maps o mismo teléfono) se actualiza sin perder el seguimiento ni las marcas de «No contactar».
          </DialogDescription>
        </DialogHeader>

        {result ? (
          <div className="space-y-3 text-sm">
            <p className="flex items-center gap-2 font-medium text-emerald-700">
              <CheckCircle2 className="h-5 w-5" /> Importación completada
            </p>
            <ul className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <Stat label="Filas leídas" value={result.total} />
              <Stat label="Nuevos" value={result.created} />
              <Stat label="Actualizados" value={result.updated} />
              <Stat label="Con WhatsApp" value={result.withWhatsapp} />
            </ul>
            <Warnings merged={result.merged} skipped={result.skipped} shared={result.sharedPhones} />
            <div className="flex justify-end">
              <button
                className={buttonClass}
                onClick={() => {
                  reset();
                  onClose();
                }}
              >
                Ver contactos
              </button>
            </div>
          </div>
        ) : !file ? (
          <label className="grid cursor-pointer place-items-center gap-2 rounded-xl border-2 border-dashed border-slate-200 p-10 text-center text-sm text-slate-500 hover:border-blue-300 hover:bg-blue-50/40">
            <FileUp className="h-8 w-8 text-blue-500" />
            <span className="font-medium text-slate-700">Elige el archivo CSV</span>
            <span className="text-xs">Separado por comas o punto y coma, con una fila de cabecera.</span>
            <input type="file" accept=".csv,text/csv" className="sr-only" onChange={(e) => void pick(e.target.files?.[0])} />
          </label>
        ) : (
          <div className="space-y-4 text-sm">
            <p className="text-slate-600">
              <span className="font-medium text-slate-800">{file.name}</span> · {parsed?.rows.length} filas · {parsed?.headers.length} columnas{" "}
              <button className="ml-2 text-xs text-blue-600" onClick={reset}>
                Cambiar archivo
              </button>
            </p>
            <div>
              <div className="mb-2 flex items-center justify-between">
                <h4 className="font-medium text-slate-800">Columnas</h4>
                <button className="text-xs text-blue-600" onClick={() => setShowAll((s) => !s)}>
                  {showAll ? "Ver solo las principales" : "Ver todas"}
                </button>
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                {fields.map((f) => (
                  <label key={f.key} className="flex items-center gap-2 text-xs text-slate-500">
                    <span className="w-36 shrink-0">
                      {f.label}
                      {f.key === "name" && " *"}
                    </span>
                    <select
                      className={fieldClass + " py-1.5"}
                      value={mapping[f.key] || ""}
                      onChange={(e) => setMapping((m) => ({ ...m, [f.key]: e.target.value || undefined }))}
                    >
                      <option value="">— No usar —</option>
                      {parsed?.headers.map((h) => (
                        <option key={h} value={h}>
                          {h}
                        </option>
                      ))}
                    </select>
                  </label>
                ))}
              </div>
              <p className="mt-2 text-xs text-slate-400">
                El teléfono de WhatsApp se toma de «WhatsApp» y, si está vacío, del móvil. Todas las columnas del archivo se guardan en la ficha y pueden usarse como variables de las plantillas.
              </p>
            </div>

            {plan && "error" in plan && <p className="rounded-lg bg-amber-50 p-3 text-amber-800">{plan.error}</p>}
            {ok && (
              <>
                <ul className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  <Stat label="Contactos" value={ok.contacts.length} />
                  <Stat label="Con WhatsApp" value={ok.withWhatsapp} />
                  <Stat label="Sin WhatsApp" value={ok.contacts.length - ok.withWhatsapp} />
                  <Stat label="Con autorización" value={ok.contacts.filter((c) => c.consent).length} />
                </ul>
                <Warnings merged={ok.merged} skipped={ok.skipped} shared={ok.sharedPhones} />
                <div className="overflow-x-auto rounded-lg border border-slate-200">
                  <table className="w-full text-xs">
                    <thead className="bg-slate-50 text-left text-slate-500">
                      <tr>
                        <th className="px-2 py-1.5 font-medium">Empresa</th>
                        <th className="px-2 py-1.5 font-medium">Especialidad</th>
                        <th className="px-2 py-1.5 font-medium">Localidad</th>
                        <th className="px-2 py-1.5 font-medium">WhatsApp</th>
                        <th className="px-2 py-1.5 font-medium">Clasificación</th>
                      </tr>
                    </thead>
                    <tbody>
                      {ok.contacts.slice(0, 5).map((c) => (
                        <tr key={c.external_key} className="border-t border-slate-100">
                          <td className="max-w-56 truncate px-2 py-1.5">{c.name}</td>
                          <td className="px-2 py-1.5">{c.specialty || "—"}</td>
                          <td className="px-2 py-1.5">{c.city || "—"}</td>
                          <td className="px-2 py-1.5">{c.phone ? `+${c.phone}` : <span className="text-slate-400">—</span>}</td>
                          <td className="px-2 py-1.5">{c.classification || "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
            {error && (
              <p role="alert" className="rounded-lg bg-red-50 p-3 text-red-700">
                {error}
              </p>
            )}
            <div className="flex justify-end gap-2">
              <button className="rounded-lg px-4 py-2 text-slate-600 hover:bg-slate-100" disabled={busy} onClick={() => { reset(); onClose(); }}>
                Cancelar
              </button>
              <button className={buttonClass} disabled={busy || !ok || !ok.contacts.length} onClick={submit}>
                {busy && <Loader2 className="h-4 w-4 animate-spin" />}
                Importar {ok ? ok.contacts.length : ""} contactos
              </button>
            </div>
          </div>
        )}
        {!file && error && (
          <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">
            {error}
          </p>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <li className="rounded-lg bg-slate-50 px-3 py-2">
      <p className="text-lg font-semibold text-slate-800">{value}</p>
      <p className="text-xs text-slate-500">{label}</p>
    </li>
  );
}

function Warnings({
  merged,
  skipped,
  shared,
}: {
  merged: number;
  skipped: { row: number; reason: string }[];
  shared: { phone: string; names: string[] }[];
}) {
  if (!merged && !skipped.length && !shared.length) return null;
  return (
    <div className="space-y-1 rounded-lg bg-amber-50 p-3 text-xs text-amber-900">
      <p className="flex items-center gap-1.5 font-medium">
        <AlertTriangle className="h-4 w-4" /> A revisar
      </p>
      {merged > 0 && <p>{merged} filas repetidas en el archivo se han unido en un solo contacto.</p>}
      {skipped.length > 0 && (
        <p>
          {skipped.length} filas sin nombre de empresa no se importan (filas {skipped.slice(0, 8).map((s) => s.row).join(", ")}
          {skipped.length > 8 ? "…" : ""}).
        </p>
      )}
      {shared.slice(0, 5).map((s) => (
        <p key={s.phone}>
          +{s.phone} lo comparten {s.names.join(" y ")}: tendrán la misma conversación de WhatsApp.
        </p>
      ))}
      {shared.length > 5 && <p>…y {shared.length - 5} teléfonos compartidos más.</p>}
    </div>
  );
}
