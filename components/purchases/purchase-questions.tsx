"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle } from "lucide-react";

/**
 * The purchase questions in the chat (lib/purchases/conversation.service): a conversation of their own, kept in the
 * list with an alert while something is pending. Opening the chat creates or continues it.
 */
export const PURCHASE_QUESTIONS_TITLE = "Preguntas sobre tus facturas";
export type PurchaseQuestionsState = { conversationId: string | null; pendientes: number };

export function usePurchaseQuestions(chatOpen: boolean) {
  const [state, setState] = useState<PurchaseQuestionsState>({ conversationId: null, pendientes: 0 });
  const refresh = useCallback(async () => {
    try {
      const r = await fetch("/api/purchases/conversation", { method: "POST" });
      if (r.ok) setState(await r.json() as PurchaseQuestionsState);
    } catch { /* the chat works the same without it */ }
  }, []);
  useEffect(() => { if (chatOpen) void refresh(); }, [chatOpen, refresh]);
  return { ...state, refresh };
}

/** Marks the questions conversation while it waits for answers. */
export function PurchaseAlert({ className }: { className?: string }) {
  return <AlertTriangle aria-label="Preguntas pendientes" className={className ?? "size-3.5 shrink-0 text-amber-600"} />;
}

/** In an empty chat: a way back to the pending questions. */
export function PurchaseQuestionsBanner({ pendientes, onOpen }: { pendientes: number; onOpen: () => void }) {
  if (!pendientes) return null;
  return <button type="button" onClick={onOpen}
    className="mt-4 flex w-full items-start gap-3 rounded-xl border border-amber-200 bg-amber-50/70 px-3 py-2.5 text-left transition-colors hover:border-amber-300 hover:bg-amber-50">
    <PurchaseAlert className="mt-0.5 size-4 shrink-0 text-amber-700" />
    <span className="min-w-0 flex-1 text-[13px] leading-5 text-slate-700">
      <span className="font-semibold text-slate-900">Tengo {pendientes === 1 ? "una pregunta" : `${pendientes.toLocaleString("es-ES")} preguntas`} sobre tus facturas.</span>
      <span className="mt-0.5 block font-medium text-[#0A58FF]">Ir a las preguntas</span>
    </span>
  </button>;
}
