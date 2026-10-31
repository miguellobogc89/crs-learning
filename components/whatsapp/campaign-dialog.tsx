"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, Loader2, Send } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { waApi, buttonClass, errorText, fieldClass } from "./api";
import { canSendTemplate, templateBody, templateVariables } from "./template-utils";
import { SKIP_REASONS } from "@/lib/whatsapp/contacts";
import type { CampaignProgress, CampaignSummary, Template } from "@/lib/whatsapp/types";

const FIELD_SOURCES: [string, string][] = [
  ["field:name", "Empresa / nombre"],
  ["field:city", "Localidad"],
  ["field:province", "Provincia"],
  ["field:category", "Categoría"],
  ["field:specialty", "Especialidad"],
  ["field:email", "Email"],
  ["field:website", "Sitio web"],
];

export function CampaignDialog({
  accountId,
  contactIds,
  columns,
  onClose,
  onDone,
}: {
  accountId: string;
  contactIds: string[];
  columns: string[];
  onClose: () => void;
  onDone: () => void;
}) {
  const [templates, setTemplates] = useState<Template[] | null>(null);
  const [templateId, setTemplateId] = useState("");
  const [sources, setSources] = useState<string[]>([]);
  const [fixed, setFixed] = useState<string[]>([]);
  const [excludeContacted, setExcludeContacted] = useState(true);
  const [ack, setAck] = useState(false);
  const [summary, setSummary] = useState<CampaignSummary | null>(null);
  const [progress, setProgress] = useState<CampaignProgress | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState("");
  const stop = useRef(false);

  useEffect(() => {
    const c = new AbortController();
    void waApi<{ items: Template[] }>(`templates?accountId=${accountId}`, undefined, c.signal)
      .then((d) => setTemplates(d.items.filter(canSendTemplate)))
      .catch((e) => !c.signal.aborted && setError(errorText(e)));
    return () => c.abort();
  }, [accountId]);

  const template = templates?.find((t) => t.id === templateId);
  const variables = useMemo(() => (template ? templateVariables(template) : []), [template]);
  const resolved = sources.map((s, i) => (s === "text:" ? `text:${fixed[i] || ""}` : s));
  const complete = template && resolved.length === variables.length && resolved.every((s) => s && s !== "text:");
  const key = JSON.stringify({ templateId, resolved, excludeContacted });

  useEffect(() => {
    if (!complete || progress) return;
    const c = new AbortController();
    const t = setTimeout(() => {
      void waApi<CampaignSummary>(
        "campaigns/preview",
        { accountId, templateId, variables: resolved, contactIds, excludeContacted },
        c.signal,
      )
        .then((s) => {
          setSummary(s);
          setError("");
        })
        .catch((e) => !c.signal.aborted && setError(errorText(e)));
    }, 250);
    return () => {
      clearTimeout(t);
      c.abort();
    };
    // `key` captures every input of the preview.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, complete]);

  function chooseTemplate(id: string) {
    setTemplateId(id);
    setSummary(null);
    setAck(false);
    const t = templates?.find((x) => x.id === id);
    const n = t ? templateVariables(t).length : 0;
    // First variable usually greets the business by name.
    setSources(Array.from({ length: n }, (_, i) => (i === 0 ? "field:name" : "")));
    setFixed(Array.from({ length: n }, () => ""));
  }

  const [campaignId, setCampaignId] = useState("");
  async function run(id: string, first?: CampaignProgress) {
    setRunning(true);
    setError("");
    stop.current = false;
    try {
      let p = first || (await waApi<CampaignProgress>(`campaigns/progress?campaignId=${id}`));
      setProgress(p);
      while (!p.done && !stop.current) {
        p = await waApi<CampaignProgress>("campaigns/run", { campaignId: id });
        setProgress(p);
      }
    } catch (e) {
      setError(errorText(e));
    } finally {
      setRunning(false);
      onDone();
    }
  }
  async function start() {
    setRunning(true);
    setError("");
    try {
      const created = await waApi<CampaignProgress & { campaignId: string }>("campaigns/create", {
        accountId,
        templateId,
        variables: resolved,
        contactIds,
        excludeContacted,
        acknowledgeNoConsent: ack,
      });
      setCampaignId(created.campaignId);
      await run(created.campaignId, created);
    } catch (e) {
      setError(errorText(e));
      setRunning(false);
    }
  }

  const counts = progress?.counts;
  const toSend = counts ? counts.pending + counts.sending + counts.sent + counts.failed + counts.unknown : 0;
  const processed = counts ? counts.sent + counts.failed + counts.unknown : 0;
  const blocked = !summary || !summary.ready || summary.overLimit > 0 || (summary.withoutConsent > 0 && !ack);

  return (
    <Dialog open onOpenChange={(o) => !o && !running && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Enviar plantilla a {contactIds.length} contacto{contactIds.length === 1 ? "" : "s"}</DialogTitle>
          <DialogDescription>Las variables se rellenan con los datos de cada contacto.</DialogDescription>
        </DialogHeader>

        {progress ? (
          <div className="space-y-3 text-sm">
            <div className="h-2 overflow-hidden rounded-full bg-slate-100">
              <div className="h-full bg-blue-600 transition-all" style={{ width: `${toSend ? (processed / toSend) * 100 : 100}%` }} />
            </div>
            <p className="flex items-center gap-2 text-slate-700">
              {progress.done ? <CheckCircle2 className="h-5 w-5 text-emerald-600" /> : <Loader2 className="h-4 w-4 animate-spin" />}
              {progress.done ? "Envío terminado" : `Enviando ${processed} de ${toSend}…`}
            </p>
            <ul className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
              <li className="rounded-lg bg-emerald-50 p-2 text-emerald-800"><b className="block text-base">{counts!.sent}</b>Enviadas</li>
              <li className="rounded-lg bg-red-50 p-2 text-red-800"><b className="block text-base">{counts!.failed}</b>Con error</li>
              <li className="rounded-lg bg-amber-50 p-2 text-amber-800"><b className="block text-base">{counts!.unknown}</b>Sin confirmar</li>
              <li className="rounded-lg bg-slate-50 p-2 text-slate-600"><b className="block text-base">{counts!.skipped}</b>No enviadas</li>
            </ul>
            {progress.failures.length > 0 && (
              <p className="text-xs text-red-700">Primer error: {progress.failures[0].error}</p>
            )}
            {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-red-700">{error}</p>}
            <div className="flex justify-end gap-2">
              {running && !progress.done && (
                <button className="rounded-lg px-4 py-2 text-slate-600 hover:bg-slate-100" onClick={() => (stop.current = true)}>
                  Pausar
                </button>
              )}
              {!running && !progress.done && campaignId && (
                <button className="rounded-lg px-4 py-2 text-blue-700 hover:bg-blue-50" onClick={() => void run(campaignId)}>
                  Continuar envío
                </button>
              )}
              {!running && (
                <button className={buttonClass} onClick={onClose}>
                  Cerrar
                </button>
              )}
            </div>
          </div>
        ) : (
          <div className="space-y-4 text-sm">
            <label className="block text-xs text-slate-500">
              Plantilla aprobada
              <select className={fieldClass + " mt-1"} value={templateId} onChange={(e) => chooseTemplate(e.target.value)} disabled={!templates}>
                <option value="">{templates ? (templates.length ? "Seleccionar…" : "No hay plantillas de texto aprobadas") : "Cargando…"}</option>
                {templates?.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.is_favorite ? "★ " : ""}
                    {t.name} · {t.language} · {t.category === "MARKETING" ? "Marketing" : t.category === "UTILITY" ? "Utilidad" : t.category}
                  </option>
                ))}
              </select>
            </label>

            {template && (
              <>
                <p className="whitespace-pre-wrap rounded-lg bg-blue-50 p-3 text-xs text-slate-700">{templateBody(template)}</p>
                {variables.map((n, i) => (
                  <div key={n} className="flex items-center gap-2 text-xs text-slate-500">
                    <span className="w-14 shrink-0 font-mono">{`{{${n}}}`}</span>
                    <select
                      className={fieldClass + " py-1.5"}
                      value={sources[i] || ""}
                      onChange={(e) => setSources((s) => s.map((v, j) => (j === i ? e.target.value : v)))}
                    >
                      <option value="">Elegir dato…</option>
                      <optgroup label="Contacto">
                        {FIELD_SOURCES.map(([v, l]) => (
                          <option key={v} value={v}>{l}</option>
                        ))}
                      </optgroup>
                      {columns.length > 0 && (
                        <optgroup label="Columnas del CSV">
                          {columns.map((c) => (
                            <option key={c} value={`attr:${c}`}>{c}</option>
                          ))}
                        </optgroup>
                      )}
                      <option value="text:">Texto fijo…</option>
                    </select>
                    {sources[i] === "text:" && (
                      <input
                        className={fieldClass + " py-1.5"}
                        placeholder="Mismo texto para todos"
                        value={fixed[i] || ""}
                        maxLength={200}
                        onChange={(e) => setFixed((f) => f.map((v, j) => (j === i ? e.target.value : v)))}
                      />
                    )}
                  </div>
                ))}
                <label className="flex items-center gap-2 text-xs text-slate-600">
                  <input type="checkbox" checked={excludeContacted} onChange={(e) => setExcludeContacted(e.target.checked)} />
                  No enviar a quien ya se le ha enviado algo antes
                </label>
              </>
            )}

            {summary && (
              <div className="space-y-2 rounded-lg border border-slate-200 p-3 text-xs">
                <p className="text-sm text-slate-800">
                  Se enviará a <b>{summary.ready}</b> de {summary.total} contactos.
                </p>
                {Object.entries(summary.reasons).length > 0 && (
                  <p className="text-slate-500">
                    No se envía a:{" "}
                    {Object.entries(summary.reasons)
                      .map(([r, n]) => `${n} · ${SKIP_REASONS[r] || r}`)
                      .join(", ")}
                    .
                  </p>
                )}
                {summary.sample && (
                  <div>
                    <p className="mb-1 text-slate-400">Así lo recibirá {summary.sample.name}:</p>
                    <p className="whitespace-pre-wrap rounded-lg bg-emerald-50 p-2 text-slate-700">{summary.sample.text}</p>
                  </div>
                )}
                {summary.overLimit > 0 && (
                  <p className="text-red-700">Máximo {summary.limit} envíos por tanda: quita {summary.overLimit} de la selección.</p>
                )}
                {summary.withoutConsent > 0 && (
                  <div className="space-y-2 rounded-lg bg-amber-50 p-2 text-amber-900">
                    <p className="flex items-start gap-1.5">
                      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                      {summary.withoutConsent} de estos contactos no tienen autorización registrada para recibir WhatsApp. Meta exige que la hayan dado; si muchos bloquean o denuncian, el número puede perder calidad o ser restringido.
                    </p>
                    <label className="flex items-center gap-2 font-medium">
                      <input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} />
                      Entiendo el riesgo y quiero enviarlo igualmente
                    </label>
                  </div>
                )}
              </div>
            )}
            {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-red-700">{error}</p>}
            <div className="flex justify-end gap-2">
              <button className="rounded-lg px-4 py-2 text-slate-600 hover:bg-slate-100" onClick={onClose}>
                Cancelar
              </button>
              <button className={buttonClass} disabled={blocked || running} onClick={start}>
                {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                Enviar {summary?.ready ? `a ${summary.ready}` : ""}
              </button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
