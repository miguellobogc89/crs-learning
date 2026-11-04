"use client";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Bold, Braces, Italic, Loader2, Smile, Strikethrough, X } from "lucide-react";
import { waApi, buttonClass, errorText, fieldClass } from "./api";

/** Emojis that fit messages to businesses (events, music, offers); any other can be typed or pasted too. */
const EMOJIS: { label: string; items: string[] }[] = [
  { label: "Caras", items: ["😀", "😃", "😊", "🙂", "😉", "😍", "🥳", "😎", "🤩", "🤗", "🤔", "😅", "🙌", "👏", "👋", "🙏"] },
  { label: "Gestos", items: ["👍", "👌", "✌️", "🤝", "💪", "👉", "👇", "☝️", "✋", "🫶"] },
  { label: "Eventos", items: ["🎉", "🎊", "🎈", "🎂", "🥂", "🍾", "💍", "👰", "🤵", "🎁", "🎤", "🎧", "🎶", "🎵", "🪩", "💃", "🕺", "🎩", "🪄", "✨"] },
  { label: "Negocio", items: ["📅", "🗓️", "⏰", "📍", "📞", "📲", "✉️", "💬", "💼", "📈", "💰", "🏷️", "🔖", "📌", "📝", "🔗"] },
  { label: "Símbolos", items: ["✅", "☑️", "✔️", "❌", "⚠️", "⭐", "🌟", "🔥", "💡", "❤️", "💙", "💚", "➡️", "⬇️", "🔝", "🆕", "🆓", "💯"] },
];
const LANGUAGES = [["es", "Español"], ["es_ES", "Español (España)"], ["ca", "Catalán"], ["en", "Inglés"], ["en_US", "Inglés (EE. UU.)"], ["pt_PT", "Portugués (Portugal)"], ["fr", "Francés"]] as const;
/** What a variable usually holds: picking one fills a realistic example (Meta asks for one per variable). */
const MEANINGS = [
  ["name", "Nombre de la empresa o persona", "Discomóvil Deep"],
  ["city", "Localidad", "Barcelona"],
  ["specialty", "Especialidad", "DJ y discomóviles"],
  ["date", "Fecha", "15 de junio"],
  ["text", "Otro texto", ""],
] as const;

const slug = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").replace(/^(\d)/, "p_$1").slice(0, 512);
const variablesOf = (text: string) => [...new Set([...text.matchAll(/\{\{(\d+)\}\}/g)].map(m => Number(m[1])))].sort((a, b) => a - b);

/** Problems Meta would reject the template for, in words, before sending it. */
export function templateProblems(text: string, footer: string): string[] {
  const out: string[] = [];
  const vars = variablesOf(text);
  if (vars.some((n, i) => n !== i + 1)) out.push("Las variables deben ser consecutivas: {{1}}, {{2}}, {{3}}…");
  if (/^\s*\{\{\d+\}\}/.test(text)) out.push("El mensaje no puede empezar con una variable: pon alguna palabra antes.");
  if (/\{\{\d+\}\}[\s.!?¡¿,;:]*$/.test(text)) out.push("El mensaje no puede terminar con una variable: añade algo después.");
  if (/\{\{\d+\}\}\s*\{\{\d+\}\}/.test(text)) out.push("Dos variables no pueden ir seguidas: sepáralas con texto.");
  if (text.replace(/\{\{\d+\}\}/g, "").includes("{{") || /\{\{[^}]*[^\d}][^}]*\}\}/.test(text)) out.push("Las variables se escriben {{1}}, {{2}}… (solo números).");
  if (vars.length && text.replace(/\{\{\d+\}\}/g, "").trim().split(/\s+/).length < vars.length * 2 + 1)
    out.push("Hay muchas variables para tan poco texto: Meta suele rechazarlo.");
  if (/\{\{/.test(footer)) out.push("El pie no admite variables.");
  return out;
}

/** WhatsApp's own formatting: *negrita*, _cursiva_, ~tachado~, as the recipient will see it. */
function formatted(text: string): ReactNode[] {
  const parts: ReactNode[] = [];
  const re = /(\*[^*\n]+\*|_[^_\n]+_|~[^~\n]+~)/g;
  let last = 0, m: RegExpExecArray | null, i = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) parts.push(text.slice(last, m.index));
    const inner = m[0].slice(1, -1);
    parts.push(m[0][0] === "*" ? <b key={i++}>{inner}</b> : m[0][0] === "_" ? <i key={i++}>{inner}</i> : <s key={i++}>{inner}</s>);
    last = m.index + m[0].length;
  }
  parts.push(text.slice(last));
  return parts;
}

export function TemplateEditor({ accountId, onClose, onCreated }: { accountId: string; onClose: () => void; onCreated: () => Promise<void> }) {
  const [title, setTitle] = useState("");
  const [name, setName] = useState("");
  const [nameTouched, setNameTouched] = useState(false);
  const [language, setLanguage] = useState("es");
  const [category, setCategory] = useState("MARKETING");
  const [text, setText] = useState("");
  const [footer, setFooter] = useState("");
  const [meanings, setMeanings] = useState<Record<number, string>>({});
  const [examples, setExamples] = useState<Record<number, string>>({});
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const dialog = useRef<HTMLDialogElement>(null);
  const area = useRef<HTMLTextAreaElement>(null);
  useEffect(() => { const el = dialog.current; el?.showModal(); return () => el?.close(); }, []);

  const variables = useMemo(() => variablesOf(text), [text]);
  const problems = useMemo(() => templateProblems(text, footer), [text, footer]);
  const missingExamples = variables.filter(v => !examples[v]?.trim());

  /** Inserts at the cursor (or wraps the selection) and keeps the cursor after it. */
  function insert(before: string, after = "") {
    const el = area.current;
    const start = el?.selectionStart ?? text.length, end = el?.selectionEnd ?? text.length;
    const next = text.slice(0, start) + before + text.slice(start, end) + after + text.slice(end);
    if (next.length > 1024) return;
    setText(next);
    requestAnimationFrame(() => { el?.focus(); const pos = end + before.length + after.length; el?.setSelectionRange(pos, pos); });
  }
  function addVariable() {
    const n = (variables.at(-1) ?? 0) + 1;
    insert(`{{${n}}}`);
    if (n === 1 && !meanings[1]) { setMeanings(m => ({ ...m, 1: "name" })); setExamples(e => ({ ...e, 1: e[1] || "Discomóvil Deep" })); }
  }
  function setMeaning(v: number, key: string) {
    setMeanings(m => ({ ...m, [v]: key }));
    const sample = MEANINGS.find(x => x[0] === key)?.[2] ?? "";
    setExamples(e => ({ ...e, [v]: sample || e[v] || "" }));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    if (problems.length || missingExamples.length) { setError(problems[0] ?? `Falta el ejemplo de {{${missingExamples[0]}}}`); return; }
    setBusy(true); setError("");
    try {
      await waApi("templates/create", { accountId, name, text, footer: footer.trim() || undefined, language, category, examples: variables.map(v => examples[v].trim()) });
      await onCreated();
    } catch (err) { setError(errorText(err)); }
    finally { setBusy(false); }
  }

  const preview = text.replace(/\{\{(\d+)\}\}/g, (m, n) => examples[Number(n)]?.trim() || m);
  const tool = "rounded p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-800";
  return <dialog ref={dialog} onCancel={e => { if (busy) e.preventDefault(); else onClose(); }} aria-labelledby="wa-template-title"
    className="m-auto w-[min(60rem,94vw)] max-h-[92vh] overflow-y-auto rounded-2xl p-0 shadow-xl backdrop:bg-slate-950/30">
    <form onSubmit={submit} className="grid gap-0 md:grid-cols-[minmax(0,1fr)_300px]">
      <div className="space-y-4 p-6">
        <div className="flex items-center justify-between">
          <h2 id="wa-template-title" className="font-semibold">Nueva plantilla</h2>
          <button type="button" aria-label="Cerrar" disabled={busy} onClick={onClose} className="md:hidden"><X className="h-5 w-5" /></button>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-xs text-slate-600">Nombre
            <input required value={title} disabled={busy} placeholder="Presentación a DJs"
              onChange={e => { setTitle(e.target.value); if (!nameTouched) setName(slug(e.target.value)); }} className={fieldClass + " mt-1"} />
          </label>
          <label className="text-xs text-slate-600">Nombre para Meta
            <input required value={name} disabled={busy} pattern="[a-z][a-z0-9_]*" maxLength={512}
              onChange={e => { setNameTouched(true); setName(slug(e.target.value)); }} className={fieldClass + " mt-1 font-mono text-xs"} />
            <span className="mt-0.5 block text-[11px] text-slate-400">Minúsculas y guiones bajos; se rellena solo.</span>
          </label>
          <label className="text-xs text-slate-600">Idioma
            <select value={language} disabled={busy} onChange={e => setLanguage(e.target.value)} className={fieldClass + " mt-1"}>
              {LANGUAGES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </label>
          <label className="text-xs text-slate-600">Categoría
            <select value={category} disabled={busy} onChange={e => setCategory(e.target.value)} className={fieldClass + " mt-1"}>
              <option value="MARKETING">Marketing (captar clientes, ofertas)</option>
              <option value="UTILITY">Utilidad (avisos de algo ya contratado)</option>
            </select>
          </label>
        </div>

        <div>
          <div className="flex items-center justify-between text-xs text-slate-600">
            <span>Mensaje</span>
            <span className={text.length > 950 ? "text-amber-700" : "text-slate-400"}>{text.length}/1024</span>
          </div>
          <div className="mt-1 rounded-lg border border-slate-200 focus-within:border-blue-400 focus-within:ring-2 focus-within:ring-blue-100">
            <div className="relative flex flex-wrap items-center gap-0.5 border-b border-slate-100 px-1.5 py-1">
              <button type="button" className={tool} title="Emoticonos" aria-label="Emoticonos" onClick={() => setEmojiOpen(o => !o)}><Smile className="h-4 w-4" /></button>
              <button type="button" className={tool} title="Negrita (*texto*)" aria-label="Negrita" onClick={() => insert("*", "*")}><Bold className="h-4 w-4" /></button>
              <button type="button" className={tool} title="Cursiva (_texto_)" aria-label="Cursiva" onClick={() => insert("_", "_")}><Italic className="h-4 w-4" /></button>
              <button type="button" className={tool} title="Tachado (~texto~)" aria-label="Tachado" onClick={() => insert("~", "~")}><Strikethrough className="h-4 w-4" /></button>
              <span className="mx-1 h-4 w-px bg-slate-200" />
              <button type="button" onClick={addVariable} className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs font-medium text-blue-700 hover:bg-blue-50">
                <Braces className="h-3.5 w-3.5" />Añadir variable</button>
              {emojiOpen && <div className="absolute left-0 top-full z-10 mt-1 w-[min(22rem,80vw)] rounded-xl border border-slate-200 bg-white p-2 shadow-lg">
                {EMOJIS.map(g => <div key={g.label} className="mb-1.5">
                  <p className="px-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400">{g.label}</p>
                  <div className="flex flex-wrap">{g.items.map(em =>
                    <button key={em} type="button" className="rounded p-1 text-lg leading-none hover:bg-slate-100" onClick={() => insert(em)} aria-label={`Insertar ${em}`}>{em}</button>)}</div>
                </div>)}
                <p className="px-1 pt-1 text-[11px] text-slate-400">También puedes pegar cualquier emoji o usar Windows + . (punto).</p>
              </div>}
            </div>
            <textarea ref={area} required rows={7} maxLength={1024} disabled={busy} value={text} onChange={e => setText(e.target.value)}
              onFocus={() => setEmojiOpen(false)}
              placeholder={"Hola {{1}} 👋\n\nOrganizamos eventos y buscamos DJs en tu zona…"}
              className="block w-full resize-y rounded-b-lg px-3 py-2 text-sm outline-none" />
          </div>
        </div>

        {variables.length > 0 && <div className="space-y-2">
          <p className="text-xs text-slate-600">Variables <span className="text-slate-400">· Meta pide un ejemplo de cada una para revisarla; al enviar se rellenan con los datos de cada lead.</span></p>
          {variables.map(v => <div key={v} className="grid grid-cols-[3.5rem_minmax(0,1fr)_minmax(0,1fr)] items-center gap-2">
            <span className="font-mono text-xs text-slate-500">{`{{${v}}}`}</span>
            <select aria-label={`Qué es {{${v}}}`} value={meanings[v] ?? ""} onChange={e => setMeaning(v, e.target.value)} className={fieldClass + " py-1.5 text-xs"}>
              <option value="">¿Qué dato es?</option>
              {MEANINGS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </select>
            <input aria-label={`Ejemplo de {{${v}}}`} placeholder="Ejemplo" maxLength={200} value={examples[v] ?? ""}
              onChange={e => setExamples(x => ({ ...x, [v]: e.target.value }))} className={fieldClass + " py-1.5 text-xs"} />
          </div>)}
        </div>}

        <label className="block text-xs text-slate-600">Pie <span className="text-slate-400">(opcional, texto pequeño gris)</span>
          <input maxLength={60} value={footer} disabled={busy} onChange={e => setFooter(e.target.value)} placeholder="Responde BAJA si no quieres más mensajes"
            className={fieldClass + " mt-1"} />
        </label>

        {(problems.length > 0 || error) && <div role="alert" className="space-y-1 rounded-lg bg-amber-50 p-3 text-xs text-amber-900">
          {error && !problems.includes(error) && <p className="text-red-700">{error}</p>}
          {problems.map(p => <p key={p}>• {p}</p>)}
        </div>}

        <div className="flex justify-end gap-2">
          <button type="button" disabled={busy} onClick={onClose} className="px-3 text-sm text-slate-500">Cancelar</button>
          <button type="submit" disabled={busy || !text.trim() || !name} className={buttonClass}>{busy && <Loader2 className="h-4 w-4 animate-spin" />}Enviar a aprobación</button>
        </div>
      </div>

      {/* How the lead will see it */}
      <aside className="relative border-t border-slate-100 bg-[#efeae2] p-5 md:border-l md:border-t-0">
        <button type="button" aria-label="Cerrar" disabled={busy} onClick={onClose} className="absolute right-3 top-3 hidden rounded-full bg-white/80 p-1 md:block"><X className="h-4 w-4" /></button>
        <p className="mb-3 text-xs font-medium text-slate-600">Vista previa</p>
        <div className="max-w-[260px] rounded-lg rounded-tl-none bg-white px-3 py-2 text-[13px] leading-5 text-slate-800 shadow-sm">
          {text.trim() ? <p className="whitespace-pre-wrap break-words">{formatted(preview)}</p> : <p className="text-slate-400">Escribe el mensaje…</p>}
          {footer.trim() && <p className="mt-1 text-[11px] text-slate-400">{footer}</p>}
          <p className="mt-0.5 text-right text-[10px] text-slate-400">12:00</p>
        </div>
        <p className="mt-4 text-[11px] leading-4 text-slate-500">Meta suele revisarla en minutos u horas. Mientras no esté «Aprobada» no se puede enviar. Las de marketing se pagan por mensaje.</p>
      </aside>
    </form>
  </dialog>;
}
