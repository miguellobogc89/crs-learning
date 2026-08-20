"use client";

import { useActionState } from "react";
import { Send } from "lucide-react";

import {
  type AuthActionState,
  requestPasswordReset,
} from "@/app/actions/auth";
import { AuthFormMessage } from "@/components/auth/auth-form-message";

const initialState: AuthActionState = {
  status: "idle",
  message: "",
};

export function ForgotPasswordForm() {
  const [state, formAction, pending] = useActionState(
    requestPasswordReset,
    initialState,
  );

  return (
    <form action={formAction} className="mt-7 space-y-4">
      <AuthFormMessage state={state} />

      <div>
        <label
          htmlFor="email"
          className="mb-1.5 block text-xs font-medium text-foreground/80"
        >
          Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          placeholder="nombre@empresa.com"
          required
          className="h-11 w-full rounded-lg border border-input bg-background px-3.5 text-sm outline-none transition-all placeholder:text-muted-foreground/60 focus:border-[#1DA1F2] focus:ring-2 focus:ring-[#1DA1F2]/15"
        />
      </div>

      <button
        type="submit"
        disabled={pending}
        className="flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-[#1DA1F2] px-4 text-sm font-semibold text-white shadow-sm transition-all hover:bg-[#168BD2] focus:outline-none focus:ring-2 focus:ring-[#1DA1F2]/30 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-70"
      >
        {pending ? "Enviando..." : "Enviar enlace"}
        <Send className="h-4 w-4" />
      </button>
    </form>
  );
}
