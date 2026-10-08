"use client";
// components/academy/learning-room/academy-didactic-room.tsx
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { ArrowLeft, ArrowRight, BookOpen, CheckCircle2, ChevronDown, ChevronUp, GraduationCap, LoaderCircle, RotateCcw, Sparkles, X } from "lucide-react";
import { generateLessonDidacticAction, getLessonDidacticAction } from "@/app/actions/academy-didactic";
import type { DidacticPackage } from "@/lib/academy/didactic-package";
import { DidacticVisual } from "./didactic-visual";
import { DidacticActivity } from "./didactic-activity";
import { AcademyInteraction } from "./academy-interaction";
type Lesson = { id: string; title: string; estimatedMinutes: number; completed: boolean };
type Module = { id: string; title: string; lessons: Lesson[] };
type Props = { courseId: string; courseTitle: string; modules: Module[]; preview: boolean; canManage: boolean };
const PHASE_LABELS = { introduction: "Introducción", development: "Desarrollo", assessment: "Práctica", reflection: "Reflexión" } as const;
const TYPE_LABELS = { concept: "Concepto", comparison: "Comparación", case: "Caso", process: "Proceso", exercise: "Ejercicio", summary: "Resumen", decision: "Decisión", simulation: "Simulación", analysis: "Análisis", demonstration: "Demostración" } as const;
export function AcademyDidacticRoom({ courseId, courseTitle, modules, preview, canManage }: Props) {
  const lessons = modules.flatMap(m => m.lessons.map(l => ({ ...l, moduleTitle: m.title })));
  const [lessonId, setLessonId] = useState(lessons.find(l => !l.completed)?.id ?? lessons[0]?.id ?? "");
  const [didactic, setDidactic] = useState<DidacticPackage | null>(null);
  const [screenIndex, setScreenIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showTeacher, setShowTeacher] = useState(false);
  const [showOutline, setShowOutline] = useState(false);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [reviewed, setReviewed] = useState<Record<string, boolean>>({});
  const currentLesson = lessons.find(l => l.id === lessonId);
  const loadLesson = useCallback(async (id: string) => {
    setLoading(true); setError(null); setDidactic(null); setScreenIndex(0); setAnswers({}); setReviewed({});
    try { const result = await getLessonDidacticAction({ courseId, lessonId: id }); if (!result.ok) throw new Error(result.error); setDidactic(result.package); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "No se ha podido cargar la lección."); }
    finally { setLoading(false); }
  }, [courseId]);
  useEffect(() => { if (lessonId) void loadLesson(lessonId); else setLoading(false); }, [lessonId, loadLesson]);
  async function generateLesson() {
    if (!lessonId || generating || !canManage) return;
    setGenerating(true); setError(null);
    try { const result = await generateLessonDidacticAction({ courseId, lessonId }); if (!result.ok) throw new Error(result.error); setDidactic(result.package); setScreenIndex(0); setAnswers({}); setReviewed({}); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "No se ha podido generar la clase."); }
    finally { setGenerating(false); }
  }
  const screens = didactic?.screens ?? [];
  const screen = screens[screenIndex];
  const isLast = screenIndex === screens.length - 1;
  const ready = (!screen?.activity && !screen?.interaction) || Boolean(reviewed[screen.id]);
  const progress = screens.length ? Math.round((screenIndex + 1) / screens.length * 100) : 0;
  return <div className="flex h-full min-h-0 w-full overflow-hidden bg-[#F7F7FA] text-[#17203C]">
    {showOutline && <aside className="flex h-full w-[270px] shrink-0 flex-col overflow-hidden border-r border-slate-200 bg-white">
      <div className="border-b border-slate-100 p-5"><p className="flex items-center gap-2 text-sm font-bold text-[#7566B8]"><GraduationCap className="h-5 w-5"/> Academy</p><h2 className="mt-3 text-sm font-semibold">{courseTitle}</h2>{preview && <p className="mt-2 text-xs text-amber-700">Vista previa</p>}</div>
      <nav className="min-h-0 flex-1 overflow-y-auto p-3">{modules.map((m, i) => <div key={m.id} className="mb-4"><p className="px-3 py-2 text-xs font-bold text-slate-500">{i + 1}. {m.title}</p>{m.lessons.map(l => <button key={l.id} type="button" onClick={() => setLessonId(l.id)} className={`flex w-full items-start gap-2 rounded-xl px-3 py-3 text-left text-xs ${l.id === lessonId ? "bg-[#F1EDFA] font-semibold text-[#7566B8]" : "text-slate-600 hover:bg-slate-50"}`}>{l.completed ? <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600"/> : <BookOpen className="h-4 w-4 shrink-0"/>}{l.title}</button>)}</div>)}</nav>
      <Link href={`/courses/${courseId}`} className="m-4 rounded-xl bg-slate-100 px-4 py-3 text-center text-xs font-semibold">Salir del aula</Link>
    </aside>}
    <main className="flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
      <header className="flex shrink-0 items-center gap-3 border-b border-slate-200 bg-white px-5 py-3"><button type="button" onClick={() => setShowOutline(p => !p)} aria-label="Mostrar u ocultar temario" className="rounded-lg p-2 hover:bg-slate-100"><BookOpen className="h-5 w-5"/></button><div className="min-w-0 flex-1"><p className="truncate text-xs text-[#8A83B0]">{currentLesson?.moduleTitle}</p><h1 className="truncate text-sm font-bold">{currentLesson?.title}</h1></div>{didactic && <div className="hidden items-center gap-3 sm:flex"><span className="text-xs text-slate-500">{screenIndex + 1} / {screens.length}</span><div className="h-1.5 w-28 overflow-hidden rounded-full bg-slate-100"><div className="h-full bg-[#8A78C4]" style={{ width: `${progress}%` }}/></div></div>}<Link href={`/courses/${courseId}`} aria-label="Cerrar" className="rounded-lg p-2 hover:bg-slate-100"><X className="h-5 w-5"/></Link></header>
      {loading ? <div className="flex flex-1 flex-col items-center justify-center gap-3"><LoaderCircle className="h-8 w-8 animate-spin text-[#7566B8]"/><p className="text-sm text-slate-500">Preparando el aula...</p></div> : !screen ? <div className="flex flex-1 items-center justify-center overflow-y-auto p-6"><div className="w-full max-w-lg rounded-3xl bg-white p-8 text-center shadow-sm"><Sparkles className="mx-auto h-10 w-10 text-[#7566B8]"/><h2 className="mt-5 text-xl font-bold">Esta clase aún no está preparada</h2><p className="mt-3 text-sm text-slate-500">Genera una experiencia interactiva para esta lección.</p>{error && <p className="mt-4 text-sm text-red-600">{error}</p>}{canManage && <button type="button" disabled={generating} onClick={() => void generateLesson()} className="mt-6 rounded-xl bg-[#7566B8] px-6 py-3 text-sm font-semibold text-white disabled:opacity-40">{generating ? "Produciendo clase..." : "Generar clase con IA"}</button>}</div></div> : <>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4 lg:p-6"><div className="mx-auto flex w-full max-w-[1200px] flex-col gap-4">
          <div className="flex flex-wrap items-center justify-between gap-3"><div className="flex items-center gap-2"><span className="rounded-lg bg-[#EDE9F8] px-3 py-1.5 text-xs font-semibold text-[#6B5CA8]">{PHASE_LABELS[screen.phase]}</span><span className="text-xs text-slate-400">{TYPE_LABELS[screen.type]}</span></div>{canManage && <button type="button" disabled={generating} onClick={() => void generateLesson()} className="flex items-center gap-2 text-xs font-medium text-slate-500 disabled:opacity-40"><RotateCcw className="h-4 w-4"/>{generating ? "Regenerando..." : "Regenerar clase"}</button>}</div>
          {error && <p className="rounded-xl bg-red-50 p-4 text-sm text-red-700">{error}</p>}
          <div className="rounded-[30px] bg-white p-6 shadow-sm lg:p-8"><p className="mb-3 text-xs font-bold uppercase tracking-[0.14em] text-[#8A78C4]">Descubre · Pantalla {screenIndex + 1}</p><h2 className="text-2xl font-bold tracking-tight lg:text-3xl">{screen.title}</h2>{screen.subtitle && <p className="mt-2 text-sm leading-6 text-slate-500">{screen.subtitle}</p>}<div className="mt-7"><DidacticVisual key={`${lessonId}:${screen.id}`} screen={screen}/></div></div>
          {screen.interaction && <AcademyInteraction key={`${lessonId}:${screen.id}`} data={screen.interaction} completed={Boolean(reviewed[screen.id])} onComplete={() => setReviewed(p => ({ ...p, [screen.id]: true }))}/>}
          {screen.activity && <DidacticActivity key={`${lessonId}:${screen.id}`} activity={screen.activity} value={answers[screen.id] ?? ""} onChange={value => { setAnswers(p => ({ ...p, [screen.id]: value })); setReviewed(p => ({ ...p, [screen.id]: false })); }} reviewed={Boolean(reviewed[screen.id])} onReview={() => setReviewed(p => ({ ...p, [screen.id]: true }))}/>}
          <section className="rounded-2xl border border-[#E9E7F4] bg-[#F1EFF9]"><button type="button" onClick={() => setShowTeacher(p => !p)} className="flex w-full items-center gap-3 p-4 text-left"><div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#8172BC] text-white"><GraduationCap className="h-5 w-5"/></div><div className="flex-1"><p className="text-sm font-bold">Profesor Academy</p><p className="text-xs text-slate-500">{showTeacher ? "Explicación complementaria" : "¿Quieres profundizar?"}</p></div>{showTeacher ? <ChevronUp className="h-4 w-4"/> : <ChevronDown className="h-4 w-4"/>}</button>{showTeacher && <div className="px-5 pb-5 sm:pl-[68px]"><p className="text-sm leading-7 text-slate-700">{screen.teacher.explanation}</p>{screen.teacher.transition && <p className="mt-3 text-sm italic text-slate-500">{screen.teacher.transition}</p>}</div>}</section>
          {isLast && <div className="rounded-2xl bg-[#EAF7F4] p-5"><p className="font-bold">Has llegado al final de la clase</p><p className="mt-2 text-sm text-slate-600">Has completado el recorrido de aprendizaje. La evaluación final y el progreso persistente se incorporarán después.</p></div>}
        </div></div>
        <footer className="shrink-0 border-t border-slate-200 bg-white px-5 py-3"><div className="mx-auto flex max-w-[1200px] items-center justify-between gap-4"><button type="button" disabled={screenIndex === 0} onClick={() => setScreenIndex(p => Math.max(0, p - 1))} className="flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-2.5 text-xs font-semibold disabled:opacity-40"><ArrowLeft className="h-4 w-4"/> Anterior</button><span className="hidden text-xs text-slate-500 sm:block">Pantalla {screenIndex + 1} de {screens.length}</span><button type="button" disabled={isLast || !ready} onClick={() => setScreenIndex(p => p + 1)} className="flex items-center gap-2 rounded-xl bg-[#7566B8] px-5 py-2.5 text-xs font-semibold text-white disabled:opacity-40">{isLast ? "Fin" : "Continuar"}<ArrowRight className="h-4 w-4"/></button></div></footer>
      </>}
    </main>
  </div>;
}
