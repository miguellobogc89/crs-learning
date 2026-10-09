// components/academy/learning-room/interactions/put-in-order.tsx


"use client";

import { useEffect, useState, type DragEvent } from "react";
import {
  ArrowDown,
  ArrowUp,
  GripVertical,
  RotateCcw,
  CheckCircle2,
} from "lucide-react";
import type { InteractionProps } from "./types";

function shuffle(ids: string[]): string[] {
  const result = [...ids];

  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }

  if (
    result.length > 1 &&
    result.every((id, i) => id === ids[i])
  ) {
    [result[0], result[1]] = [result[1], result[0]];
  }

  return result;
}

export function PutInOrder({
  data,
  onComplete,
  completed = false,
}: InteractionProps) {
  const items = data.items ?? [];
  const ids = items.map((item) => item.id);
  const signature = ids.join("\u0000");

  const [order, setOrder] = useState<string[]>([]);
  const [checked, setChecked] = useState(false);

  // Mezclamos después del montaje para evitar diferencias
  // entre el HTML del servidor y el del navegador.
  useEffect(() => {
    setOrder(shuffle(ids));
    setChecked(false);
    // La identidad de los elementos determina el reinicio.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature]);

  const ready = order.length === items.length;
  const correct =
    ready &&
    order.every((id, index) => id === items[index]?.id);

  function move(from: number, to: number) {
    if (
      checked ||
      completed ||
      from < 0 ||
      from >= order.length ||
      to < 0 ||
      to >= order.length
    ) {
      return;
    }

    setOrder((previous) => {
      const next = [...previous];
      const [id] = next.splice(from, 1);
      next.splice(to, 0, id);
      return next;
    });
  }

  function drop(event: DragEvent<HTMLDivElement>, to: number) {
    event.preventDefault();

    const id = event.dataTransfer.getData("text/plain");
    move(order.indexOf(id), to);
  }

  function verify() {
    if (!ready || checked || completed) return;

    const hits = order.filter(
      (id, index) => id === items[index]?.id
    ).length;

    setChecked(true);

    onComplete({
      correct: hits === items.length,
      score: Math.round(
        (hits / Math.max(1, items.length)) * 100
      ),
    });
  }

  function retry() {
    if (completed) return;
    setOrder(shuffle(ids));
    setChecked(false);
  }

  return (
    <div className="space-y-5">
      <div>
        <h3 className="text-base font-bold leading-7 text-[#17203C]">
          {data.instruction}
        </h3>
        <p className="mt-2 text-xs text-slate-500">
          Arrastra los pasos o utiliza las flechas para
          colocarlos en la secuencia correcta.
        </p>
      </div>

      <div className="divide-y divide-[#EFEDF5]">
        {order.map((id, index) => {
          const item = items.find((entry) => entry.id === id);

          return (
            <div
              key={id}
              draggable={!checked && !completed}
              onDragStart={(event) => {
                event.dataTransfer.setData(
                  "text/plain",
                  id
                );
                event.dataTransfer.effectAllowed = "move";
              }}
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => drop(event, index)}
              className="flex min-h-[68px] items-center gap-3 py-3"
            >
              <GripVertical className="h-4 w-4 shrink-0 text-[#AAA5BD]" />

              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#F0EAF9] text-xs font-bold text-[#7566B8]">
                {index + 1}
              </span>

              <span className="min-w-0 flex-1 text-sm font-medium leading-6 text-[#34405B]">
                {item?.label}
              </span>

              <div className="flex shrink-0 flex-col gap-1">
                <button
                  type="button"
                  aria-label={`Subir ${item?.label ?? "paso"}`}
                  disabled={
                    checked || completed || index === 0
                  }
                  onClick={() => move(index, index - 1)}
                  className="rounded-md p-1.5 text-[#7566B8] hover:bg-[#F2EFF9] disabled:opacity-25"
                >
                  <ArrowUp className="h-4 w-4" />
                </button>

                <button
                  type="button"
                  aria-label={`Bajar ${item?.label ?? "paso"}`}
                  disabled={
                    checked ||
                    completed ||
                    index === order.length - 1
                  }
                  onClick={() => move(index, index + 1)}
                  className="rounded-md p-1.5 text-[#7566B8] hover:bg-[#F2EFF9] disabled:opacity-25"
                >
                  <ArrowDown className="h-4 w-4" />
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {!checked && !completed && (
        <button
          type="button"
          disabled={!ready}
          onClick={verify}
          className="rounded-xl bg-[#7566B8] px-6 py-3 text-sm font-semibold text-white hover:bg-[#6655AA] disabled:opacity-40"
        >
          Comprobar orden
        </button>
      )}

      {checked && (
        <div className="rounded-2xl bg-[#F5F3FA] p-5">
          <div className="flex items-center gap-2">
            {correct && (
              <CheckCircle2 className="h-5 w-5 text-emerald-600" />
            )}
            <p className="text-sm font-bold text-[#17203C]">
              {correct
                ? "¡Secuencia correcta!"
                : "Revisemos el orden"}
            </p>
          </div>

          {data.debrief && (
            <p className="mt-3 text-sm leading-6 text-[#536078]">
              {data.debrief}
            </p>
          )}

          {!correct && (
            <>
              <p className="mt-4 text-sm font-semibold">
                Orden correcto
              </p>

              <ol className="mt-3 space-y-2">
                {items.map((item, index) => (
                  <li
                    key={item.id}
                    className="text-sm leading-6 text-slate-600"
                  >
                    {index + 1}. {item.label}
                  </li>
                ))}
              </ol>

              {!completed && (
                <button
                  type="button"
                  onClick={retry}
                  className="mt-5 flex items-center gap-2 text-sm font-semibold text-[#7566B8]"
                >
                  <RotateCcw className="h-4 w-4" />
                  Practicar de nuevo
                </button>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
