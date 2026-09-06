"use client";

import { useActionState } from "react";
import { ArrowRight } from "lucide-react";

import {
  type AuthActionState,
  registerWithCredentials,
} from "@/app/actions/auth";
import { AuthFormMessage } from "@/components/auth/auth-form-message";
import { Button } from "@/components/ui/button";

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

      <Button
        type="submit"
        disabled={pending || state.status === "success"}
        variant="brand"
        className="h-11 w-full gap-2 px-4 font-semibold shadow-sm"
      >
        {pending ? "Creando cuenta..." : "Crear cuenta"}
        <ArrowRight className="h-4 w-4" />
      </Button>
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
        className="h-11 w-full rounded-lg border border-input bg-background px-3.5 text-sm outline-none transition-all placeholder:text-muted-foreground/60 focus:border-brand-border focus:ring-2 focus:ring-brand/15"
      />
    </div>
  );
}
