
"use client";

// components/academy/learning-room/didactic-visual.tsx

import {
  ArrowDown,
  ArrowRight,
  BookOpen,
  CheckCircle2,
  GitBranch,
  Lightbulb,
  Play,
  Sparkles,
} from "lucide-react";

import type { DidacticScreen } from "@/lib/academy/didactic-package";

type Props = {
  screen: DidacticScreen;
};

export function DidacticVisual({ screen }: Props) {
  const { layout, items } = screen.visual;

  if (layout === "steps" || layout === "timeline") {
    return (
      <div className="mx-auto max-w-4xl">
        <div className="relative space-y-4">
          {items.map((item, index) => (
            <div key={index} className="relative flex gap-5">
              <div className="flex w-11 shrink-0 flex-col items-center">
                <div className="z-10 flex h-11 w-11 items-center justify-center rounded-2xl bg-[#315BFF] text-sm font-bold text-white shadow-sm">
                  {index + 1}
                </div>
                {index < items.length - 1 && (
                  <div className="mt-2 min-h-6 w-0.5 flex-1 bg-[#C9D7FF]" />
                )}
              </div>

              <div className="mb-3 min-w-0 flex-1 rounded-2xl bg-[#F4F7FF] p-5">
                <h3 className="text-base font-bold">
                  {item.title}
                </h3>
                <p className="mt-2 whitespace-pre-wrap text-sm leading-7 text-slate-600">
                  {item.description}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (layout === "scenario") {
    const [situation, ...details] = items;

    return (
      <div className="mx-auto max-w-4xl overflow-hidden rounded-3xl bg-[#13264D] text-white">
        <div className="px-6 py-7 sm:px-8">
          <div className="mb-5 flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-[#AFC5FF]">
            <Play className="h-4 w-4" />
            Situación profesional
          </div>

          <h3 className="text-xl font-bold leading-snug sm:text-2xl">
            {situation.title}
          </h3>

          <p className="mt-4 whitespace-pre-wrap text-sm leading-8 text-[#E1E9FF]">
            {situation.description}
          </p>
        </div>

        {details.length > 0 && (
          <div className="grid gap-px bg-white/10 md:grid-cols-2">
            {details.map((item, index) => (
              <div
                key={index}
                className="bg-[#1B335F] px-6 py-5"
              >
                <p className="text-sm font-bold text-white">
                  {item.title}
                </p>
                <p className="mt-2 whitespace-pre-wrap text-sm leading-7 text-[#C9D8F5]">
                  {item.description}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  if (layout === "diagram") {
    return (
      <div className="mx-auto flex max-w-4xl flex-col items-center gap-2">
        {items.map((item, index) => (
          <div key={index} className="flex w-full flex-col items-center">
            <div
              className={`w-full max-w-2xl rounded-2xl border px-6 py-5 text-center ${
                index === 0
                  ? "border-[#315BFF] bg-[#315BFF] text-white"
                  : "border-[#D8E3FF] bg-[#F4F7FF]"
              }`}
            >
              <div className="mb-2 flex justify-center">
                {index === 0 ? (
                  <GitBranch className="h-5 w-5" />
                ) : (
                  <CheckCircle2 className="h-5 w-5 text-[#315BFF]" />
                )}
              </div>
              <h3 className="text-base font-bold">
                {item.title}
              </h3>
              <p
                className={`mt-2 whitespace-pre-wrap text-sm leading-7 ${
                  index === 0 ? "text-white/85" : "text-slate-600"
                }`}
              >
                {item.description}
              </p>
            </div>
            {index < items.length - 1 && (
              <ArrowDown className="my-2 h-5 w-5 text-[#90A9F5]" />
            )}
          </div>
        ))}
      </div>
    );
  }

  if (layout === "columns") {
    return (
      <div className="grid gap-4 md:grid-cols-2">
        {items.map((item, index) => (
          <div
            key={index}
            className={`rounded-2xl p-6 ${
              index % 2 === 0
                ? "bg-[#EDF3FF]"
                : "bg-[#F4F5F8]"
            }`}
          >
            <div className="mb-4 flex h-9 w-9 items-center justify-center rounded-xl bg-white text-[#315BFF]">
              <BookOpen className="h-5 w-5" />
            </div>
            <h3 className="text-base font-bold">
              {item.title}
            </h3>
            <p className="mt-3 whitespace-pre-wrap text-sm leading-7 text-slate-600">
              {item.description}
            </p>
          </div>
        ))}
      </div>
    );
  }

  if (layout === "statement") {
    return (
      <div className="mx-auto flex min-h-[220px] max-w-3xl flex-col items-center justify-center gap-7 py-5 text-center">
        <Lightbulb className="h-10 w-10 text-[#315BFF]" />
        {items.map((item, index) => (
          <div key={index}>
            <h3 className="text-xl font-bold leading-snug text-[#1A3470] sm:text-2xl">
              {item.title}
            </h3>
            <p className="mt-3 whitespace-pre-wrap text-base leading-8 text-slate-600">
              {item.description}
            </p>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div
      className={`grid gap-4 ${
        items.length === 1
          ? "grid-cols-1"
          : items.length === 2
            ? "md:grid-cols-2"
            : "md:grid-cols-2 xl:grid-cols-3"
      }`}
    >
      {items.map((item, index) => (
        <div
          key={index}
          className="flex min-h-[155px] flex-col rounded-2xl bg-[#F4F7FF] p-5"
        >
          <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-xl bg-white text-[#315BFF]">
            {screen.type === "case" ? (
              <Play className="h-5 w-5" />
            ) : (
              <Sparkles className="h-5 w-5" />
            )}
          </div>

          <h3 className="text-sm font-bold">
            {item.title}
          </h3>
          <p className="mt-3 whitespace-pre-wrap text-sm leading-7 text-slate-600">
            {item.description}
          </p>

          {index < items.length - 1 && layout === "cards" && (
            <ArrowRight className="mt-auto hidden h-4 w-4 self-end text-[#A4B7E7] md:block" />
          )}
        </div>
      ))}
    </div>
  );
}
