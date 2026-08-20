"use client";

import { useActionState } from "react";
import Link from "next/link";
import { KeyRound } from "lucide-react";

import {
  type AuthActionState,
  resetPassword,
} from "@/app/actions/auth";
import { AuthFormMessage } from "@/components/auth/auth-form-message";

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
        <Link
          href="/"
          className="flex h-11 w-full items-center justify-center rounded-lg bg-[#1DA1F2] px-4 text-sm font-semibold text-white shadow-sm transition-all hover:bg-[#168BD2]"
        >
          Ir al login
        </Link>
      ) : (
        <button
          type="submit"
          disabled={pending}
          className="flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-[#1DA1F2] px-4 text-sm font-semibold text-white shadow-sm transition-all hover:bg-[#168BD2] focus:outline-none focus:ring-2 focus:ring-[#1DA1F2]/30 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-70"
        >
          {pending ? "Guardando..." : "Cambiar contrasena"}
          <KeyRound className="h-4 w-4" />
        </button>
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
        className="h-11 w-full rounded-lg border border-input bg-background px-3.5 text-sm outline-none transition-all placeholder:text-muted-foreground/60 focus:border-[#1DA1F2] focus:ring-2 focus:ring-[#1DA1F2]/15"
      />
    </div>
  );
}
