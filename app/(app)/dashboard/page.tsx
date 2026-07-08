// app/dashboard/page.tsx
import {
  Bot,
  ChevronDown,
  FileText,
  Library,
  MessageSquare,
  Plus,
  Search,
  Send,
  Sparkles,
} from "lucide-react";
import { auth } from "@/auth";
import { listChatConversations } from "@/lib/services/chat.service";
import { ChatComposer } from "@/components/assistant/chat-composer";

const suggestions = [
  "Resume los puntos clave de esta biblioteca",
  "¿Qué documentos hablan de onboarding?",
  "Convierte este conocimiento en un procedimiento paso a paso",
];

const sources = [
  "Manual de bienvenida.pdf",
  "Proceso comercial interno.docx",
  "Guía de uso del CRM.pdf",
];

export default async function DashboardPage() {
  const session = await auth();

  if (!session?.user?.id) {
    return null;
  }

  const conversations = await listChatConversations(session.user.id);

  return (

    <main className="grid h-full grid-cols-[280px_minmax(0,1fr)] overflow-hidden bg-background">
      <ChatHistory conversations={conversations} />
      <ChatPanel />
    </main>
  );
}

type ChatConversation = Awaited<ReturnType<typeof listChatConversations>>[number];

function ChatHistory({
  conversations,
}: {
  conversations: ChatConversation[];
}) {
  return (
    <aside className="flex min-h-0 flex-col border-r border-border bg-panel">
      <div className="border-b border-border p-4">
        <button className="flex w-full items-center justify-center gap-2 rounded-lg bg-brand px-3 py-2 text-sm font-semibold text-white transition hover:bg-brand-hover">
          <Plus className="h-4 w-4" />
          Nueva conversación
        </button>
      </div>

      <div className="border-b border-border p-4">
        <div className="flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2 text-sm text-muted-foreground">
          <Search className="h-4 w-4" />
          <span>Buscar conversación...</span>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        <p className="mb-2 px-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          Historial
        </p>

        <div className="space-y-1">
          {conversations.map((conversation) => {
            let className =
              "w-full rounded-lg border border-transparent px-3 py-2 text-left transition hover:border-border hover:bg-surface/60";

            if (false) {
              className =
                "w-full rounded-lg border border-brand/30 bg-brand-soft px-3 py-2 text-left";
            }

            return (
              <button key={conversation.id} className={className}>
                <span className="block truncate text-sm font-medium text-foreground">
                  {conversation.title}
                </span>
                <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                  {getConversationScopeLabel(conversation)}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </aside>
  );
}

function ChatPanel() {
  return (
    <section className="flex min-h-0 flex-col bg-background">
      <ChatHeader />

      <div className="min-h-0 flex-1 overflow-y-auto px-8 py-8">
        <div className="mx-auto flex max-w-4xl flex-col gap-8">
          <WelcomeBlock />
          <AssistantAnswer />
        </div>
      </div>

      <ChatComposer />
    </section>
  );
}

function ChatHeader() {
  return (
    <header className="flex items-center justify-between border-b border-border bg-background px-8 py-4">
      <div className="flex items-center gap-2">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-soft text-brand">
          <Bot className="h-4 w-4" />
        </div>

        <div>
          <h1 className="text-sm font-semibold text-foreground">
            CRS Knowledge Chat
          </h1>
          <p className="text-xs text-muted-foreground">
            Conversa con el conocimiento sintetizado de la empresa.
          </p>
        </div>
      </div>

      <button className="flex items-center gap-2 rounded-lg border border-border bg-panel px-3 py-2 text-sm text-foreground transition hover:bg-surface">
        <Library className="h-4 w-4 text-muted-foreground" />
        Toda la empresa
        <ChevronDown className="h-4 w-4 text-muted-foreground" />
      </button>
    </header>
  );
}

function WelcomeBlock() {
  return (
    <div className="rounded-2xl border border-border bg-panel p-6">
      <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-xl bg-brand-soft text-brand">
        <Sparkles className="h-5 w-5" />
      </div>

      <h2 className="text-xl font-semibold tracking-tight text-foreground">
        ¿Qué necesitas saber?
      </h2>

      <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
        Pregunta sobre procedimientos, políticas, procesos internos o cualquier
        conocimiento generado desde la Library.
      </p>

      <div className="mt-5 grid gap-2 md:grid-cols-3">
        {suggestions.map((suggestion) => (
          <button
            key={suggestion}
            className="rounded-xl border border-border bg-background px-4 py-3 text-left text-sm text-foreground transition hover:bg-surface"
          >
            {suggestion}
          </button>
        ))}
      </div>
    </div>
  );
}

function AssistantAnswer() {
  return (
    <div className="flex gap-4">
      <div className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand-soft text-brand">
        <Bot className="h-4 w-4" />
      </div>

      <article className="min-w-0 flex-1 rounded-2xl border border-border bg-panel p-5">
        <p className="text-sm leading-6 text-foreground">
          Puedo responder usando el conocimiento ya sintetizado por la IA y
          mantener trazabilidad hacia los documentos originales. Esta primera
          versión deja preparada la experiencia principal: historial a la
          izquierda, conversación en el centro y selector de alcance arriba.
        </p>

        <div className="mt-5 rounded-xl border border-border bg-background p-4">
          <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Fuentes relacionadas
          </p>

          <div className="space-y-2">
            {sources.map((source) => (
              <div
                key={source}
                className="flex items-center gap-2 rounded-lg border border-border bg-panel px-3 py-2 text-sm text-foreground"
              >
                <FileText className="h-4 w-4 text-muted-foreground" />
                {source}
              </div>
            ))}
          </div>
        </div>
      </article>
    </div>
  );
}

<ChatComposer />

function getConversationScopeLabel(conversation: ChatConversation) {
  if (conversation.scope_type === "library" && conversation.knowledge_libraries) {
    return `Biblioteca · ${conversation.knowledge_libraries.name}`;
  }

  if (conversation.scope_type === "folder" && conversation.knowledge_libraries) {
    return `Carpeta · ${conversation.knowledge_libraries.name}`;
  }

  return "Toda la empresa";
}