"use client";

import { useActionState } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";

import {
  type AuthActionState,
  loginWithCredentials,
} from "@/app/actions/auth";
import { AuthFormMessage } from "@/components/auth/auth-form-message";
import { Button } from "@/components/ui/button";

const initialState: AuthActionState = {
  status: "idle",
  message: "",
};

export function LoginCredentialsForm() {
  const [state, formAction, pending] = useActionState(
    loginWithCredentials,
    initialState,
  );

  return (
    <form action={formAction} className="space-y-4">
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

      <div>
        <div className="mb-1.5 flex items-center justify-between">
          <label
            htmlFor="password"
            className="text-xs font-medium text-foreground/80"
          >
            Contrasena
          </label>

          <Link
            href="/forgot-password"
            className="text-xs font-medium text-muted-foreground transition-colors hover:text-brand"
          >
            Olvidaste tu contrasena?
          </Link>
        </div>

        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          placeholder="********"
          required
          className="h-11 w-full rounded-lg border border-input bg-background px-3.5 text-sm outline-none transition-all placeholder:text-muted-foreground/60 focus:border-brand-border focus:ring-2 focus:ring-brand/15"
        />
      </div>

      <div className="flex items-center justify-between py-0.5">
        <label className="flex cursor-pointer items-center gap-2 text-xs text-muted-foreground">
          <input
            name="remember"
            type="checkbox"
            defaultChecked
            className="h-3.5 w-3.5 rounded border-input accent-brand"
          />
          Mantener sesion iniciada
        </label>
      </div>

      <Button
        type="submit"
        disabled={pending}
        variant="brand"
        className="h-11 w-full gap-2 px-4 font-semibold shadow-sm"
      >
        {pending ? "Iniciando..." : "Iniciar sesion"}
        <ArrowRight className="h-4 w-4" />
      </Button>
    </form>
  );
}
