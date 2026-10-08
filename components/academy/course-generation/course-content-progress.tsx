
// components/academy/course-generation/course-content-progress.tsx
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Circle,
  LoaderCircle,
  RefreshCw,
  X,
} from "lucide-react";
import { toast } from "sonner";

import {
  generateCourseModuleAction,
  getCourseGenerationStatusAction,
} from "@/app/actions/course-content-generation";
import { Button } from "@/components/ui/button";

type GenerationStatus = Extract<
  Awaited<ReturnType<typeof getCourseGenerationStatusAction>>,
  { ok: true }
>;

type Props = {
  courseId: string;
  onClose: () => void;
  onComplete?: () => void;
};

export function CourseContentProgress({
  courseId,
  onClose,
  onComplete,
}: Props) {
  const [status, setStatus] = useState<GenerationStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [activeOrder, setActiveOrder] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const runningRef = useRef(false);
  const mountedRef = useRef(true);

  const refresh = useCallback(async () => {
    const result = await getCourseGenerationStatusAction(courseId);

    if (!result.ok) {
      if (mountedRef.current) setError(result.error);
      return null;
    }

    if (mountedRef.current) {
      setStatus(result);
      setError(null);
    }

    return result;
  }, [courseId]);

  useEffect(() => {
    mountedRef.current = true;

    void refresh().finally(() => {
      if (mountedRef.current) setLoading(false);
    });

    return () => {
      mountedRef.current = false;
    };
  }, [refresh]);

  async function generate() {
    if (runningRef.current) return;

    runningRef.current = true;
    setRunning(true);
    setError(null);

    try {
      let current = await refresh();

      if (!current) return;

      for (const module of current.modules) {
        if (module.completed) continue;

        if (mountedRef.current) setActiveOrder(module.order);

        const result = await generateCourseModuleAction(
          courseId,
          module.order,
        );

        if (!result.ok) {
          throw new Error(result.error);
        }

        const updated = await refresh();

        if (!updated) {
          throw new Error("No se pudo actualizar el progreso.");
        }

        current = updated;
      }

      if (mountedRef.current) {
        setActiveOrder(null);
        toast.success("Contenido del curso generado.");
        onComplete?.();
      }
    } catch (cause) {
      if (mountedRef.current) {
        setError(
          cause instanceof Error
            ? cause.message
            : "La generación se ha interrumpido.",
        );
      }
    } finally {
      runningRef.current = false;

      if (mountedRef.current) {
        setRunning(false);
        setActiveOrder(null);
      }
    }
  }

  const modules = status?.modules ?? [];
  const completed = modules.filter(m => m.completed).length;
  const total = modules.length;
  const percent = total ? Math.round((completed / total) * 100) : 0;
  const finished = total > 0 && completed === total;

  return (
    <div className="flex h-full min-h-0 flex-col bg-white text-slate-900">
      <header className="shrink-0 border-b border-slate-100 px-5 py-5">
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold uppercase tracking-wide text-blue-600">
            Academy / Generación
          </p>

          <button
            type="button"
            aria-label="Cerrar"
            onClick={onClose}
            className="rounded-lg p-2 hover:bg-slate-100"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <h2 className="mt-3 text-xl font-semibold">
          {finished ? "Contenido generado" : "Creando tu formación"}
        </h2>

        <p className="mt-1 text-sm text-slate-500">
          {status?.courseTitle ?? "Preparando curso..."}
        </p>
      </header>

      <div className="min-h-0 flex-1 space-y-6 overflow-y-auto px-5 py-6">
        {loading ? (
          <div className="flex items-center gap-2 text-sm text-slate-500">
            <LoaderCircle className="h-4 w-4 animate-spin" />
            Consultando el estado del curso...
          </div>
        ) : (
          <>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold">
                  Desarrollo de contenidos
                </span>

                <span className="text-sm font-medium text-blue-600">
                  {completed} de {total} módulos
                </span>
              </div>

              <div
                className="h-2 overflow-hidden rounded-full bg-slate-100"
                role="progressbar"
                aria-valuenow={percent}
                aria-valuemin={0}
                aria-valuemax={100}
              >
                <div
                  className="h-full rounded-full bg-[#315BFF] transition-all duration-300"
                  style={{ width: `${percent}%` }}
                />
              </div>

              <p className="text-xs text-slate-500">
                {percent}% completado
              </p>
            </div>

            <div className="space-y-4">
              {modules.map(module => {
                const active =
                  running && activeOrder === module.order;

                return (
                  <div
                    key={module.id}
                    className="flex items-start gap-3"
                  >
                    {module.completed ? (
                      <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
                    ) : active ? (
                      <LoaderCircle className="mt-0.5 h-5 w-5 shrink-0 animate-spin text-blue-600" />
                    ) : (
                      <Circle className="mt-0.5 h-5 w-5 shrink-0 text-slate-300" />
                    )}

                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium">
                        {module.order}. {module.title}
                      </p>

                      <p className="mt-1 text-xs text-slate-500">
                        {module.completed
                          ? `${module.lessonCount} lecciones generadas`
                          : active
                            ? "Redactando lecciones y ejemplos..."
                            : "Pendiente"}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>

            {status?.reviewRequired && (
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
                <div className="flex items-start gap-3">
                  <AlertTriangle className="h-5 w-5 shrink-0 text-amber-600" />

                  <div className="space-y-1">
                    <p className="text-sm font-semibold text-amber-900">
                      Posible actividad de riesgo
                    </p>

                    <p className="text-xs leading-relaxed text-amber-800">
                      El curso puede contener actividades que requieren
                      revisión especializada antes de su publicación.
                      La detección es preventiva y no sustituye una
                      evaluación humana.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {error && (
              <div className="rounded-xl border border-red-200 bg-red-50 p-4">
                <p className="text-sm text-red-700">{error}</p>
              </div>
            )}

            {finished && (
              <div className="rounded-xl bg-emerald-50 p-4">
                <p className="text-sm font-medium text-emerald-800">
                  Todos los módulos tienen contenido.
                </p>

                <p className="mt-1 text-xs text-emerald-700">
                  El curso permanece como borrador.
                  Todavía no se ha publicado ni asignado.
                </p>
              </div>
            )}
          </>
        )}
      </div>

      <footer className="shrink-0 border-t border-slate-100 px-5 py-4">
        {!finished ? (
          <Button
            type="button"
            disabled={loading || running || !status}
            onClick={() => void generate()}
            className="w-full bg-[#315BFF] text-white hover:bg-[#244BE8]"
          >
            {running ? (
              <>
                <LoaderCircle className="mr-2 h-4 w-4 animate-spin" />
                Generando contenido...
              </>
            ) : (
              <>
                <RefreshCw className="mr-2 h-4 w-4" />
                {completed > 0 ? "Continuar generación" : "Generar contenido"}
              </>
            )}
          </Button>
        ) : (
          <Button
            type="button"
            onClick={onComplete ?? onClose}
            className="w-full bg-[#315BFF] text-white hover:bg-[#244BE8]"
          >
            Continuar
          </Button>
        )}
      </footer>
    </div>
  );
}
