"use client";

import { createContext, useContext, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { saveEngineTableRecordAction, deleteEngineTableRecordsAction } from "@/app/(app)/engine/tables/actions";
import { engineFieldReadOnly, parseEngineEditorChanges, type EditableEngineField } from "@/lib/engine/record-editor";

type Row = { id: string; revision: number; values: Record<string, unknown> };
type EditorContext = {
  editing: boolean; selected: Set<string>; allSelected: boolean; pending: boolean;
  select: (id: string) => void; selectAll: () => void;
  edit: (id: string) => void; remove: (ids: string[]) => void;
};
const Context = createContext<EditorContext | null>(null);
export function EngineSelectionHeader() {
  const state = useContext(Context);
  return state?.editing ? <th className="w-10 px-4 py-3"><input type="checkbox" aria-label="Seleccionar todos los registros mostrados" checked={state.allSelected} disabled={state.pending} onChange={state.selectAll} /></th> : null;
}
export function EngineActionsHeader() {
  const state = useContext(Context);
  return state?.editing ? <th className="px-4 py-3">Acciones</th> : null;
}
export function EngineRowSelection({ id }: { id: string }) {
  const state = useContext(Context);
  return state?.editing ? <td className="px-4 py-3"><input type="checkbox" aria-label={`Seleccionar registro ${id}`} checked={state.selected.has(id)} disabled={state.pending} onChange={() => state.select(id)} /></td> : null;
}
export function EngineRowActions({ id }: { id: string }) {
  const state = useContext(Context);
  return state?.editing ? <td className="whitespace-nowrap px-4 py-3"><div className="flex gap-2">
    <Button size="sm" variant="outline" disabled={state.pending} onClick={() => state.edit(id)}>Editar</Button>
    <Button size="sm" variant="outline" className="text-red-700" disabled={state.pending} onClick={() => state.remove([id])}>Borrar</Button>
  </div></td> : null;
}

export function EngineTableEditor({ children, fields, records, enabled }: {
  children: React.ReactNode; fields: EditableEngineField[]; records: Row[]; enabled: boolean;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [active, setActive] = useState<Row | null>(null);
  const [deleting, setDeleting] = useState<string[]>([]);
  const [changes, setChanges] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  function close() { if (!pending) { setActive(null); setDeleting([]); setError(null); } }
  function save() {
    if (!active) return;
    const record = active;
    let values: Record<string, unknown>;
    try { values = parseEngineEditorChanges(record.values, changes, fields); }
    catch (error) { setError(error instanceof Error ? error.message : "Revisa los valores."); return; }
    startTransition(async () => {
      try {
        const result = await saveEngineTableRecordAction({ recordId: record.id, expectedRevision: record.revision, values });
        if (!result.ok) { setError(result.error); return; }
        setActive(null); setError(null); router.refresh();
      } catch { setError("No se ha podido guardar. Comprueba la conexión y vuelve a intentarlo."); }
    });
  }
  function remove() {
    const rows = records.filter(row => deleting.includes(row.id)).map(({ id, revision }) => ({ id, revision }));
    startTransition(async () => {
      try {
        const result = await deleteEngineTableRecordsAction(rows);
        if (!result.ok) { setError(result.error); return; }
        setDeleting([]); setSelected(new Set()); setError(null); router.refresh();
      } catch { setError("No se han podido borrar los registros. Vuelve a intentarlo."); }
    });
  }
  const state: EditorContext = {
    editing: enabled && editing, pending, selected,
    allSelected: records.length > 0 && records.every(row => selected.has(row.id)),
    select: id => setSelected(previous => { const next = new Set(previous); if (next.has(id)) next.delete(id); else next.add(id); return next; }),
    selectAll: () => setSelected(records.every(row => selected.has(row.id)) ? new Set() : new Set(records.map(row => row.id))),
    edit: id => { setActive(records.find(row => row.id === id) ?? null); setChanges({}); setError(null); },
    remove: ids => { setDeleting(ids); setError(null); },
  };
  return <Context.Provider value={state}>
    {enabled ? <div className="mb-3 flex flex-wrap items-center justify-end gap-3">
      {editing && selected.size > 0 ? <Button variant="destructive" disabled={pending} onClick={() => state.remove([...selected])}>Borrar seleccionados ({selected.size})</Button> : null}
      <Button variant="outline" disabled={pending} onClick={() => { setEditing(!editing); setSelected(new Set()); }}>{editing ? "Terminar edición" : "Editar tabla"}</Button>
    </div> : null}
    {children}
    <Dialog open={active !== null || deleting.length > 0} onOpenChange={open => { if (!open) close(); }}>
      <DialogContent className="max-h-[85vh] overflow-y-auto" showCloseButton={!pending}>
        <DialogHeader><DialogTitle>{active ? "Editar registro" : `Borrar ${deleting.length} ${deleting.length === 1 ? "registro" : "registros"}`}</DialogTitle>
          <DialogDescription>{active ? "Los cambios se guardarán en este workspace al pulsar Guardar." : "Los registros dejarán de estar disponibles y sus relaciones no se mostrarán. Se conservará su historial. Los documentos originales de Knowledge se mantienen."}</DialogDescription>
        </DialogHeader>
        {active ? <form onSubmit={event => { event.preventDefault(); save(); }} className="space-y-4">
          {fields.map(field => {
            const raw = active.values[field.key];
            const value = changes[field.key] ?? (raw == null ? "" : typeof raw === "object" ? JSON.stringify(raw, null, 2) : String(raw));
            const disabled = pending || engineFieldReadOnly(field);
            const config = field.configuration && typeof field.configuration === "object" ? field.configuration as { options?: unknown } : {};
            const options = Array.isArray(config.options) ? config.options.filter((option): option is string => typeof option === "string") : [];
            const common = { id: `engine-field-${field.key}`, value, disabled, required: field.is_required,
              className: "mt-1 w-full rounded-md border bg-background p-2 text-sm disabled:opacity-60",
              onChange: (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setChanges(previous => ({ ...previous, [field.key]: event.target.value })) };
            return <div key={field.key}><label htmlFor={common.id} className="text-sm font-medium">{field.name}{field.is_required ? " *" : ""}{engineFieldReadOnly(field) ? " · Solo lectura" : ""}</label>
              {field.field_type === "boolean" ? <select {...common}><option value="">Sin valor</option><option value="true">Sí</option><option value="false">No</option></select>
                : field.field_type === "enum" && options.length ? <select {...common}><option value="">Sin valor</option>{options.map(option => <option key={option} value={option}>{option}</option>)}</select>
                : ["long_text", "json"].includes(field.field_type) ? <textarea {...common} rows={4} />
                : <input {...common} type={field.field_type === "date" ? "date" : "text"} inputMode={["integer", "decimal"].includes(field.field_type) ? "decimal" : undefined} />}
            </div>;
          })}
          {error ? <p role="alert" className="text-sm text-red-700">{error}</p> : null}
          <div className="flex justify-end gap-2"><Button type="button" variant="outline" disabled={pending} onClick={close}>Cancelar</Button><Button type="submit" disabled={pending || !Object.keys(changes).length}>{pending ? "Guardando…" : "Guardar"}</Button></div>
        </form> : <>
          {error ? <p role="alert" className="text-sm text-red-700">{error}</p> : null}
          <div className="flex justify-end gap-2"><Button variant="outline" disabled={pending} onClick={close}>Cancelar</Button><Button variant="destructive" disabled={pending} onClick={remove}>{pending ? "Borrando…" : "Confirmar borrado"}</Button></div>
        </>}
      </DialogContent>
    </Dialog>
  </Context.Provider>;
}
