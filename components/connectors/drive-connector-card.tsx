"use client";
import { useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, Folder, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DriveFolderPicker } from "./drive-folder-picker";
import { DriveSyncPanel, type LastSync } from "./drive-sync-panel";

export type DriveCardState = {
  status: "disconnected" | "active" | "error"; email: string | null; name: string | null; connectedAt: string | null; lastError: string | null;
  folder: { id: string; name: string } | null; lastSync: LastSync | null;
};
type Documents = { importable: number; other: number; capped: boolean };

function DriveLogo() {
  return <svg viewBox="0 0 87.3 78" className="size-7" aria-hidden>
    <path d="m6.6 66.85 3.85 6.65c.8 1.4 1.95 2.5 3.3 3.3l13.75-23.8h-27.5c0 1.55.4 3.1 1.2 4.5z" fill="#0066da" />
    <path d="m43.65 25-13.75-23.8c-1.35.8-2.5 1.9-3.3 3.3l-25.4 44a9.06 9.06 0 0 0 -1.2 4.5h27.5z" fill="#00ac47" />
    <path d="m73.55 76.8c1.35-.8 2.5-1.9 3.3-3.3l1.6-2.75 7.65-13.25c.8-1.4 1.2-2.95 1.2-4.5h-27.502l5.852 11.5z" fill="#ea4335" />
    <path d="m43.65 25 13.75-23.8c-1.35-.8-2.9-1.2-4.5-1.2h-18.5c-1.6 0-3.15.45-4.5 1.2z" fill="#00832d" />
    <path d="m59.8 53h-32.3l-13.75 23.8c1.35.8 2.9 1.2 4.5 1.2h50.8c1.6 0 3.15-.45 4.5-1.2z" fill="#2684fc" />
    <path d="m73.4 26.5-12.7-22c-.8-1.4-1.95-2.5-3.3-3.3l-13.75 23.8 16.15 28h27.45c0-1.55-.4-3.1-1.2-4.5z" fill="#ffba00" />
  </svg>;
}

const docsText = (d: Documents) => `${d.capped ? "Más de " : ""}${d.importable} ${d.importable === 1 ? "documento que se puede leer" : "documentos que se pueden leer"}` +
  (d.other ? ` · ${d.other} de otros tipos (de momento no se leen)` : "");

/** Google Drive: connect, see the account, choose the folder, disconnect. */
export function DriveConnectorCard({ initial, canManage, flash }: { initial: DriveCardState; canManage: boolean; flash: { kind: "connected" | "error"; message?: string } | null }) {
  const [state, setState] = useState(initial);
  const [documents, setDocuments] = useState<Documents | null>(null);
  const [folderError, setFolderError] = useState<string | null>(null);
  const [picker, setPicker] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(flash);

  useEffect(() => {
    if (state.status !== "active" || !state.folder) return;
    let cancelled = false;
    fetch("/api/connectors/google-drive/folder").then(async r => {
      const json = await r.json();
      if (cancelled) return;
      if (r.ok) { setDocuments(json.documents ?? null); setFolderError(null); }
      else { setFolderError(json.error); if (json.reconnect) setState(s => ({ ...s, status: "error", lastError: json.error })); }
    }).catch(() => undefined);
    return () => { cancelled = true; };
  }, [state.status, state.folder?.id]);

  async function disconnect() {
    setBusy(true);
    try {
      const r = await fetch("/api/connectors/google-drive", { method: "DELETE" });
      const json = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(json.error ?? "No se pudo desconectar");
      setState({ status: "disconnected", email: null, name: null, connectedAt: null, lastError: null, folder: null, lastSync: null });
      setDocuments(null); setMessage(null);
    } catch (e) { setMessage({ kind: "error", message: e instanceof Error ? e.message : String(e) }); }
    finally { setBusy(false); setConfirming(false); }
  }

  const connected = state.status !== "disconnected";
  return <section className="rounded-xl border border-slate-200 bg-white">
    <div className="flex flex-wrap items-start gap-4 p-5">
      <span className="flex size-12 items-center justify-center rounded-xl border border-slate-200 bg-white"><DriveLogo /></span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-base font-semibold text-slate-900">Google Drive</h2>
          {state.status === "active" && <span className="flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700"><CheckCircle2 className="size-3" />Conectado</span>}
          {state.status === "error" && <span className="flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-700"><AlertTriangle className="size-3" />Hay que reconectar</span>}
        </div>
        <p className="mt-0.5 text-sm text-slate-500">
          {state.status === "disconnected" ? "Importa facturas y documentos desde una carpeta de tu Drive. Solo lectura: nunca se modifica ni borra nada en Drive."
            : <>Cuenta: <b className="font-medium text-slate-700">{state.email ?? "—"}</b>{state.name ? ` (${state.name})` : ""}</>}
        </p>
        {state.status === "error" && state.lastError && <p className="mt-1 text-sm text-amber-700">{state.lastError}</p>}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {canManage && (state.status !== "active"
          ? <a href="/api/connectors/google-drive/connect" className="inline-flex h-8 items-center rounded-lg bg-[#0A58FF] px-3 text-sm font-medium text-white hover:bg-[#0848d6]">
              {state.status === "error" ? "Reconectar" : "Conectar"}</a>
          : confirming
            ? <><span className="text-xs text-slate-500">¿Desconectar? Lo ya importado se queda.</span>
                <Button variant="destructive" size="sm" disabled={busy} onClick={disconnect}>{busy ? <Loader2 className="size-3.5 animate-spin" /> : "Sí, desconectar"}</Button>
                <Button variant="ghost" size="sm" disabled={busy} onClick={() => setConfirming(false)}>Cancelar</Button></>
            : <Button variant="outline" size="sm" onClick={() => setConfirming(true)}>Desconectar</Button>)}
        {!canManage && !connected && <span className="text-xs text-slate-500">Pide a un administrador que lo conecte.</span>}
      </div>
    </div>
    {message && <p className={"mx-5 mb-4 rounded-lg px-3 py-2 text-sm " + (message.kind === "connected" ? "bg-emerald-50 text-emerald-800" : "bg-rose-50 text-rose-700")}>
      {message.kind === "connected" ? "Drive conectado. Ahora elige la carpeta de la que leer los documentos." : message.message ?? "No se pudo conectar"}</p>}
    {state.status === "active" && <div className="flex flex-wrap items-center gap-3 border-t border-slate-100 px-5 py-4">
      <Folder className="size-5 text-slate-400" />
      <div className="min-w-0 flex-1">
        {state.folder ? <>
          <p className="text-sm font-medium text-slate-900">{state.folder.name}</p>
          <p className="text-xs text-slate-500">{folderError ? <span className="text-rose-600">{folderError}</span> : documents ? docsText(documents) : "Comprobando la carpeta…"}</p>
        </> : <p className="text-sm text-slate-500">Todavía no has elegido carpeta.</p>}
      </div>
      {canManage && <Button variant={state.folder ? "outline" : "brand"} size="sm" onClick={() => setPicker(true)}>{state.folder ? "Cambiar carpeta" : "Elegir carpeta"}</Button>}
    </div>}
    {state.status === "active" && state.folder && !folderError && <DriveSyncPanel folderId={state.folder.id} canManage={canManage} lastSync={state.lastSync} />}
    {canManage && <DriveFolderPicker open={picker} onOpenChange={setPicker}
      onChosen={r => { setState(s => ({ ...s, folder: r.folder, lastSync: s.folder?.id === r.folder.id ? s.lastSync : null })); setDocuments(r.documents); setFolderError(null); setMessage(null); }} />}
  </section>;
}
