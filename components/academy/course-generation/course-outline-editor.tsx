// components/academy/course-generation/course-outline-editor.tsx
"use client";

import { useState, useTransition } from "react";
import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  CheckCheck,
  ChevronDown,
  ChevronUp,
  Plus,
  RotateCcw,
  Save,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

import { saveCourseOutlineAction } from "@/app/actions/course-outline-review";
import { approveCourseOutlineAction } from "@/app/actions/course-outline-approval";

import type { CourseOutline } from "@/academy/generation/course-outline";

type Module = CourseOutline["modules"][number];

type Props = {
  courseId: string;
  initialOutline: CourseOutline;
  onBack?: () => void;
  onSaved?: (outline: CourseOutline) => void;
  onRegenerate?: () => void;
  onApproved?: () => void;
};

export function CourseOutlineEditor({
  courseId,
  initialOutline,
  onBack,
  onSaved,
  onRegenerate,
  onApproved,
}: Props) {
  const [outline, setOutline] = useState<CourseOutline>(initialOutline);
  const [expanded, setExpanded] = useState<number | null>(0);
  const [dirty, setDirty] = useState(false);

  const [saving, startSaving] = useTransition();
  const [approving, startApproving] = useTransition();

  const busy = saving || approving;

  const total = outline.modules.reduce(
    (sum, module) => sum + module.estimatedMinutes,
    0,
  );

  function update(modules: Module[]) {
    setOutline((current) => ({
      ...current,
      modules: modules.map((module, index) => ({
        ...module,
        order: index + 1,
      })),
    }));

    setDirty(true);
  }

  function patch(index: number, changes: Partial<Module>) {
    update(
      outline.modules.map((module, currentIndex) =>
        currentIndex === index
          ? { ...module, ...changes }
          : module,
      ),
    );
  }

  function move(index: number, direction: -1 | 1) {
    const target = index + direction;

    if (target < 0 || target >= outline.modules.length) {
      return;
    }

    const next = [...outline.modules];

    [next[index], next[target]] = [next[target], next[index]];

    update(next);
    setExpanded(target);
  }

  function add() {
    update([
      ...outline.modules,
      {
        order: outline.modules.length + 1,
        title: "Nuevo módulo",
        description: "",
        learningObjectives: [""],
        estimatedMinutes: 30,
      },
    ]);

    setExpanded(outline.modules.length);
  }

  function remove(index: number) {
    if (outline.modules.length <= 1) {
      toast.error("Debe quedar al menos un módulo.");
      return;
    }

    update(outline.modules.filter((_, currentIndex) => currentIndex !== index));
    setExpanded(null);
  }

  function save() {
    if (busy) return;

    startSaving(async () => {
      try {
        const result = await saveCourseOutlineAction(courseId, outline);

        if (!result.ok) {
          toast.error(result.error);
          return;
        }

        setDirty(false);
        toast.success("Propuesta guardada. Pendiente de aprobación.");
        onSaved?.(outline);
      } catch {
        toast.error("No se pudo guardar la propuesta.");
      }
    });
  }

  function approve() {
    if (busy) return;

    if (dirty) {
      toast.error("Guarda los cambios antes de aprobar el temario.");
      return;
    }

    const confirmed = window.confirm(
      "¿Aprobar el temario? Se crearán las secciones del curso y la propuesta dejará de ser editable.",
    );

    if (!confirmed) return;

    startApproving(async () => {
      try {
        const result = await approveCourseOutlineAction(courseId);

        if (!result.ok) {
          toast.error(result.error);
          return;
        }

        toast.success(
          result.alreadyApproved
            ? "Este temario ya estaba aprobado."
            : `${result.sectionsCreated} módulos aprobados y creados.`,
        );

        onApproved?.();
      } catch {
        toast.error("No se pudo aprobar el temario.");
      }
    });
  }

  function back() {
    if (busy) return;

    if (
      dirty &&
      !window.confirm(
        "Hay cambios sin guardar. ¿Quieres volver igualmente?",
      )
    ) {
      return;
    }

    onBack?.();
  }

  function regenerate() {
    if (!onRegenerate || busy) return;

    if (
      dirty &&
      !window.confirm(
        "La regeneración reemplazará los cambios sin guardar. ¿Continuar?",
      )
    ) {
      return;
    }

    onRegenerate();
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-white text-slate-900">
      <header className="shrink-0 border-b border-slate-100 px-5 py-4">
        <p className="text-xs font-medium uppercase tracking-wide text-blue-600">
          Propuesta de temario
        </p>

        <h2 className="mt-1 text-lg font-semibold">
          {outline.title}
        </h2>

        <p className="mt-1 text-xs text-slate-500">
          {outline.modules.length} módulos · {Math.floor(total / 60)} h{" "}
          {total % 60} min · Pendiente de revisión
        </p>
      </header>

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-5 py-4">
        {outline.modules.map((module, index) => (
          <section
            key={index}
            className="overflow-hidden rounded-xl border border-slate-200"
          >
            <div className="flex items-center gap-2 px-3 py-3">
              <button
                type="button"
                disabled={busy}
                onClick={() =>
                  setExpanded(expanded === index ? null : index)
                }
                className="flex min-w-0 flex-1 items-center gap-2 text-left"
                aria-expanded={expanded === index}
              >
                <span className="shrink-0 text-xs font-semibold text-blue-600">
                  {index + 1}.
                </span>

                <span className="min-w-0 flex-1 truncate text-sm font-medium">
                  {module.title || "Sin título"}
                </span>

                <span className="shrink-0 text-xs text-slate-400">
                  {module.estimatedMinutes} min
                </span>

                {expanded === index ? (
                  <ChevronUp className="h-4 w-4 shrink-0" />
                ) : (
                  <ChevronDown className="h-4 w-4 shrink-0" />
                )}
              </button>

              <button
                type="button"
                disabled={busy || index === 0}
                onClick={() => move(index, -1)}
                aria-label="Subir módulo"
                className="disabled:opacity-30"
              >
                <ArrowUp className="h-4 w-4" />
              </button>

              <button
                type="button"
                disabled={busy || index === outline.modules.length - 1}
                onClick={() => move(index, 1)}
                aria-label="Bajar módulo"
                className="disabled:opacity-30"
              >
                <ArrowDown className="h-4 w-4" />
              </button>
            </div>

            {expanded === index && (
              <div className="space-y-4 border-t border-slate-100 px-3 py-4">
                <label className="block space-y-1 text-xs font-medium text-slate-600">
                  Título

                  <Input
                    value={module.title}
                    disabled={busy}
                    onChange={(event) =>
                      patch(index, { title: event.target.value })
                    }
                    className="mt-1"
                  />
                </label>

                <label className="block space-y-1 text-xs font-medium text-slate-600">
                  Descripción

                  <Textarea
                    value={module.description}
                    disabled={busy}
                    onChange={(event) =>
                      patch(index, { description: event.target.value })
                    }
                    rows={3}
                    className="mt-1"
                  />
                </label>

                <label className="block space-y-1 text-xs font-medium text-slate-600">
                  Duración estimada (minutos)

                  <Input
                    type="number"
                    min={1}
                    max={600}
                    value={module.estimatedMinutes}
                    disabled={busy}
                    onChange={(event) =>
                      patch(index, {
                        estimatedMinutes: Number(event.target.value),
                      })
                    }
                    className="mt-1"
                  />
                </label>

                <div className="space-y-2">
                  <p className="text-xs font-medium text-slate-600">
                    Objetivos de aprendizaje
                  </p>

                  {module.learningObjectives.map(
                    (objective, objectiveIndex) => (
                      <div
                        key={objectiveIndex}
                        className="flex items-center gap-2"
                      >
                        <Input
                          aria-label={`Objetivo ${objectiveIndex + 1}`}
                          value={objective}
                          disabled={busy}
                          onChange={(event) =>
                            patch(index, {
                              learningObjectives:
                                module.learningObjectives.map(
                                  (value, currentIndex) =>
                                    currentIndex === objectiveIndex
                                      ? event.target.value
                                      : value,
                                ),
                            })
                          }
                        />

                        <button
                          type="button"
                          disabled={busy}
                          aria-label="Eliminar objetivo"
                          onClick={() =>
                            patch(index, {
                              learningObjectives:
                                module.learningObjectives.filter(
                                  (_, currentIndex) =>
                                    currentIndex !== objectiveIndex,
                                ),
                            })
                          }
                        >
                          <Trash2 className="h-4 w-4 text-slate-400" />
                        </button>
                      </div>
                    ),
                  )}

                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={busy}
                    onClick={() =>
                      patch(index, {
                        learningObjectives: [
                          ...module.learningObjectives,
                          "",
                        ],
                      })
                    }
                  >
                    <Plus className="mr-1 h-3 w-3" />
                    Añadir objetivo
                  </Button>
                </div>

                <div className="flex justify-end">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={busy}
                    onClick={() => remove(index)}
                    className="text-red-600"
                  >
                    <Trash2 className="mr-1 h-4 w-4" />
                    Eliminar módulo
                  </Button>
                </div>
              </div>
            )}
          </section>
        ))}

        <Button
          type="button"
          variant="outline"
          disabled={busy}
          onClick={add}
          className="w-full border-dashed"
        >
          <Plus className="mr-2 h-4 w-4" />
          Añadir módulo
        </Button>

        {onRegenerate && (
          <Button
            type="button"
            variant="ghost"
            disabled={busy}
            onClick={regenerate}
            className="w-full"
          >
            <RotateCcw className="mr-2 h-4 w-4" />
            Regenerar propuesta
          </Button>
        )}
      </div>

      <footer className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-t border-slate-100 px-5 py-4">
        {onBack ? (
          <Button
            type="button"
            variant="outline"
            disabled={busy}
            onClick={back}
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            Atrás
          </Button>
        ) : (
          <span />
        )}

        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            disabled={busy || !dirty}
            onClick={save}
            variant="outline"
          >
            <Save className="mr-2 h-4 w-4" />
            {saving ? "Guardando..." : "Guardar propuesta"}
          </Button>

          <Button
            type="button"
            disabled={busy || dirty}
            onClick={approve}
            className="bg-emerald-600 text-white hover:bg-emerald-700"
          >
            <CheckCheck className="mr-2 h-4 w-4" />
            {approving ? "Aprobando..." : "Aprobar temario"}
          </Button>
        </div>
      </footer>
    </div>
  );
}
