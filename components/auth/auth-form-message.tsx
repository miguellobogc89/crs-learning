"use client";

import type { AuthActionState } from "@/app/actions/auth";

export function AuthFormMessage({ state }: { state: AuthActionState }) {
  if (!state.message) {
    return null;
  }

  const className =
    state.status === "success"
      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
      : "border-red-200 bg-red-50 text-red-700";

  return (
    <p
      aria-live="polite"
      className={`rounded-lg border px-3 py-2 text-sm leading-5 ${className}`}
    >
      {state.message}
    </p>
  );
}
