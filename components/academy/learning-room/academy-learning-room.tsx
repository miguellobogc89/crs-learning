
// components/academy/learning-room/academy-learning-room.tsx
"use client";

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  ArrowUp,
  BookOpen,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  GraduationCap,
  LoaderCircle,
  MessageCircle,
  PanelLeftClose,
  PanelLeftOpen,
  Sparkles,
  X,
} from "lucide-react";
import ReactMarkdown from "react-markdown";

import {
  academyTutorAction,
  type TutorMessage,
  type TutorReply,
} from "@/app/actions/academy-tutor";

type Lesson = {
  id: string;
  title: string;
  estimatedMinutes: number;
  completed: boolean;
};

type Module = {
  id: string;
  title: string;
  lessons: Lesson[];
};

type ConversationItem = {
  id: number;
  role: "user" | "assistant";
  content: string;
  visual?: TutorReply["visual"];
};

type Props = {
  courseId: string;
  courseTitle: string;
  modules: Module[];
  preview: boolean;
};

export function AcademyLearningRoom({
  courseId,
  courseTitle,
  modules,
  preview,
}: Props) {
  const allLessons = modules.flatMap((module) =>
    module.lessons.map((lesson) => ({
      ...lesson,
      moduleId: module.id,
      moduleTitle: module.title,
    })),
  );

  const firstPending =
    allLessons.find((lesson) => !lesson.completed) ??
    allLessons[0];

  const [lessonId, setLessonId] = useState(
    firstPending?.id ?? "",
  );

  const [messages, setMessages] = useState<ConversationItem[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [expandedModule, setExpandedModule] = useState(
    firstPending?.moduleId ?? modules[0]?.id ?? "",
  );

  const sequence = useRef(0);
  const requestId = useRef(0);
  const bottomRef = useRef<HTMLDivElement>(null);

  const currentIndex = allLessons.findIndex(
    (lesson) => lesson.id === lessonId,
  );

  const current = allLessons[currentIndex];
  const next = allLessons[currentIndex + 1];

  const completedCount = allLessons.filter(
    (lesson) => lesson.completed,
  ).length;

  const progress = allLessons.length
    ? Math.round((completedCount / allLessons.length) * 100)
    : 0;

  const askTutor = useCallback(
    async (
      targetLessonId: string,
      history: TutorMessage[],
      activeRequest: number,
    ) => {
      setBusy(true);
      setError(null);

      try {
        const result = await academyTutorAction({
          courseId,
          lessonId: targetLessonId,
          history,
        });

        if (requestId.current !== activeRequest) return;

        if (!result.ok) {
          throw new Error(result.error);
        }

        setMessages((existing) => [
          ...existing,
          {
            id: ++sequence.current,
            role: "assistant",
            content: result.reply.message,
            visual: result.reply.visual,
          },
        ]);
      } catch (cause) {
        if (requestId.current !== activeRequest) return;

        setError(
          cause instanceof Error
            ? cause.message
            : "Se ha interrumpido la conversación.",
        );
      } finally {
        if (requestId.current === activeRequest) {
          setBusy(false);
        }
      }
    },
    [courseId],
  );

  useEffect(() => {
    if (!lessonId) return;

    const activeRequest = ++requestId.current;

    setMessages([]);
    setDraft("");
    setError(null);

    void askTutor(lessonId, [], activeRequest);

    return () => {
      requestId.current += 1;
    };
  }, [lessonId, askTutor]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({
      behavior: "smooth",
      block: "end",
    });
  }, [messages, busy]);

  function sendMessage() {
    const text = draft.trim();

    if (!text || busy || !current) return;

    const userMessage: ConversationItem = {
      id: ++sequence.current,
      role: "user",
      content: text,
    };

    const updated = [...messages, userMessage];

    setMessages(updated);
    setDraft("");

    const history: TutorMessage[] = updated.map(
      ({ role, content }) => ({ role, content }),
    );

    void askTutor(
      current.id,
      history.slice(-16),
      ++requestId.current,
    );
  }

  function selectLesson(id: string, moduleId: string) {
    if (id === lessonId) return;

    setExpandedModule(moduleId);
    setLessonId(id);
  }

  return (
    <div className="flex h-dvh min-h-0 w-full overflow-hidden bg-[#F6F8FC] text-[#07113D]">
      {sidebarOpen && (
        <aside className="flex h-full w-[280px] shrink-0 flex-col border-r border-slate-200 bg-white xl:w-[320px]">
          <div className="border-b border-slate-100 px-5 py-5">
            <div className="flex items-center gap-2 text-[#315BFF]">
              <GraduationCap className="h-5 w-5" />
              <span className="text-xs font-bold uppercase tracking-wider">
                Academy
              </span>
            </div>

            <h2 className="mt-4 line-clamp-2 text-base font-bold">
              {courseTitle}
            </h2>

            {preview && (
              <span className="mt-2 inline-flex rounded-md bg-amber-50 px-2 py-1 text-[11px] font-medium text-amber-700">
                Vista previa · Borrador
              </span>
            )}

            <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-slate-100">
              <div
                className="h-full rounded-full bg-[#315BFF]"
                style={{ width: `${progress}%` }}
              />
            </div>

            <p className="mt-2 text-xs text-slate-500">
              {completedCount} de {allLessons.length} lecciones completadas
            </p>
          </div>

          <nav className="min-h-0 flex-1 overflow-y-auto p-3">
            <p className="px-2 py-3 text-[11px] font-bold uppercase tracking-wide text-slate-400">
              Programa de formación
            </p>

            <div className="space-y-2">
              {modules.map((module, index) => {
                const open = expandedModule === module.id;

                return (
                  <div key={module.id}>
                    <button
                      type="button"
                      onClick={() =>
                        setExpandedModule(open ? "" : module.id)
                      }
                      className="flex w-full items-center gap-2 rounded-lg px-3 py-3 text-left hover:bg-slate-50"
                    >
                      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[#EDF3FF] text-xs font-semibold text-[#315BFF]">
                        {index + 1}
                      </span>

                      <span className="min-w-0 flex-1 text-xs font-semibold">
                        {module.title}
                      </span>

                      <ChevronDown
                        className={`h-4 w-4 shrink-0 text-slate-400 transition-transform ${
                          open ? "rotate-180" : ""
                        }`}
                      />
                    </button>

                    {open && (
                      <div className="ml-4 space-y-1 border-l border-slate-100 pl-3">
                        {module.lessons.map((lesson) => {
                          const active = lesson.id === lessonId;

                          return (
                            <button
                              key={lesson.id}
                              type="button"
                              onClick={() =>
                                selectLesson(lesson.id, module.id)
                              }
                              className={`flex w-full items-start gap-2 rounded-lg px-3 py-2.5 text-left ${
                                active
                                  ? "bg-[#EDF3FF] text-[#315BFF]"
                                  : "text-slate-600 hover:bg-slate-50"
                              }`}
                            >
                              {lesson.completed ? (
                                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                              ) : (
                                <BookOpen className="mt-0.5 h-4 w-4 shrink-0" />
                              )}

                              <span className="min-w-0 flex-1 text-xs leading-relaxed">
                                {lesson.title}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </nav>

          <div className="border-t border-slate-100 p-4">
            <Link
              href={`/courses/${courseId}`}
              className="flex items-center justify-center gap-2 rounded-lg border border-slate-200 px-4 py-3 text-xs font-semibold hover:bg-slate-50"
            >
              <X className="h-4 w-4" />
              Salir del aula
            </Link>
          </div>
        </aside>
      )}

      <main className="flex min-h-0 min-w-0 flex-1 flex-col">
        <header className="flex shrink-0 items-center gap-3 border-b border-slate-200 bg-white px-4 py-3 xl:px-6">
          <button
            type="button"
            onClick={() => setSidebarOpen((value) => !value)}
            aria-label={sidebarOpen ? "Ocultar temario" : "Mostrar temario"}
            className="rounded-lg p-2 hover:bg-slate-100"
          >
            {sidebarOpen ? (
              <PanelLeftClose className="h-5 w-5" />
            ) : (
              <PanelLeftOpen className="h-5 w-5" />
            )}
          </button>

          <div className="min-w-0 flex-1">
            <p className="truncate text-xs text-slate-500">
              {current?.moduleTitle ?? courseTitle}
            </p>
            <h1 className="truncate text-sm font-bold xl:text-base">
              {current?.title ?? "Aula"}
            </h1>
          </div>

          <Link
            href={`/courses/${courseId}`}
            className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"
            aria-label="Cerrar aula"
          >
            <X className="h-5 w-5" />
          </Link>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-6 xl:px-8">
          <div className="mx-auto w-full max-w-[850px] space-y-5">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#315BFF] text-white">
                <Sparkles className="h-5 w-5" />
              </div>

              <div>
                <p className="text-sm font-bold">Profesor Academy</p>
                <p className="text-xs text-slate-500">
                  Tu formación, paso a paso
                </p>
              </div>
            </div>

            {messages.map((message) => (
              <div
                key={message.id}
                className={`flex ${
                  message.role === "user"
                    ? "justify-end"
                    : "justify-start"
                }`}
              >
                <div
                  className={`min-w-0 max-w-[92%] rounded-2xl p-4 text-sm leading-relaxed ${
                    message.role === "user"
                      ? "bg-[#315BFF] text-white"
                      : "border border-slate-200 bg-white text-slate-700"
                  }`}
                >
                  <div className="prose prose-sm max-w-none break-words prose-headings:text-inherit prose-p:my-2 prose-strong:text-inherit">
                    <ReactMarkdown>{message.content}</ReactMarkdown>
                  </div>

                  {message.visual && (
                    <div className="mt-4 rounded-xl border border-[#DFE6FF] bg-[#F7F9FF] p-4">
                      <div className="mb-3 flex items-center gap-2">
                        <BookOpen className="h-4 w-4 text-[#315BFF]" />
                        <p className="text-xs font-bold text-[#07113D]">
                          {message.visual.title}
                        </p>
                      </div>

                      <div className="grid gap-2 sm:grid-cols-2">
                        {message.visual.items.map((item, index) => (
                          <div
                            key={`${index}-${item.label}`}
                            className="rounded-lg border border-slate-100 bg-white p-3"
                          >
                            <p className="text-xs font-semibold text-[#315BFF]">
                              {item.label}
                            </p>
                            <p className="mt-1 text-xs leading-relaxed text-slate-600">
                              {item.description}
                            </p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ))}

            {busy && (
              <div className="flex items-center gap-2 text-xs text-slate-500">
                <LoaderCircle className="h-4 w-4 animate-spin text-[#315BFF]" />
                El profesor está preparando su respuesta...
              </div>
            )}

            {error && (
              <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-xs text-red-700">
                {error}
                <button
                  type="button"
                  disabled={busy || !current}
                  onClick={() => {
                    const history: TutorMessage[] = messages.map(
                      ({ role, content }) => ({ role, content }),
                    );

                    void askTutor(
                      current.id,
                      history,
                      ++requestId.current,
                    );
                  }}
                  className="ml-2 font-semibold underline disabled:opacity-50"
                >
                  Reintentar
                </button>
              </div>
            )}

            <div ref={bottomRef} />
          </div>
        </div>

        <footer className="shrink-0 border-t border-slate-200 bg-white px-4 py-4 xl:px-8">
          <div className="mx-auto max-w-[850px]">
            <div className="flex items-end gap-3 rounded-2xl border border-slate-200 bg-[#F8FAFD] p-2 focus-within:border-[#315BFF]">
              <textarea
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    sendMessage();
                  }
                }}
                disabled={busy}
                rows={2}
                placeholder="Responde al profesor o haz una pregunta..."
                className="max-h-32 min-h-12 min-w-0 flex-1 resize-none bg-transparent px-3 py-2 text-sm outline-none placeholder:text-slate-400"
              />

              <button
                type="button"
                onClick={sendMessage}
                disabled={busy || !draft.trim()}
                aria-label="Enviar respuesta"
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#315BFF] text-white disabled:opacity-40"
              >
                <ArrowUp className="h-5 w-5" />
              </button>
            </div>

            <div className="mt-3 flex items-center justify-between gap-3">
              <p className="flex items-center gap-1.5 text-[11px] text-slate-400">
                <MessageCircle className="h-3.5 w-3.5" />
                Conversación por texto · Versión inicial
              </p>

              {next && (
                <button
                  type="button"
                  onClick={() => selectLesson(next.id, next.moduleId)}
                  className="flex shrink-0 items-center gap-1 text-xs font-semibold text-[#315BFF] hover:underline"
                >
                  Siguiente lección
                  <ChevronRight className="h-4 w-4" />
                </button>
              )}
            </div>
          </div>
        </footer>
      </main>
    </div>
  );
}
