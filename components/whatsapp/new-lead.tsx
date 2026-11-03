"use client";
import { useState } from "react";
import { Loader2 } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { waApi, buttonClass, errorText, fieldClass } from "./api";

type Form = { name: string; phone: string; email: string; category: string; specialty: string; city: string; notes: string; consent: boolean };
const EMPTY: Form = { name: "", phone: "", email: "", category: "", specialty: "", city: "", notes: "", consent: false };

/** «Nuevo lead»: only the name is required; with a phone it can be written to on WhatsApp straight away. */
export function NewLeadDialog({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: (id: string) => void }) {
  const [form, setForm] = useState<Form>(EMPTY);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm(f => ({ ...f, [k]: v }));
  function close() { if (busy) return; setForm(EMPTY); setError(""); onClose(); }
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) { setError("Escribe el nombre"); return; }
    setBusy(true); setError("");
    try {
      const r = await waApi<{ id: string }>("contacts/create", form);
      setForm(EMPTY);
      onCreated(r.id);
    } catch (err) { setError(errorText(err)); }
    finally { setBusy(false); }
  }
  const field = (k: "category" | "specialty" | "city" | "email", label: string, placeholder?: string) =>
    <label className="text-xs text-slate-500">{label}
      <input className={fieldClass + " mt-1"} value={form[k]} placeholder={placeholder} type={k === "email" ? "email" : "text"} onChange={e => set(k, e.target.value)} />
    </label>;
  return <Dialog open={open} onOpenChange={o => { if (!o) close(); }}>
    <DialogContent className="sm:max-w-lg">
      <DialogHeader>
        <DialogTitle>Nuevo lead</DialogTitle>
        <DialogDescription>Solo el nombre es obligatorio. Con teléfono podrás escribirle por WhatsApp desde Leads.</DialogDescription>
      </DialogHeader>
      <form onSubmit={submit} className="space-y-3">
        <label className="block text-xs text-slate-500">Nombre o empresa *
          <input autoFocus className={fieldClass + " mt-1"} value={form.name} onChange={e => { set("name", e.target.value); setError(""); }} placeholder="Discomóvil Deep" />
        </label>
        <label className="block text-xs text-slate-500">Teléfono de WhatsApp
          <input className={fieldClass + " mt-1"} value={form.phone} inputMode="tel" onChange={e => set("phone", e.target.value)} placeholder="+34 600 000 000" />
          <span className="mt-1 block text-[11px] text-slate-400">Con prefijo internacional; 9 cifras se entienden como número español.</span>
        </label>
        <div className="grid gap-3 sm:grid-cols-2">
          {field("email", "Email", "nombre@empresa.com")}
          {field("city", "Localidad", "Barcelona")}
          {field("category", "Categoría", "Música en directo y DJ")}
          {field("specialty", "Especialidad", "DJ y discomóviles")}
        </div>
        <label className="block text-xs text-slate-500">Notas
          <textarea className={fieldClass + " mt-1 resize-none"} rows={2} value={form.notes} onChange={e => set("notes", e.target.value)} />
        </label>
        <label className="flex items-start gap-2 text-sm text-slate-700">
          <input type="checkbox" className="mt-0.5 size-4 accent-blue-600" checked={form.consent} onChange={e => set("consent", e.target.checked)} />
          <span>Ha dado permiso para recibir WhatsApp<span className="block text-xs text-slate-400">Por ejemplo, si eres tú mismo para hacer pruebas.</span></span>
        </label>
        {error && <p role="alert" className="rounded-lg bg-red-50 p-2.5 text-sm text-red-700">{error}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" onClick={close} disabled={busy} className="rounded-lg px-4 py-2 text-sm text-slate-600 hover:bg-slate-100">Cancelar</button>
          <button type="submit" disabled={busy} className={buttonClass}>{busy && <Loader2 className="h-4 w-4 animate-spin" />}Crear lead</button>
        </div>
      </form>
    </DialogContent>
  </Dialog>;
}
