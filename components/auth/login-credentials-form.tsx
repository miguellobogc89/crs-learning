"use client";

import { useActionState } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";

import {
  type AuthActionState,
  loginWithCredentials,
} from "@/app/actions/auth";
import { AuthFormMessage } from "@/components/auth/auth-form-message";

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
          className="h-11 w-full rounded-lg border border-input bg-background px-3.5 text-sm outline-none transition-all placeholder:text-muted-foreground/60 focus:border-[#1DA1F2] focus:ring-2 focus:ring-[#1DA1F2]/15"
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
            className="text-xs font-medium text-muted-foreground transition-colors hover:text-[#1DA1F2]"
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
          className="h-11 w-full rounded-lg border border-input bg-background px-3.5 text-sm outline-none transition-all placeholder:text-muted-foreground/60 focus:border-[#1DA1F2] focus:ring-2 focus:ring-[#1DA1F2]/15"
        />
      </div>

      <div className="flex items-center justify-between py-0.5">
        <label className="flex cursor-pointer items-center gap-2 text-xs text-muted-foreground">
          <input
            name="remember"
            type="checkbox"
            defaultChecked
            className="h-3.5 w-3.5 rounded border-input accent-[#1DA1F2]"
          />
          Mantener sesion iniciada
        </label>
      </div>

      <button
        type="submit"
        disabled={pending}
        className="flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-[#1DA1F2] px-4 text-sm font-semibold text-white shadow-sm transition-all hover:bg-[#168BD2] focus:outline-none focus:ring-2 focus:ring-[#1DA1F2]/30 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-70"
      >
        {pending ? "Iniciando..." : "Iniciar sesion"}
        <ArrowRight className="h-4 w-4" />
      </button>
    </form>
  );
}
