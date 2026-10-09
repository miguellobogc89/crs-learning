
"use client";

// components/academy/learning-room/didactic-activity.tsx

import { useState, type DragEvent } from "react";
import {
  Check,
  CheckCircle2,
  CircleHelp,
  GripVertical,
  RotateCcw,
} from "lucide-react";

import type {
  DidacticActivity as Activity,
} from "@/lib/academy/didactic-package";

type Props = {
  activity: Activity;
  value: string;
  onChange: (value: string) => void;
  reviewed: boolean;
  onReview: () => void;
};

export function DidacticActivity({
  activity,
  value,
  onChange,
  reviewed,
  onReview,
}: Props) {
  const [hints, setHints] = useState(0);
  const [attempts, setAttempts] = useState(0);
  const [confirmed, setConfirmed] = useState(false);
  const [assignments, setAssignments] = useState<
    Record<string, string>
  >({});
  const [picked, setPicked] = useState<string | null>(null);
  const [checked, setChecked] = useState(false);

  const isChoice =
    (activity.kind === "quiz" ||
      activity.kind === "decision") &&
    (activity.options?.length ?? 0) >= 2;

  const isSorting =
    activity.kind === "sorting" &&
    (activity.groups?.length ?? 0) >= 2 &&
    (activity.sortItems?.length ?? 0) >= 2;

  const selected = activity.options?.find(
    (option) => option.id === value
  );

  const maxAttempts = Math.max(1, activity.maxAttempts);
  const remaining = Math.max(0, maxAttempts - attempts);

  const items = activity.sortItems ?? [];
  const groups = activity.groups ?? [];

  const score = items.filter(
    (item) => assignments[item.id] === item.groupId
  ).length;

  const assignedCount = items.filter(
    (item) => !!assignments[item.id]
  ).length;

  function confirmChoice() {
    if (!selected || confirmed) return;

    setConfirmed(true);
    setAttempts((previous) => previous + 1);
    onReview();
  }

  function retryChoice() {
    setConfirmed(false);
    onChange("");
  }

  function assign(groupId: string, itemId: string | null) {
    if (!itemId || checked) return;

    setAssignments((previous) => ({
      ...previous,
      [itemId]: groupId,
    }));

    setPicked(null);
  }

  function drop(event: DragEvent, groupId: string) {
    event.preventDefault();

    assign(
      groupId,
      event.dataTransfer.getData("text/plain") || picked
    );
  }

  function verifySorting() {
    if (assignedCount !== items.length) return;

    setChecked(true);
    onReview();
  }

  function retrySorting() {
    setChecked(false);
    setPicked(null);
    setAssignments({});
    onChange("");
  }

  return (
    <section className="rounded-[28px] bg-white px-5 py-6 shadow-sm sm:px-8 sm:py-7">
      {/* Cabecera */}
      <div className="mb-6 flex items-center gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#F0EAF9] text-[#7C64B6]">
          <CircleHelp className="h-5 w-5" />
        </div>

        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.1em] text-[#8C79B5]">
            Microejercicio
          </p>

          <h3 className="text-sm font-bold text-[#17203C]">
            Ponlo en práctica
          </h3>
        </div>
      </div>

      {/* Contexto */}
      {activity.scenario && (
        <div className="mb-6 rounded-xl bg-[#F7F5FC] px-5 py-4">
          <p className="text-sm leading-7 text-[#44435C]">
            {activity.scenario}
          </p>
        </div>
      )}

      {/* Pregunta */}
      <h4 className="mb-5 text-base font-bold leading-7 text-[#17203C]">
        {activity.instruction}
      </h4>

      {/* Cuestionario */}
      {isChoice ? (
        <>
          <div
            role="radiogroup"
            aria-label={activity.instruction}
            className="flex flex-col"
          >
            {activity.options?.map((option, index) => {
              const active = value === option.id;

              const correctSelected =
                confirmed &&
                active &&
                option.isPreferred;

              const wrongSelected =
                confirmed &&
                active &&
                !option.isPreferred;

              return (
                <button
                  key={option.id}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  disabled={confirmed}
                  onClick={() => onChange(option.id)}
                  className={[
                    "group flex w-full items-start gap-4",
                    "border-b border-[#EFEDF5]",
                    "px-2 py-4 text-left",
                    "transition-colors duration-150",
                    "last:border-b-0",
                    "focus-visible:outline-2",
                    "focus-visible:outline-offset-2",
                    "focus-visible:outline-[#8172BC]",
                    !confirmed && "hover:bg-[#FAF9FD]",
                    confirmed && "cursor-default",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                >
                  {/* Indicador */}
                  <span
                    className={[
                      "mt-0.5 flex h-7 w-7 shrink-0",
                      "items-center justify-center",
                      "rounded-full text-xs font-bold",
                      "transition-colors",
                      correctSelected
                        ? "bg-emerald-100 text-emerald-700"
                        : wrongSelected
                          ? "bg-amber-100 text-amber-700"
                          : active
                            ? "bg-[#7566B8] text-white"
                            : "bg-[#F2F0F8] text-[#8172BC]",
                    ].join(" ")}
                  >
                    {correctSelected ? (
                      <Check className="h-4 w-4" />
                    ) : (
                      String.fromCharCode(65 + index)
                    )}
                  </span>

                  {/* Respuesta */}
                  <span
                    className={[
                      "min-w-0 flex-1 pt-1",
                      "text-sm leading-6",
                      active
                        ? "font-semibold text-[#4F438D]"
                        : "font-medium text-[#34405B]",
                    ].join(" ")}
                  >
                    {option.label}
                  </span>

                  {/* Radio */}
                  <span
                    aria-hidden="true"
                    className={[
                      "mt-1 flex h-5 w-5 shrink-0",
                      "items-center justify-center",
                      "rounded-full border-[1.5px]",
                      "transition-colors",
                      active
                        ? "border-[#7566B8]"
                        : "border-[#CBC8D8]",
                    ].join(" ")}
                  >
                    {active && (
                      <span className="h-2.5 w-2.5 rounded-full bg-[#7566B8]" />
                    )}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Acción */}
          {!confirmed && (
            <div className="mt-6 flex flex-wrap items-center gap-4">
              <button
                type="button"
                disabled={!selected}
                onClick={confirmChoice}
                className="rounded-xl bg-[#7566B8] px-6 py-3 text-sm font-semibold text-white transition hover:bg-[#6655AA] disabled:cursor-not-allowed disabled:opacity-40"
              >
                Comprobar respuesta
              </button>

              <span className="text-xs text-slate-400">
                Selecciona una alternativa
              </span>
            </div>
          )}

          {/* Resultado */}
          {confirmed && selected && (
            <div
              className={[
                "mt-6 rounded-2xl px-5 py-5",
                selected.isPreferred
                  ? "bg-[#EDF8F2]"
                  : "bg-[#FFF7ED]",
              ].join(" ")}
            >
              <div className="flex items-center gap-2">
                {selected.isPreferred ? (
                  <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                ) : (
                  <CircleHelp className="h-5 w-5 text-amber-600" />
                )}

                <p className="text-sm font-bold text-[#17203C]">
                  {selected.isPreferred
                    ? "¡Bien resuelto!"
                    : "Analicemos tu respuesta"}
                </p>
              </div>

              {selected.consequence && (
                <p className="mt-3 text-sm leading-7 text-[#34405B]">
                  {selected.consequence}
                </p>
              )}

              {selected.feedback && (
                <p className="mt-2 text-sm leading-7 text-[#536078]">
                  {selected.feedback}
                </p>
              )}

              {activity.debrief && (
                <p className="mt-3 text-sm leading-7 text-[#536078]">
                  {activity.debrief}
                </p>
              )}

              {!selected.isPreferred && remaining > 0 && (
                <button
                  type="button"
                  onClick={retryChoice}
                  className="mt-5 flex items-center gap-2 text-sm font-semibold text-[#6F5EB2] hover:underline"
                >
                  <RotateCcw className="h-4 w-4" />
                  Volver a intentarlo ({remaining} restantes)
                </button>
              )}
            </div>
          )}
        </>
      ) : isSorting ? (
        <>
          {/* Clasificación */}
          <p className="mb-4 text-xs leading-5 text-slate-500">
            Arrastra cada elemento a su categoría o selecciónalo
            y después pulsa sobre la categoría correspondiente.
          </p>

          <div className="mb-5 flex flex-wrap gap-2">
            {items.map((item) => (
              <button
                key={item.id}
                type="button"
                draggable={!checked}
                disabled={checked}
                onDragStart={(event) => {
                  event.dataTransfer.setData(
                    "text/plain",
                    item.id
                  );
                  setPicked(item.id);
                }}
                onClick={() => setPicked(item.id)}
                className={[
                  "flex items-center gap-2 rounded-xl",
                  "px-3 py-2 text-left text-sm",
                  "transition-colors",
                  picked === item.id
                    ? "bg-[#EAE5F8] text-[#5B4A9E]"
                    : "bg-[#F5F4F9] text-[#34405B] hover:bg-[#ECE9F5]",
                ].join(" ")}
              >
                <GripVertical className="h-4 w-4 text-slate-400" />
                {item.label}

                {assignments[item.id] && (
                  <Check className="h-4 w-4 text-[#7566B8]" />
                )}
              </button>
            ))}
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            {groups.map((group, index) => (
              <button
                key={group.id}
                type="button"
                onClick={() => assign(group.id, picked)}
                onDragOver={(event) =>
                  event.preventDefault()
                }
                onDrop={(event) => drop(event, group.id)}
                className={[
                  "min-h-[120px] rounded-2xl",
                  "p-4 text-left transition-colors",
                  index % 2
                    ? "bg-[#EAF8FA]"
                    : "bg-[#F1EDFA]",
                ].join(" ")}
              >
                <h4 className="mb-3 text-sm font-bold">
                  {group.label}
                </h4>

                <div className="flex flex-wrap gap-2">
                  {items
                    .filter(
                      (item) =>
                        assignments[item.id] === group.id
                    )
                    .map((item) => (
                      <span
                        key={item.id}
                        className={[
                          "rounded-lg bg-white/80",
                          "px-3 py-2 text-xs",
                          checked
                            ? item.groupId === group.id
                              ? "text-emerald-700"
                              : "text-red-600"
                            : "text-slate-700",
                        ].join(" ")}
                      >
                        {item.label}

                        {checked &&
                          (item.groupId === group.id
                            ? " ✓"
                            : " ✕")}
                      </span>
                    ))}
                </div>
              </button>
            ))}
          </div>

          {!checked ? (
            <button
              type="button"
              disabled={assignedCount !== items.length}
              onClick={verifySorting}
              className="mt-5 rounded-xl bg-[#7566B8] px-5 py-3 text-sm font-semibold text-white disabled:opacity-40"
            >
              Comprobar clasificación ({assignedCount}/
              {items.length})
            </button>
          ) : (
            <div className="mt-5 rounded-xl bg-[#F2F4FB] p-4">
              <p className="font-semibold">
                {score} de {items.length} elementos correctos
              </p>

              <div className="mt-3 space-y-2">
                {items
                  .filter(
                    (item) =>
                      assignments[item.id] !== item.groupId
                  )
                  .map((item) => (
                    <p
                      key={item.id}
                      className="text-sm text-slate-600"
                    >
                      {item.label}:{" "}
                      {item.feedback ||
                        `Categoría correcta: ${
                          groups.find(
                            (group) =>
                              group.id === item.groupId
                          )?.label ?? ""
                        }`}
                    </p>
                  ))}
              </div>

              {score < items.length && (
                <button
                  type="button"
                  onClick={retrySorting}
                  className="mt-4 flex items-center gap-2 text-sm font-semibold text-[#7566B8]"
                >
                  <RotateCcw className="h-4 w-4" />
                  Volver a intentarlo
                </button>
              )}
            </div>
          )}
        </>
      ) : (
        <div className="rounded-2xl bg-[#F2F4FB] p-5">
          <p className="text-sm leading-7 text-slate-600">
            Esta actividad de reflexión abierta se reserva
            para la evaluación final. Puedes continuar con
            la lección.
          </p>

          <button
            type="button"
            onClick={onReview}
            className="mt-4 rounded-xl bg-[#7566B8] px-5 py-3 text-sm font-semibold text-white"
          >
            Continuar aprendiendo
          </button>
        </div>
      )}

      {/* Pistas */}
      {hints > 0 && (
        <div className="mt-4 rounded-xl bg-amber-50 p-4">
          {activity.hints
            .slice(0, hints)
            .map((hint, index) => (
              <p
                key={index}
                className="text-sm leading-6 text-amber-900"
              >
                {hint}
              </p>
            ))}
        </div>
      )}

      {hints < activity.hints.length &&
        !checked &&
        !confirmed && (
          <button
            type="button"
            onClick={() =>
              setHints((previous) => previous + 1)
            }
            className="mt-4 text-xs font-semibold text-[#7566B8] hover:underline"
          >
            Mostrar una pista
          </button>
        )}

      {reviewed && (
        <p className="mt-5 flex items-center gap-2 text-xs text-slate-400">
          <Check className="h-4 w-4" />
          Práctica realizada en esta sesión.
        </p>
      )}
    </section>
  );
}
