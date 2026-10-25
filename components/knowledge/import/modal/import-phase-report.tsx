"use client";

import { useState } from "react";

export type ImportPhaseReportData = {
  title: string;
  status: "Pendiente" | "En curso" | "Validado" | "Revisar";
  input: string;
  validation: string;
  text: string;
};

export function ImportPhaseReport({ report }: { report: ImportPhaseReportData }) {
  const [copyStatus, setCopyStatus] = useState("");
  const text = `${report.title} · ${report.status}\nEntrada: ${report.input}\nValidación: ${report.validation}\n\n${report.text}`;
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-3 text-xs text-slate-700">
      <div className="flex items-center justify-between gap-3">
        <h5 className="font-semibold">{report.title} · {report.status}</h5>
        <button type="button" className="shrink-0 rounded border px-2 py-1" onClick={async () => {
          try { await navigator.clipboard.writeText(text); setCopyStatus("Copiado"); }
          catch { setCopyStatus("No se pudo copiar; selecciona el texto del informe."); }
        }}>Copiar fase</button>
      </div>
      <p className="mt-2">Entrada: {report.input}</p>
      <p className="mt-1">Validación: {report.validation}</p>
      <pre className="mt-2 whitespace-pre-wrap break-words font-sans leading-5">{report.text}</pre>
      <span role="status">{copyStatus}</span>
    </section>
  );
}
