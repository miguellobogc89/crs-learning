"use client";

import { useActionState } from "react";
import { Send } from "lucide-react";

import {
  type AuthActionState,
  requestPasswordReset,
} from "@/app/actions/auth";
import { AuthFormMessage } from "@/components/auth/auth-form-message";
import { Button } from "@/components/ui/button";

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
          className="h-11 w-full rounded-lg border border-input bg-background px-3.5 text-sm outline-none transition-all placeholder:text-muted-foreground/60 focus:border-brand-border focus:ring-2 focus:ring-brand/15"
        />
      </div>

      <Button
        type="submit"
        disabled={pending}
        variant="brand"
        className="h-11 w-full gap-2 px-4 font-semibold shadow-sm"
      >
        {pending ? "Enviando..." : "Enviar enlace"}
        <Send className="h-4 w-4" />
      </Button>
    </form>
  );
}
