
"use client";

import { useState, type DragEvent } from "react";
import {
  ArrowDown,
  ArrowUp,
  GripVertical,
  RotateCcw,
} from "lucide-react";
import { card, type InteractionProps } from "./types";

function shuffle(ids: string[]): string[] {
  const result = [...ids];

  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }

  // Evita comenzar con el ejercicio resuelto.
  if (
    result.length > 1 &&
    result.every((id, index) => id === ids[index])
  ) {
    [result[0], result[1]] = [result[1], result[0]];
  }

  return result;
}

export function PutInOrder({
  data,
  onComplete,
}: InteractionProps) {
  const items = data.items ?? [];

  const [order, setOrder] = useState<string[]>(() =>
    shuffle(items.map((item) => item.id))
  );

  const [checked, setChecked] = useState(false);

  const correct = order.every(
    (id, index) => id === items[index]?.id
  );

  function move(from: number, to: number) {
    if (
      checked ||
      from < 0 ||
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

  function drop(event: DragEvent, target: number) {
    event.preventDefault();

    const id = event.dataTransfer.getData("text/plain");
    move(order.indexOf(id), target);
  }

  function verify() {
    if (checked || items.length === 0) return;

    setChecked(true);

    const hits = order.filter(
      (id, index) => id === items[index]?.id
    ).length;

    onComplete({
      correct: hits === items.length,
      score: Math.round((hits / items.length) * 100),
    });
  }

  function retry() {
    setOrder(shuffle(items.map((item) => item.id)));
    setChecked(false);
  }

  return (
    <div>
      <p className="mb-4 text-sm text-slate-600">
        {data.instruction}
      </p>

      <p className="mb-5 text-xs text-slate-500">
        Arrastra los pasos o utiliza las flechas para
        colocarlos en el orden correcto.
      </p>

      <div className="space-y-3">
        {order.map((id, index) => {
          const item = items.find((x) => x.id === id);

          return (
            <div
              key={id}
              draggable={!checked}
              onDragStart={(event) =>
                event.dataTransfer.setData(
                  "text/plain",
                  id
                )
              }
              onDragOver={(event) =>
                event.preventDefault()
              }
              onDrop={(event) => drop(event, index)}
              className={`${card} flex items-center gap-3`}
            >
              <GripVertical className="h-4 w-4 shrink-0 text-slate-400" />

              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-violet-100 text-xs font-bold text-violet-700">
                {index + 1}
              </span>

              <span className="flex-1 text-sm font-medium">
                {item?.label}
              </span>

              <div className="flex flex-col gap-2">
                <button
                  type="button"
                  disabled={checked || index === 0}
                  aria-label="Subir"
                  onClick={() => move(index, index - 1)}
                  className="disabled:opacity-30"
                >
                  <ArrowUp className="h-4 w-4" />
                </button>

                <button
                  type="button"
                  disabled={
                    checked || index === order.length - 1
                  }
                  aria-label="Bajar"
                  onClick={() => move(index, index + 1)}
                  className="disabled:opacity-30"
                >
                  <ArrowDown className="h-4 w-4" />
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {!checked && (
        <button
          type="button"
          onClick={verify}
          className="mt-5 rounded-xl bg-[#7566B8] px-5 py-3 text-sm font-semibold text-white"
        >
          Comprobar orden
        </button>
      )}

      {checked && (
        <div className="mt-5 rounded-2xl bg-[#F2F0FA] p-5">
          <p className="font-bold">
            {correct
              ? "¡Secuencia correcta!"
              : "Vamos a revisar la secuencia"}
          </p>

          {data.debrief && (
            <p className="mt-3 text-sm leading-6">
              {data.debrief}
            </p>
          )}

          {!correct && (
            <>
              <p className="mt-4 text-sm font-semibold">
                Orden correcto:
              </p>

              <ol className="mt-2 space-y-2">
                {items.map((item, index) => (
                  <li
                    key={item.id}
                    className="text-sm text-slate-600"
                  >
                    {index + 1}. {item.label}
                  </li>
                ))}
              </ol>

              <button
                type="button"
                onClick={retry}
                className="mt-5 flex items-center gap-2 text-sm font-semibold text-[#7566B8]"
              >
                <RotateCcw className="h-4 w-4" />
                Practicar de nuevo
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
