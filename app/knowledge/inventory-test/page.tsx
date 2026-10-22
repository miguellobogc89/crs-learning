"use client";
import { useEffect, useState } from "react";
import { uploadKnowledgeImport, runKnowledgeImportAnalysis } from "@/components/knowledge/import/knowledge-import-api";

type Library = { id: string; name: string };
type Document = { kind: string; subtype: string; summary: string; evidence: string; confidence: string; embeddedTables: number; possibleContinuation: boolean };
type Inventory = { fileCount: number; documentCandidates: number; families: Array<{ kind: string; count: number }>;
  files: Array<{ id: string; name: string; characters: number; status: string; documents: Document[]; warning: string | null }>;
  warnings: string[] };
export default function InventoryTestPage() {
  const [libraries, setLibraries] = useState<Library[]>([]);
  const [libraryId, setLibraryId] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [stage, setStage] = useState("Sin iniciar");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [inventory, setInventory] = useState<Inventory | null>(null);
  useEffect(() => {
    fetch("/api/knowledge/import/inventory-test/libraries").then(async response => {
      if (!response.ok) throw new Error("No se pueden cargar las bibliotecas");
      return response.json() as Promise<{ libraries: Library[] }>;
    }).then(data => { setLibraries(data.libraries); setLibraryId(data.libraries[0]?.id ?? ""); })
      .catch(err => setError(String(err)));
  }, []);
  async function run() {
    if (!libraryId || !files.length || busy) return;
    setBusy(true); setError(""); setInventory(null);
    try {
      setStage("Subiendo archivos");
      const form = new FormData();
      form.set("libraryId", libraryId);
      form.set("mode", "files");
      form.set("relativePaths", JSON.stringify(files.map(file => file.name)));
      files.forEach(file => form.append("files", file));
      const uploaded = await uploadKnowledgeImport(form);
      setStage("Extrayendo contenido");
      const extracted = await runKnowledgeImportAnalysis(uploaded.importId, {
        onStageChange: value => setStage(value === "analyzing" ? "Preparando archivos" : "Extrayendo texto"),
      });
      if (!extracted.textExtraction.successfulFiles) throw new Error("No se ha extraído texto de ningún archivo");
      setStage("Reconociendo documentos de todo el lote");
      const response = await fetch(`/api/knowledge/import/${encodeURIComponent(uploaded.importId)}/inventory-test`, { method: "POST" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "No se pudo generar el inventario");
      setInventory(result as Inventory); setStage("Inventario provisional completado");
    } catch (err) { setError(err instanceof Error ? err.message : String(err)); setStage("Error"); }
    finally { setBusy(false); }
  }
  return <main className="mx-auto max-w-5xl space-y-6 p-6 text-slate-900">
    <header className="space-y-2">
      <p className="text-sm font-semibold text-blue-600">CRS Learning · Experimento C</p>
      <h1 className="text-2xl font-bold">Inventario documental de un lote</h1>
      <p className="text-sm text-slate-600">Sube varios archivos a la vez. Solo extrae texto y clasifica documentos; no crea tablas, registros ni relaciones en Engine.</p>
    </header>
    <section className="space-y-4 rounded-xl border bg-white p-5">
      <label className="block text-sm font-medium">Biblioteca de destino para los archivos originales</label>
      <select className="w-full rounded-lg border p-2" value={libraryId} onChange={event => setLibraryId(event.target.value)}>
        {libraries.map(lib => <option key={lib.id} value={lib.id}>{lib.name}</option>)}
      </select>
      <label className="block text-sm font-medium">Selecciona todos los PDF de la prueba C</label>
      <input type="file" multiple accept=".pdf,.txt,.docx,.xlsx,.csv" onChange={event => setFiles(Array.from(event.target.files ?? []))} />
      <p className="text-xs text-slate-500">{files.length} archivos seleccionados. La clasificación usa muestras del texto extraído; no interpreta directamente fotografías sin OCR.</p>
      <button type="button" disabled={busy || !files.length || !libraryId} onClick={run}
        className="rounded-lg bg-blue-600 px-5 py-2 text-sm font-semibold text-white disabled:opacity-40">
        {busy ? "Analizando..." : "Ejecutar prueba C"}
      </button>
      <p role="status" className="text-sm text-slate-600">{stage}</p>
      {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
    </section>
    {inventory && <section className="space-y-5">
      <div className="grid grid-cols-3 gap-3">
        {[["Archivos",inventory.fileCount],["Documentos candidatos",inventory.documentCandidates],["Familias",inventory.families.length]].map(([label,count]) =>
          <div key={String(label)} className="rounded-xl border p-4"><p className="text-xs text-slate-500">{label}</p><p className="text-2xl font-bold">{count}</p></div>)}
      </div>
      <section className="rounded-xl border p-4">
        <h2 className="font-bold">Familias detectadas</h2>
        <div className="mt-2 space-y-2">{inventory.families.map(family =>
          <div key={family.kind} className="flex justify-between border-b py-2 text-sm"><span>{family.kind}</span><strong>{family.count}</strong></div>)}</div>
      </section>
      {inventory.files.map(file => <section key={file.id} className="rounded-xl border p-4">
        <h2 className="font-semibold">{file.name}</h2>
        <p className="text-xs text-slate-500">{file.characters.toLocaleString("es-ES")} caracteres extraídos · {file.status}</p>
        {file.warning && <p className="mt-2 rounded-lg bg-amber-50 p-2 text-sm text-amber-800">{file.warning}</p>}
        <div className="mt-3 space-y-3">{file.documents.map((doc,index) =>
          <div key={index} className="rounded-lg bg-slate-50 p-3">
            <p className="font-medium">{doc.kind}{doc.subtype ? ` · ${doc.subtype}` : ""}</p>
            <p className="text-sm">{doc.summary}</p>
            <p className="mt-1 text-xs text-slate-500">Confianza: {doc.confidence} · Tablas internas: {doc.embeddedTables} · Posible continuación: {doc.possibleContinuation ? "sí" : "no"}</p>
            <blockquote className="mt-2 border-l-2 border-blue-300 pl-3 text-xs text-slate-600">{doc.evidence}</blockquote>
          </div>)}</div>
      </section>)}
      <section className="rounded-lg bg-amber-50 p-4 text-sm text-amber-900">{inventory.warnings.join(" ")}</section>
      <button type="button" className="rounded-lg border px-4 py-2 text-sm" onClick={() => {
        const blob = new Blob([JSON.stringify(inventory,null,2)],{type:"application/json"});
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a"); link.href=url; link.download="crs-inventario-prueba-c.json"; link.click(); URL.revokeObjectURL(url);
      }}>Descargar resultado JSON</button>
    </section>}
  </main>;
}
