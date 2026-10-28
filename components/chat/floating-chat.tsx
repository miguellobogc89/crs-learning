// components/chat/floating-chat.tsx
"use client";

import {
  ArrowUp,
  ChevronDown,
  LoaderCircle,
  Maximize2,
  Minimize2,
  Plus,
  Sparkles,
  X,
} from "lucide-react";
import {
  useEffect,
  useRef,
  useState,
} from "react";
import type { KeyboardEvent, ReactNode } from "react";

import { cn } from "@/lib/utils";
import { ChatMessage } from "@/components/chat/chat-message";
import type { DataBlock } from "@/lib/assistant/data/tools";
import type { ProposalView } from "@/components/chat/proposal-card";

type ChatSource = {
  citationId: string;
  knowledgeSourceId: string;
  title: string;
  description: string | null;
  libraryId: string | null;
  libraryName: string | null;
  sourceType: "analysis" | "manual" | "file";
  fileName: string | null;
  score: number;
};

type ChatMessageData = {
  id: string;
  role: "user" | "assistant";
  content: string;
  sources: ChatSource[];
  dataBlocks?: DataBlock[];
  proposals?: ProposalView[];
};

type ChatConversation = {
  id: string;
  title: string;
  scope_type: string;
  scope_library_id: string | null;
  created_at: Date;
  updated_at: Date;
  knowledge_libraries: {
    id: string;
    name: string;
  } | null;
};

type FloatingChatProps = {
  conversations: ChatConversation[];
  hideTrigger?: boolean;
};

type ConversationResponse = {
  conversation: {
    id: string;
    title: string;
    messages: ChatMessageData[];
  };
};

type SendMessageResponse = {
  conversationId: string;
  message: ChatMessageData;
};

const suggestions = [
  "¿Cuánto he gastado por proveedor este año?",
  "Muéstrame el gasto por mes y categoría",
  "¿Cuál es el proceso de alta de proveedores?",
];

export function FloatingChat({
  conversations,
  hideTrigger = false,
}: FloatingChatProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isExpanded, setIsExpanded] =
    useState(false);

  const [
    showConversations,
    setShowConversations,
  ] = useState(false);

  const [message, setMessage] = useState("");
const [messages, setMessages] = useState<
  ChatMessageData[]
>([]);

  const [conversationId, setConversationId] =
    useState<string>();

  const [conversationList, setConversationList] =
    useState<ChatConversation[]>(conversations);

  const [isSending, setIsSending] =
    useState(false);

  const [
    isLoadingConversation,
    setIsLoadingConversation,
  ] = useState(false);

  const [errorMessage, setErrorMessage] =
    useState<string>();

  const scrollAreaRef =
    useRef<HTMLDivElement>(null);

  const messagesEndRef =
    useRef<HTMLDivElement>(null);

  const activeConversation =
    conversationList.find(
      (conversation) =>
        conversation.id === conversationId,
    );

useEffect(() => {
  window.dispatchEvent(
    new CustomEvent("crs:assistant-state", {
      detail: { isOpen },
    }),
  );
}, [isOpen]);

useEffect(() => {
  if (!isOpen) {
    return;
  }

  // Scroll only the conversation (never the page behind the panel).
  const area = scrollAreaRef.current;
  if (area) area.scrollTo({ top: area.scrollHeight, behavior: "smooth" });
}, [
  isOpen,
  messages,
  isSending,
  isLoadingConversation,
]);

function openChat() {
  setIsOpen(true);
}

useEffect(() => {
  function handleToggleAssistant() {
    setIsOpen((current) => {
      if (current) {
        setIsExpanded(false);
        setShowConversations(false);
      }

      return !current;
    });
  }

  window.addEventListener(
    "crs:toggle-assistant",
    handleToggleAssistant,
  );

  return () => {
    window.removeEventListener(
      "crs:toggle-assistant",
      handleToggleAssistant,
    );
  };
}, []);

  // Messages posted by the app itself (e.g. the assistant's follow-up after «Aplicar»).
  useEffect(() => {
    function handleAssistantMessage(event: Event) {
      const detail = (event as CustomEvent<ChatMessageData>).detail;
      if (!detail?.id) return;
      setMessages((current) => current.some((m) => m.id === detail.id) ? current : [...current, { ...detail, sources: detail.sources ?? [] }]);
    }
    window.addEventListener("crs:assistant-message", handleAssistantMessage);
    return () => window.removeEventListener("crs:assistant-message", handleAssistantMessage);
  }, []);

  function closeChat() {
    setIsOpen(false);
    setIsExpanded(false);
    setShowConversations(false);
  }

  function toggleExpanded() {
    setIsExpanded((current) => !current);
  }

  function startNewConversation() {
    setConversationId(undefined);
    setMessages([]);
    setMessage("");
    setErrorMessage(undefined);
    setShowConversations(false);
  }

  function handleKeyDown(
    event: KeyboardEvent<HTMLTextAreaElement>,
  ) {
    if (event.key !== "Enter") {
      return;
    }

    if (event.shiftKey) {
      return;
    }

    event.preventDefault();

    void sendMessage();
  }

  async function loadConversation(id: string) {
    if (
      isLoadingConversation ||
      isSending
    ) {
      return;
    }

    setShowConversations(false);
    setIsLoadingConversation(true);
    setErrorMessage(undefined);

    try {
      const response = await fetch(
        `/api/assistant/${id}`,
      );

      if (!response.ok) {
        const errorBody =
          await response.text();

        throw new Error(
          errorBody ||
            "No se pudo cargar la conversación.",
        );
      }

      const result =
        (await response.json()) as ConversationResponse;

      setConversationId(
        result.conversation.id,
      );

      setMessages(
        result.conversation.messages.map(
          (chatMessage) => ({
            ...chatMessage,
            sources:
              chatMessage.sources ?? [],
          }),
        ),
      );

      setMessage("");
    } catch (error) {
      console.error(error);

      setErrorMessage(
        "No se pudo cargar la conversación seleccionada.",
      );
    } finally {
      setIsLoadingConversation(false);
    }
  }

  async function sendMessage() {
    const content = message.trim();

    if (
      !content ||
      isSending ||
      isLoadingConversation
    ) {
      return;
    }

    const previousConversationId =
      conversationId;

    const userMessage: ChatMessageData = {
      id: crypto.randomUUID(),
      role: "user",
      content,
      sources: [],
    };

    setMessages((currentMessages) => [
      ...currentMessages,
      userMessage,
    ]);

    setMessage("");
    setIsSending(true);
    setErrorMessage(undefined);

    try {
      const response = await fetch(
        "/api/assistant",
        {
          method: "POST",
          headers: {
            "Content-Type":
              "application/json",
          },
          body: JSON.stringify({
            conversationId:
              previousConversationId,
            message: content,
          }),
        },
      );

      if (!response.ok) {
        const errorBody =
          await response.text();

        throw new Error(
          errorBody ||
            "Error enviando el mensaje.",
        );
      }

      const result =
        (await response.json()) as SendMessageResponse;

      setConversationId(
        result.conversationId,
      );

      setMessages((currentMessages) => [
        ...currentMessages,
        {
          ...result.message,
          sources:
            result.message.sources ?? [],
        },
      ]);

      if (!previousConversationId) {
        const newConversation: ChatConversation =
          {
            id: result.conversationId,
            title:
              buildConversationTitle(
                content,
              ),
            scope_type: "company",
            scope_library_id: null,
            created_at: new Date(),
            updated_at: new Date(),
            knowledge_libraries: null,
          };

        setConversationList(
          (currentConversations) => [
            newConversation,
            ...currentConversations.filter(
              (conversation) =>
                conversation.id !==
                result.conversationId,
            ),
          ],
        );

        return;
      }

      setConversationList(
        (currentConversations) => {
          const updatedConversation =
            currentConversations.find(
              (conversation) =>
                conversation.id ===
                previousConversationId,
            );

          if (!updatedConversation) {
            return currentConversations;
          }

          return [
            {
              ...updatedConversation,
              updated_at: new Date(),
            },
            ...currentConversations.filter(
              (conversation) =>
                conversation.id !==
                previousConversationId,
            ),
          ];
        },
      );
    } catch (error) {
      console.error(error);

      setErrorMessage(
        "No he podido responder en este momento. Inténtalo de nuevo.",
      );
    } finally {
      setIsSending(false);
    }
  }

  const panelWidth = isExpanded
    ? "w-full md:w-[52vw] md:min-w-[640px]"
    : "w-full sm:w-[440px]";

  return (
    <>
      {!hideTrigger && !isOpen && (
        <button
          type="button"
          onClick={openChat}
          aria-label="Abrir asistente"
          style={{ bottom: "var(--floating-chat-bottom)" }}
          className="group fixed right-6 z-50 flex h-12 items-center gap-2.5 rounded-2xl bg-[#0A58FF] pl-2 pr-4 text-white shadow-[0_16px_40px_-12px_rgba(10,88,255,0.55)] transition-all duration-300 hover:-translate-y-0.5 hover:bg-[#0848d6]"
        >
          <span className="flex size-8 items-center justify-center rounded-xl bg-white/15">
            <Sparkles className="size-4" />
          </span>
          <span className="hidden text-sm font-semibold sm:block">Asistente</span>
        </button>
      )}

      <aside
        className={cn(
          "fixed bottom-0 right-0 top-0 z-50 flex flex-col border-l border-slate-200 bg-white shadow-[-24px_0_60px_-30px_rgba(15,23,42,0.25)] transform-gpu transition-[transform,width] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] will-change-transform",
          isOpen ? "translate-x-0" : "translate-x-full",
          panelWidth,
        )}
      >
        {/* Header: who it is, the current conversation (click to switch) and the actions, in one row. */}
        <header className="relative flex h-14 shrink-0 items-center gap-2 border-b border-slate-100 px-3">
          <img src="/email/logo-mark.png" alt="" width={28} height={28} className="size-7 shrink-0 rounded-lg" />
          <button
            type="button"
            onClick={() => setShowConversations((current) => !current)}
            aria-expanded={showConversations}
            className="flex min-w-0 flex-1 items-center gap-1 rounded-lg px-1.5 py-1 text-left transition-colors hover:bg-slate-50"
          >
            <span className="min-w-0">
              <span className="block text-[13px] font-semibold leading-tight text-slate-900">Asistente</span>
              <span className="block truncate text-[11px] leading-tight text-slate-500">
                {activeConversation?.title ?? "Nueva conversación"}
              </span>
            </span>
            <ChevronDown className={cn("size-3.5 shrink-0 text-slate-400 transition-transform", showConversations && "rotate-180")} />
          </button>
          <div className="flex shrink-0 items-center">
            <IconButton label="Nueva conversación" onClick={startNewConversation}><Plus className="size-4" /></IconButton>
            <IconButton label={isExpanded ? "Reducir panel" : "Ampliar panel"} onClick={toggleExpanded}>
              {isExpanded ? <Minimize2 className="size-4" /> : <Maximize2 className="size-4" />}
            </IconButton>
            <IconButton label="Cerrar" onClick={closeChat}><X className="size-4" /></IconButton>
          </div>

          {showConversations && (
            <div className="absolute left-2 right-2 top-[calc(100%+4px)] z-30 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-[0_16px_40px_-12px_rgba(15,23,42,0.25)]">
              <button
                type="button"
                onClick={startNewConversation}
                className="flex w-full items-center gap-2 border-b border-slate-100 px-3 py-2.5 text-left text-[13px] font-medium text-[#0A58FF] hover:bg-slate-50"
              >
                <Plus className="size-4" />
                Nueva conversación
              </button>
              <div className="max-h-80 overflow-y-auto p-1">
                {conversationList.length === 0 ? (
                  <p className="px-3 py-6 text-center text-xs text-slate-500">Todavía no hay conversaciones.</p>
                ) : (
                  conversationList.map((conversation) => (
                    <button
                      key={conversation.id}
                      type="button"
                      disabled={isLoadingConversation || isSending}
                      onClick={() => { void loadConversation(conversation.id); }}
                      className={cn(
                        "block w-full rounded-lg px-3 py-2 text-left transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50",
                        conversation.id === conversationId && "bg-[#EDF3FF]",
                      )}
                    >
                      <span className={cn("block truncate text-[13px]", conversation.id === conversationId ? "font-semibold text-[#0A58FF]" : "text-slate-800")}>
                        {conversation.title}
                      </span>
                      <span className="block truncate text-[11px] text-slate-500">{getConversationScopeLabel(conversation)}</span>
                    </button>
                  ))
                )}
              </div>
            </div>
          )}
        </header>

        <div ref={scrollAreaRef} className="min-h-0 flex-1 overflow-y-auto overscroll-contain [scrollbar-gutter:stable]">
          <div className={cn("mx-auto flex min-h-full w-full flex-col px-3 py-3", isExpanded && "max-w-[920px] px-5")}>
            {isLoadingConversation ? (
              <div className="flex flex-1 items-center justify-center">
                <div className="flex items-center gap-2 text-xs text-slate-500">
                  <LoaderCircle className="size-4 animate-spin" />
                  Cargando conversación…
                </div>
              </div>
            ) : messages.length === 0 ? (
              <EmptyChat onSuggestionClick={setMessage} />
            ) : (
              <div className="flex flex-col gap-4">
                {messages.map((chatMessage) => (
                  <ChatMessage key={chatMessage.id} message={chatMessage} />
                ))}
                {isSending && <TypingIndicator />}
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>
        </div>

        <footer className="shrink-0 border-t border-slate-100 bg-white px-3 pb-2 pt-2.5">
          <div className={cn("mx-auto w-full", isExpanded && "max-w-[920px] px-2")}>
            {errorMessage && (
              <div className="mb-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">{errorMessage}</div>
            )}
            <div className="flex items-end gap-2 rounded-2xl border border-slate-200 bg-white p-1.5 pl-3 transition-colors focus-within:border-[#0A58FF]/50 focus-within:ring-4 focus-within:ring-[#0A58FF]/10">
              <textarea
                rows={1}
                value={message}
                disabled={isSending || isLoadingConversation}
                onChange={(event) => { setMessage(event.target.value); }}
                onKeyDown={handleKeyDown}
                placeholder={isSending ? "Pensando…" : "Pregunta por tus datos o documentos…"}
                className="max-h-32 min-h-9 flex-1 resize-none bg-transparent py-2 text-sm text-slate-900 outline-none placeholder:text-slate-400 disabled:cursor-not-allowed disabled:opacity-60"
              />
              <button
                type="button"
                onClick={() => { void sendMessage(); }}
                disabled={!message.trim() || isSending || isLoadingConversation}
                aria-label={isSending ? "Enviando mensaje" : "Enviar mensaje"}
                className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-[#0A58FF] text-white transition-colors hover:bg-[#0848d6] disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400"
              >
                {isSending ? <LoaderCircle className="size-4 animate-spin" /> : <ArrowUp className="size-4" />}
              </button>
            </div>
            <p className="mt-1.5 text-center text-[10px] text-slate-400">
              El asistente puede equivocarse. Revisa los datos importantes.
            </p>
          </div>
        </footer>
      </aside>
    </>
  );
}

function IconButton({ label, onClick, children }: { label: string; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className="flex size-8 items-center justify-center rounded-lg text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900"
    >
      {children}
    </button>
  );
}

function EmptyChat({
  onSuggestionClick,
}: {
  onSuggestionClick: (value: string) => void;
}) {
  return (
    <div className="flex flex-1 flex-col justify-center py-6">
      <span className="flex size-10 items-center justify-center rounded-xl bg-[#0A58FF]/10 text-[#0A58FF]">
        <Sparkles className="size-5" />
      </span>
      <h3 className="mt-3 text-lg font-semibold tracking-tight text-slate-900">¿En qué te ayudo?</h3>
      <p className="mt-1 text-[13px] leading-5 text-slate-500">
        Pregunta por tus facturas, gastos, productos o documentos. También puedo crear tablas y enlazarlas; tú decides si se aplican.
      </p>
      <div className="mt-4 grid gap-1.5">
        {suggestions.map((suggestion) => (
          <button
            key={suggestion}
            type="button"
            onClick={() => { onSuggestionClick(suggestion); }}
            className="group flex items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-left text-[13px] text-slate-700 transition-colors hover:border-[#0A58FF]/40 hover:bg-[#0A58FF]/[0.03] hover:text-slate-900"
          >
            <span>{suggestion}</span>
            <ArrowUp className="size-3.5 shrink-0 rotate-45 text-slate-300 transition-colors group-hover:text-[#0A58FF]" />
          </button>
        ))}
      </div>
    </div>
  );
}

function TypingIndicator() {
  return (
    <div className="flex items-center gap-2">
      <img src="/email/logo-mark.png" alt="" width={20} height={20} className="size-5 shrink-0 rounded-[5px]" />
      <div className="flex items-center gap-1 rounded-xl bg-slate-100 px-3 py-2.5">
        <span className="size-1.5 animate-bounce rounded-full bg-slate-400 [animation-delay:-0.3s]" />
        <span className="size-1.5 animate-bounce rounded-full bg-slate-400 [animation-delay:-0.15s]" />
        <span className="size-1.5 animate-bounce rounded-full bg-slate-400" />
      </div>
    </div>
  );
}

function getConversationScopeLabel(
  conversation: ChatConversation,
) {
  if (
    conversation.scope_type === "library" &&
    conversation.knowledge_libraries
  ) {
    return `Biblioteca · ${conversation.knowledge_libraries.name}`;
  }

  if (
    conversation.scope_type === "folder" &&
    conversation.knowledge_libraries
  ) {
    return `Carpeta · ${conversation.knowledge_libraries.name}`;
  }

  return "Toda la empresa";
}

function buildConversationTitle(
  message: string,
) {
  if (message.length <= 60) {
    return message;
  }

  return `${message.slice(0, 57)}...`;
}
