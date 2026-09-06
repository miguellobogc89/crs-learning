"use client";

import { useActionState } from "react";
import Link from "next/link";
import { KeyRound } from "lucide-react";

import {
  type AuthActionState,
  resetPassword,
} from "@/app/actions/auth";
import { AuthFormMessage } from "@/components/auth/auth-form-message";
import { Button } from "@/components/ui/button";

const initialState: AuthActionState = {
  status: "idle",
  message: "",
};

export function ResetPasswordForm({ token }: { token: string }) {
  const [state, formAction, pending] = useActionState(
    resetPassword,
    initialState,
  );

  return (
    <form action={formAction} className="mt-7 space-y-4">
      <input type="hidden" name="token" value={token} />
      <AuthFormMessage state={state} />

      <PasswordInput
        id="password"
        name="password"
        label="Nueva contrasena"
        placeholder="Minimo 8 caracteres"
      />
      <PasswordInput
        id="confirmPassword"
        name="confirmPassword"
        label="Repetir contrasena"
        placeholder="Repite tu contrasena"
      />

      {state.status === "success" ? (
        <Button asChild variant="brand" className="h-11 w-full px-4 font-semibold shadow-sm">
          <Link href="/">Ir al login</Link>
        </Button>
      ) : (
        <Button
          type="submit"
          disabled={pending}
          variant="brand"
          className="h-11 w-full gap-2 px-4 font-semibold shadow-sm"
        >
          {pending ? "Guardando..." : "Cambiar contrasena"}
          <KeyRound className="h-4 w-4" />
        </Button>
      )}
    </form>
  );
}

function PasswordInput({
  id,
  name,
  label,
  placeholder,
}: {
  id: string;
  name: string;
  label: string;
  placeholder: string;
}) {
  return (
    <div>
      <label
        htmlFor={id}
        className="mb-1.5 block text-xs font-medium text-foreground/80"
      >
        {label}
      </label>
      <input
        id={id}
        name={name}
        type="password"
        autoComplete="new-password"
        placeholder={placeholder}
        required
        className="h-11 w-full rounded-lg border border-input bg-background px-3.5 text-sm outline-none transition-all placeholder:text-muted-foreground/60 focus:border-brand-border focus:ring-2 focus:ring-brand/15"
      />
    </div>
  );
}
