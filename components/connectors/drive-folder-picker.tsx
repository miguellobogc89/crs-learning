"use client";
import { useEffect, useState } from "react";
import { ChevronRight, Folder, FolderOpen, Loader2, Search, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

type DriveFolder = { id: string; name: string; shared: boolean };
type Crumb = { id: string; name: string };
const ROOTS: Crumb[] = [{ id: "root", name: "Mi unidad" }, { id: "shared", name: "Compartido conmigo" }];

/** Browse Drive folders and choose one. Choosing does not import anything. */
export function DriveFolderPicker({ open, onOpenChange, onChosen }: {
  open: boolean; onOpenChange: (open: boolean) => void; onChosen: (result: { folder: { id: string; name: string }; documents: { importable: number; other: number; capped: boolean } }) => void;
}) {
  const [path, setPath] = useState<Crumb[]>([ROOTS[0]]);
  const [folders, setFolders] = useState<DriveFolder[]>([]);
  const [more, setMore] = useState(false);
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const current = path[path.length - 1];

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true); setError(null);
    fetch(`/api/connectors/google-drive/folders?${new URLSearchParams({ parent: current.id, ...(search ? { q: search } : {}) })}`)
      .then(async r => { const json = await r.json(); if (!r.ok) throw new Error(json.error ?? "No se pudieron leer las carpetas"); return json; })
      .then(json => { if (!cancelled) { setFolders(json.folders); setMore(json.more); } })
      .catch(e => { if (!cancelled) { setFolders([]); setError(e instanceof Error ? e.message : String(e)); } })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [open, current.id, search]);

  const go = (next: Crumb[]) => { setPath(next); setQuery(""); setSearch(""); };
  async function choose() {
    setSaving(true); setError(null);
    try {
      const r = await fetch("/api/connectors/google-drive/folder", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: current.id }) });
      const json = await r.json();
      if (!r.ok) throw new Error(json.error ?? "No se pudo guardar la carpeta");
      onChosen(json); onOpenChange(false);
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); } finally { setSaving(false); }
  }

  return <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="flex max-h-[85vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-xl">
      <div className="border-b border-slate-200 px-5 py-4">
        <DialogTitle className="text-base font-semibold text-slate-900">Elegir carpeta de Drive</DialogTitle>
        <DialogDescription className="mt-0.5 text-xs text-slate-500">Se leerán los PDF e imágenes que estén directamente en esta carpeta. Elegirla no importa nada todavía.</DialogDescription>
      </div>
      <div className="flex gap-1 border-b border-slate-100 px-5 pt-3">
        {ROOTS.map(root => <button key={root.id} type="button" onClick={() => go([root])}
          className={cn("flex items-center gap-1.5 rounded-t-lg px-3 py-2 text-xs font-medium", path[0].id === root.id ? "bg-[#EDF3FF] text-[#0A58FF]" : "text-slate-500 hover:text-slate-800")}>
          {root.id === "shared" ? <Users className="size-3.5" /> : <FolderOpen className="size-3.5" />}{root.name}</button>)}
      </div>
      <div className="space-y-3 px-5 py-3">
        <nav aria-label="Ruta" className="flex flex-wrap items-center gap-1 text-xs text-slate-500">
          {path.map((c, i) => <span key={c.id + i} className="flex items-center gap-1">
            {i > 0 && <ChevronRight className="size-3" />}
            <button type="button" onClick={() => go(path.slice(0, i + 1))} className={cn("hover:underline", i === path.length - 1 && "font-semibold text-slate-900")}>{c.name}</button>
          </span>)}
        </nav>
        <form onSubmit={e => { e.preventDefault(); setSearch(query.trim()); }} className="flex items-center gap-2 rounded-lg border border-slate-200 px-3">
          <Search className="size-4 text-slate-400" />
          <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Buscar carpeta aquí…" className="h-9 flex-1 bg-transparent text-sm outline-none" />
        </form>
      </div>
      <div className="min-h-48 flex-1 overflow-y-auto px-3 pb-3">
        {loading ? <p className="flex items-center justify-center gap-2 py-10 text-sm text-slate-500"><Loader2 className="size-4 animate-spin" />Cargando carpetas…</p>
          : error ? <p className="px-2 py-6 text-sm text-rose-600">{error}</p>
          : folders.length ? <ul>{folders.map(f => <li key={f.id}>
            <button type="button" onClick={() => go([...path, { id: f.id, name: f.name }])}
              className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50">
              <Folder className="size-4 shrink-0 text-slate-400" /><span className="min-w-0 flex-1 truncate">{f.name}</span>
              {f.shared && <span className="text-[11px] text-slate-400">compartida</span>}<ChevronRight className="size-4 text-slate-300" />
            </button></li>)}
            {more && <li className="px-3 py-2 text-xs text-slate-500">Hay más carpetas: usa el buscador.</li>}</ul>
          : <p className="px-2 py-10 text-center text-sm text-slate-500">{search ? "Ninguna carpeta coincide." : "No hay subcarpetas aquí."}</p>}
      </div>
      <div className="flex items-center justify-between gap-3 border-t border-slate-200 bg-slate-50/60 px-5 py-3">
        <span className="min-w-0 truncate text-xs text-slate-500">{current.id === "shared" ? "Entra en una carpeta compartida para elegirla" : <>Carpeta: <b className="text-slate-800">{current.name}</b></>}</span>
        <Button variant="corporate" disabled={saving || current.id === "shared"} onClick={choose}>{saving ? "Guardando…" : "Usar esta carpeta"}</Button>
      </div>
    </DialogContent>
  </Dialog>;
}
