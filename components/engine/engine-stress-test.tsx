"use client";

import { useState } from "react";

type Result = {
  status: string;
  score: { passed: number; total: number; checks: { name: string; pass: boolean }[] } | null;
  issues: { path: string; code: string }[];
  entities: { key: string; name: string; fields: string[] }[];
  relations: { key: string; from: string; to: string; cardinality?: string | null }[];
  warnings: string[];
  durationMs: number;
  writesPerformed: false;
};

export function EngineStressTest() {
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState("");
  async function run() {
    setRunning(true); setResult(null); setError("");
    try {
      const response = await fetch("/api/engine/stress-test", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: "{}",
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "No se pudo ejecutar la prueba.");
      setResult(data as Result);
    } catch (e) { setError(e instanceof Error ? e.message : "Error inesperado."); }
    finally { setRunning(false); }
  }
  return <section className="rounded-xl border border-slate-200 bg-white p-5 space-y-3">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div>
        <h2 className="font-semibold text-slate-900">Laboratorio del Engine</h2>
        <p className="text-xs text-slate-500">Prueba de estrés: recetas, proveedores, ofertas y rápeles. Solo lectura, sin guardar datos.</p>
      </div>
      <button type="button" disabled={running} onClick={run}
        className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
        {running ? "Analizando..." : "Ejecutar prueba"}
      </button>
    </div>
    {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
    {result && <div className="space-y-3 text-sm">
      <p className="font-semibold">Resultado: {result.score ? result.score.passed + "/" + result.score.total : "esquema inválido"}
        <span className="ml-2 text-xs font-normal text-slate-500">{(result.durationMs / 1000).toFixed(1)} s · Sin escrituras</span>
      </p>
      {result.score && <div className="grid gap-1 sm:grid-cols-2">
        {result.score.checks.map(check => <p key={check.name} className={check.pass ? "text-green-700" : "text-amber-700"}>
          {check.pass ? "✓" : "✕"} {check.name}
        </p>)}
      </div>}
      {result.status === "invalid_schema" && <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">La IA devolvió un esquema con errores de validación. La puntuación es orientativa; no se ha importado.</p>}
      {result.issues.length > 0 && <details><summary>Problemas de validación ({result.issues.length})</summary>
        <pre className="overflow-x-auto text-xs">{JSON.stringify(result.issues, null, 2)}</pre></details>}
      <details><summary>Entidades descubiertas ({result.entities.length})</summary>
        <pre className="overflow-x-auto text-xs">{JSON.stringify(result.entities, null, 2)}</pre></details>
      <details><summary>Relaciones ({result.relations.length})</summary>
        <pre className="overflow-x-auto text-xs">{JSON.stringify(result.relations, null, 2)}</pre></details>
      {result.warnings.length > 0 && <details><summary>Advertencias ({result.warnings.length})</summary>
        <pre className="overflow-x-auto text-xs">{JSON.stringify(result.warnings, null, 2)}</pre></details>}
    </div>}
  </section>;
}
