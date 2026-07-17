// components/chat/floating-chat.tsx
"use client";

import {
  Bot,
  ChevronDown,
  LoaderCircle,
  Maximize2,
  MessageCircle,
  Minimize2,
  MoreHorizontal,
  Paperclip,
  Plus,
  Send,
  Sparkles,
  X,
} from "lucide-react";
import {
  useEffect,
  useRef,
  useState,
} from "react";
import type { KeyboardEvent } from "react";

import { cn } from "@/lib/utils";
import { ChatMessage } from "@/components/chat/chat-message";

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
  "¿Cuál es el proceso de alta de proveedores?",
  "Resume las políticas de teletrabajo",
  "Busca contradicciones en Compras",
];

export function FloatingChat({
  conversations,
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

  const messagesEndRef =
    useRef<HTMLDivElement>(null);

  const activeConversation =
    conversationList.find(
      (conversation) =>
        conversation.id === conversationId,
    );

  useEffect(() => {
    setConversationList(conversations);
  }, [conversations]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    messagesEndRef.current?.scrollIntoView({
      behavior: "smooth",
      block: "end",
    });
  }, [
    isOpen,
    messages,
    isSending,
    isLoadingConversation,
  ]);

  function openChat() {
    setIsOpen(true);
  }

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

  return (
    <>
      {!isOpen && (
        <button
          type="button"
          onClick={openChat}
          aria-label="Abrir asistente"
          className="
            group fixed bottom-6 right-6 z-50
            flex h-14 items-center gap-3
            overflow-hidden rounded-2xl
            border border-white/20
            bg-neutral-950 px-4 text-white
            shadow-[0_20px_60px_-15px_rgba(0,0,0,0.55)]
            transition-all duration-300
            hover:-translate-y-1
            hover:shadow-[0_24px_70px_-15px_rgba(0,0,0,0.65)]
            active:translate-y-0
          "
        >
          <span className="relative flex h-9 w-9 items-center justify-center rounded-xl bg-white/10">
            <Sparkles className="h-[18px] w-[18px]" />

            <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full border-2 border-neutral-950 bg-emerald-400" />
          </span>

          <span className="hidden pr-1 text-left sm:block">
            <span className="block text-sm font-medium leading-none">
              Pregunta a CRS
            </span>

            <span className="mt-1 block text-[11px] text-white/55">
              Tu conocimiento, al instante
            </span>
          </span>
        </button>
      )}

      <aside
        className={cn(
          `
            fixed bottom-0 right-0 top-0 z-50
            flex translate-x-full flex-col
            border-l border-border/70
            bg-background/95
            shadow-[-24px_0_80px_-35px_rgba(0,0,0,0.35)]
            backdrop-blur-2xl
            transition-[width,transform]
            duration-300 ease-out
          `,
          isOpen && "translate-x-0",
          isExpanded
            ? "w-full md:w-[48vw]"
            : "w-full sm:w-[430px] xl:w-[25vw] xl:min-w-[400px]",
        )}
      >
        <header className="flex h-[72px] shrink-0 items-center justify-between border-b border-border/70 px-5">
          <div className="flex min-w-0 items-center gap-3">
            <div className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-neutral-950 text-white shadow-sm">
              <Bot className="h-5 w-5" />

              <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-background bg-emerald-400" />
            </div>

            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h2 className="truncate text-sm font-semibold">
                  CRS Intelligence
                </h2>

                <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-600">
                  Online
                </span>
              </div>

              <p className="truncate text-xs text-muted-foreground">
                Conectado al conocimiento de tu
                empresa
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={toggleExpanded}
              className="flex h-9 w-9 items-center justify-center rounded-xl text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              aria-label="Cambiar tamaño del panel"
            >
              {isExpanded ? (
                <Minimize2 className="h-[17px] w-[17px]" />
              ) : (
                <Maximize2 className="h-[17px] w-[17px]" />
              )}
            </button>

            <button
              type="button"
              className="flex h-9 w-9 items-center justify-center rounded-xl text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              aria-label="Más opciones"
            >
              <MoreHorizontal className="h-[18px] w-[18px]" />
            </button>

            <button
              type="button"
              onClick={closeChat}
              className="flex h-9 w-9 items-center justify-center rounded-xl text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              aria-label="Cerrar chat"
            >
              <X className="h-[18px] w-[18px]" />
            </button>
          </div>
        </header>

        <div className="flex min-h-0 flex-1 flex-col">
          <div className="relative border-b border-border/50 px-5 py-3">
            <button
              type="button"
              onClick={() => {
                setShowConversations(
                  (current) => !current,
                );
              }}
              className="flex w-full items-center justify-between rounded-xl px-1 py-1 text-left"
            >
              <div className="min-w-0">
                <p className="text-xs font-medium">
                  Conversación actual
                </p>

                <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
                  {activeConversation?.title ??
                    "Nueva conversación"}
                </p>
              </div>

              <ChevronDown
                className={cn(
                  "h-4 w-4 shrink-0 text-muted-foreground transition-transform",
                  showConversations &&
                    "rotate-180",
                )}
              />
            </button>

            {showConversations && (
              <div className="absolute left-4 right-4 top-[calc(100%-4px)] z-30 overflow-hidden rounded-2xl border border-border bg-background shadow-2xl">
                <div className="border-b border-border p-2">
                  <button
                    type="button"
                    onClick={
                      startNewConversation
                    }
                    className="flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-left text-sm font-medium transition-colors hover:bg-muted"
                  >
                    <Plus className="h-4 w-4 text-brand" />
                    Nueva conversación
                  </button>
                </div>

                <div className="max-h-80 overflow-y-auto p-2">
                  {conversationList.length ===
                  0 ? (
                    <p className="px-3 py-6 text-center text-xs text-muted-foreground">
                      Todavía no hay
                      conversaciones.
                    </p>
                  ) : (
                    <div className="space-y-1">
                      {conversationList.map(
                        (conversation) => (
                          <button
                            key={
                              conversation.id
                            }
                            type="button"
                            disabled={
                              isLoadingConversation ||
                              isSending
                            }
                            onClick={() => {
                              void loadConversation(
                                conversation.id,
                              );
                            }}
                            className={cn(
                              "w-full rounded-xl px-3 py-2.5 text-left transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50",
                              conversation.id ===
                                conversationId &&
                                "bg-brand-soft",
                            )}
                          >
                            <span className="block truncate text-sm font-medium text-foreground">
                              {
                                conversation.title
                              }
                            </span>

                            <span className="mt-0.5 block truncate text-[11px] text-muted-foreground">
                              {getConversationScopeLabel(
                                conversation,
                              )}
                            </span>
                          </button>
                        ),
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-6">
            <div
              className={cn(
                "flex min-h-full w-full flex-col",
                isExpanded &&
                  "px-6 lg:px-10",
              )}
            >
              {isLoadingConversation ? (
                <div className="flex flex-1 items-center justify-center">
                  <div className="flex flex-col items-center gap-3 text-muted-foreground">
                    <LoaderCircle className="h-6 w-6 animate-spin" />

                    <p className="text-xs">
                      Cargando conversación...
                    </p>
                  </div>
                </div>
              ) : messages.length === 0 ? (
                <EmptyChat
                  onSuggestionClick={
                    setMessage
                  }
                />
              ) : (
                <div className="flex flex-col gap-5">
{messages.map((chatMessage) => (
  <ChatMessage
    key={chatMessage.id}
    message={chatMessage}
  />
))}

                  {isSending && (
                    <TypingIndicator />
                  )}
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>
          </div>

          <footer className="shrink-0 border-t border-border/70 bg-background/90 p-4 backdrop-blur-xl">
            {errorMessage && (
              <div className="mb-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                {errorMessage}
              </div>
            )}

            <div
              className="
                rounded-[22px] border
                border-border bg-card p-2
                shadow-[0_10px_35px_-20px_rgba(0,0,0,0.3)]
                transition-shadow
                focus-within:shadow-[0_14px_40px_-20px_rgba(0,0,0,0.4)]
              "
            >
              <textarea
                rows={1}
                value={message}
                disabled={
                  isSending ||
                  isLoadingConversation
                }
                onChange={(event) => {
                  setMessage(
                    event.target.value,
                  );
                }}
                onKeyDown={handleKeyDown}
                placeholder={
                  isSending
                    ? "Consultando el conocimiento..."
                    : "Pregunta sobre el conocimiento de tu empresa..."
                }
                className="
                  max-h-32 min-h-12 w-full
                  resize-none bg-transparent
                  px-3 py-3 text-sm outline-none
                  placeholder:text-muted-foreground
                  disabled:cursor-not-allowed
                  disabled:opacity-60
                "
              />

              <div className="flex items-center justify-between px-1 pb-1">
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    className="flex h-9 w-9 items-center justify-center rounded-xl text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                    aria-label="Adjuntar archivo"
                  >
                    <Paperclip className="h-[17px] w-[17px]" />
                  </button>

                  <button
                    type="button"
                    className="flex h-9 items-center gap-2 rounded-xl px-3 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                  >
                    <Sparkles className="h-3.5 w-3.5" />
                    Knowledge
                  </button>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    void sendMessage();
                  }}
                  disabled={
                    !message.trim() ||
                    isSending ||
                    isLoadingConversation
                  }
                  className="
                    flex h-9 w-9 items-center
                    justify-center rounded-xl
                    bg-neutral-950 text-white
                    shadow-sm transition-all
                    hover:scale-[1.03]
                    hover:bg-neutral-800
                    active:scale-95
                    disabled:cursor-not-allowed
                    disabled:opacity-40
                    disabled:hover:scale-100
                  "
                  aria-label={
                    isSending
                      ? "Enviando mensaje"
                      : "Enviar mensaje"
                  }
                >
                  {isSending ? (
                    <LoaderCircle className="h-4 w-4 animate-spin" />
                  ) : (
                    <Send className="h-4 w-4" />
                  )}
                </button>
              </div>
            </div>

            <p className="mt-2 text-center text-[10px] text-muted-foreground">
              CRS puede cometer errores.
              Comprueba la documentación
              enlazada.
            </p>
          </footer>
        </div>
      </aside>
    </>
  );
}

function EmptyChat({
  onSuggestionClick,
}: {
  onSuggestionClick: (value: string) => void;
}) {
  return (
    <>
      <div className="mb-8">
        <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-neutral-950 text-white shadow-sm">
          <Sparkles className="h-5 w-5" />
        </div>

        <h3 className="text-xl font-semibold tracking-tight">
          ¿En qué puedo ayudarte?
        </h3>

        <p className="mt-2 max-w-md text-sm leading-6 text-muted-foreground">
          Pregunta sobre procesos,
          documentación, políticas o cualquier
          conocimiento disponible en tu empresa.
        </p>
      </div>

      <div className="grid gap-2">
        {suggestions.map((suggestion) => (
          <button
            key={suggestion}
            type="button"
            onClick={() => {
              onSuggestionClick(suggestion);
            }}
            className="
              group flex items-center
              justify-between rounded-2xl
              border border-border/70 bg-card
              px-4 py-3.5 text-left text-sm
              transition-all
              hover:-translate-y-0.5
              hover:border-border
              hover:bg-muted/50 hover:shadow-sm
            "
          >
            <span>{suggestion}</span>

            <MessageCircle className="h-4 w-4 text-muted-foreground transition-colors group-hover:text-foreground" />
          </button>
        ))}
      </div>

      <div className="mt-auto pt-8">
        <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
          Respuestas basadas únicamente en
          contenido autorizado
        </div>
      </div>
    </>
  );
}


function TypingIndicator() {
  return (
    <div className="flex justify-start">
      <div className="flex items-center gap-3 rounded-2xl rounded-bl-md border border-border bg-card px-4 py-3 shadow-sm">
        <Bot className="h-4 w-4 text-brand" />

        <div className="flex items-center gap-1">
          <span className="h-2 w-2 animate-bounce rounded-full bg-muted-foreground [animation-delay:-0.3s]" />
          <span className="h-2 w-2 animate-bounce rounded-full bg-muted-foreground [animation-delay:-0.15s]" />
          <span className="h-2 w-2 animate-bounce rounded-full bg-muted-foreground" />
        </div>
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