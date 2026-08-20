"use client";

import { useActionState } from "react";
import { ArrowRight } from "lucide-react";

import {
  type AuthActionState,
  registerWithCredentials,
} from "@/app/actions/auth";
import { AuthFormMessage } from "@/components/auth/auth-form-message";

const initialState: AuthActionState = {
  status: "idle",
  message: "",
};

export function RegisterForm() {
  const [state, formAction, pending] = useActionState(
    registerWithCredentials,
    initialState,
  );

  return (
    <form action={formAction} className="mt-7 space-y-4">
      <AuthFormMessage state={state} />

      <AuthInput
        id="name"
        name="name"
        label="Nombre"
        autoComplete="name"
        placeholder="Tu nombre"
      />
      <AuthInput
        id="email"
        name="email"
        label="Email"
        type="email"
        autoComplete="email"
        placeholder="nombre@empresa.com"
      />
      <AuthInput
        id="password"
        name="password"
        label="Contrasena"
        type="password"
        autoComplete="new-password"
        placeholder="Minimo 8 caracteres"
      />
      <AuthInput
        id="confirmPassword"
        name="confirmPassword"
        label="Repetir contrasena"
        type="password"
        autoComplete="new-password"
        placeholder="Repite tu contrasena"
      />

      <button
        type="submit"
        disabled={pending || state.status === "success"}
        className="flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-[#1DA1F2] px-4 text-sm font-semibold text-white shadow-sm transition-all hover:bg-[#168BD2] focus:outline-none focus:ring-2 focus:ring-[#1DA1F2]/30 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-70"
      >
        {pending ? "Creando cuenta..." : "Crear cuenta"}
        <ArrowRight className="h-4 w-4" />
      </button>
    </form>
  );
}

function AuthInput({
  id,
  name,
  label,
  type = "text",
  autoComplete,
  placeholder,
}: {
  id: string;
  name: string;
  label: string;
  type?: string;
  autoComplete: string;
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
        type={type}
        autoComplete={autoComplete}
        placeholder={placeholder}
        required
        className="h-11 w-full rounded-lg border border-input bg-background px-3.5 text-sm outline-none transition-all placeholder:text-muted-foreground/60 focus:border-[#1DA1F2] focus:ring-2 focus:ring-[#1DA1F2]/15"
      />
    </div>
  );
}
