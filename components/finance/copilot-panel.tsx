"use client";
// Copiloto: conversación con la IA sobre tus datos reales. Las cifras salen de los cálculos de la app.
import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import { ArrowUp, Loader2, MessageCircle, RotateCcw } from "lucide-react";
import { panel } from "@/components/trading/format";
import { ErrorNote } from "@/components/trading/ui";
import { errorText, fapi, refreshFinance, useFinance } from "./api";

type Msg = { id: string; role: "user" | "assistant"; content: string; createdAt: string };

const SUGGESTIONS = [
  "¿Cómo voy de gastos este mes?",
  "¿En qué estoy gastando más que antes?",
  "¿Puedo permitirme gastar 400 € este mes?",
  "¿Cuánto ahorraré hasta enero si sigo así?",
  "¿Qué gastos podría reducir?",
  "¿Tengo suscripciones que no uso o cargos raros?",
];

export function CopilotPanel() {
  const { data, error, reload } = useFinance<{ messages: Msg[] }>("chat");
  const [messages, setMessages] = useState<Msg[]>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (data) setMessages(data.messages);
  }, [data]);
  useEffect(() => {
    end.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, busy]);

  const send = async (q: string) => {
    const question = q.trim();
    if (!question || busy) return;
    setErr(null);
    setText("");
    setBusy(true);
    setMessages((m) => [...m, { id: `tmp-${Date.now()}`, role: "user", content: question, createdAt: new Date().toISOString() }]);
    try {
      const answer = await fapi<Msg>("chat", { question });
      setMessages((m) => [...m, answer]);
      // Vuelve a leer la conversación guardada (ids definitivos).
      reload();
    } catch (e) {
      setErr(errorText(e));
    } finally {
      setBusy(false);
    }
  };
  const clear = async () => {
    if (!window.confirm("¿Borrar la conversación? Lo que el copiloto recuerda de ti se mantiene (está en Preferencias).")) return;
    await fapi("chat/clear", {});
    setMessages([]);
    refreshFinance();
  };

  return (
    <div className="flex h-[calc(100dvh-8.5rem-env(safe-area-inset-bottom))] min-h-0 flex-col gap-3 md:h-[calc(100dvh-8rem)] lg:h-full">
      <div className={`${panel} flex min-h-0 flex-1 flex-col max-md:-mx-3 max-md:rounded-none max-md:border-x-0 max-md:shadow-none`}>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-6">
          {error && !data && <ErrorNote>{error}</ErrorNote>}
          {messages.length === 0 && !busy ? (
            <div className="mx-auto max-w-xl py-8 text-center">
              <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-50 text-blue-600"><MessageCircle className="h-6 w-6" /></span>
              <h2 className="mt-4 text-lg font-semibold text-slate-900">Pregúntame por tu dinero</h2>
              <p className="mt-1 text-sm text-slate-500">Respondo con tus movimientos reales y te enseño el cálculo. Si algo no cuadra, te lo diré.</p>
              <div className="mt-5 flex flex-wrap justify-center gap-2">
                {SUGGESTIONS.map((s) => (
                  <button key={s} type="button" onClick={() => void send(s)} className="rounded-full border border-slate-200 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50">{s}</button>
                ))}
              </div>
            </div>
          ) : (
            <ul className="mx-auto max-w-3xl space-y-4">
              {messages.map((m) => (
                <li key={m.id} className={m.role === "user" ? "flex justify-end" : ""}>
                  {m.role === "user" ? (
                    <span className="inline-block max-w-[85%] rounded-2xl rounded-br-md bg-blue-600 px-4 py-2.5 text-[15px] text-white">{m.content}</span>
                  ) : (
                    <div className="max-w-none text-[15px] leading-relaxed text-slate-800 [&_li]:my-0.5 [&_ol]:my-2 [&_ol]:list-decimal [&_ol]:pl-5 [&_p]:my-2 [&_strong]:font-semibold [&_strong]:text-slate-950 [&_ul]:my-2 [&_ul]:list-disc [&_ul]:pl-5">
                      <ReactMarkdown>{m.content}</ReactMarkdown>
                    </div>
                  )}
                </li>
              ))}
              {busy && <li className="flex items-center gap-2 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" /> Mirando tus números…</li>}
            </ul>
          )}
          <div ref={end} />
        </div>
        {err && <div className="px-4 pb-2"><ErrorNote>{err}</ErrorNote></div>}
        <form
          className="flex items-end gap-2 border-t border-slate-100 p-3"
          onSubmit={(e) => { e.preventDefault(); void send(text); }}
        >
          {messages.length > 0 && (
            <button type="button" onClick={() => void clear()} title="Nueva conversación" aria-label="Nueva conversación" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-slate-400 hover:bg-slate-100 hover:text-slate-700"><RotateCcw className="h-4 w-4" /></button>
          )}
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void send(text); } }}
            rows={1}
            placeholder="Escribe tu pregunta…"
            className="max-h-40 min-h-11 flex-1 resize-none rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-[15px] outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
          />
          <button type="submit" disabled={busy || !text.trim()} aria-label="Enviar" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-blue-600 text-white shadow-sm hover:bg-blue-700 disabled:opacity-40">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowUp className="h-5 w-5" />}
          </button>
        </form>
      </div>
    </div>
  );
}
