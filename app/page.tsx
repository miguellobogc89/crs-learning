// app/page.tsx


import { loginWithGoogle } from "@/app/actions/auth";
import { auth } from "@/auth";
import { LoginCredentialsForm } from "@/components/auth/login-credentials-form";
import { Button } from "@/components/ui/button";
import { SecurityInfo } from "@/components/auth/security-info";

import {
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  BrainCircuit,
  Database,
  GraduationCap,
  LockKeyhole,
  ShieldCheck,
  Sparkles,
  UsersRound,
} from "lucide-react";

import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";

const features = [
  {
    icon: BrainCircuit,
    title: "Knowledge con IA integrada",
    description:
      "Encuentra, resume y crea contenido con ayuda de la inteligencia artificial.",
  },
  {
    icon: GraduationCap,
    title: "Formación y aprendizaje interno",
    description:
      "Crea rutas de aprendizaje y mide el progreso de tu equipo.",
  },
  {
    icon: UsersRound,
    title: "Conocimiento organizado por equipos",
    description:
      "Comparte información de forma estructurada y segura.",
  },
];

export default async function HomePage() {
  const session = await auth();

  if (session?.user) {
    redirect("/dashboard");
  }

  return (
    <div className="flex min-h-screen w-full bg-background text-foreground">
      {/* COLUMNA IZQUIERDA */}

      <aside className="relative hidden min-h-screen w-[44%] flex-col justify-between overflow-hidden border-r border-border bg-sidebar px-8 py-8 lg:flex xl:px-10 xl:py-10 2xl:px-14 2xl:py-12">
        <BrandBackground />

        {/* Logotipo */}

        <div className="relative z-10 flex items-center gap-3">
          <div className="relative h-11 w-11 overflow-hidden rounded-xl">
            <Image
              src="/logo/logo.png"
              alt="CRS LAB"
              fill
              priority
              className="object-contain"
            />
          </div>

          <span className="text-base font-semibold tracking-tight">
            CRS LAB
          </span>
        </div>

        {/* Contenido principal */}

        <div className="relative z-10 my-12 w-full max-w-xl">
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-brand-border bg-brand-soft px-3 py-1.5 text-xs font-medium text-brand">
            <Sparkles className="h-3.5 w-3.5" />
            Plataforma de conocimiento interno
          </div>

          <h2 className="max-w-lg text-[30px] font-semibold leading-[1.15] tracking-tight xl:text-[34px] 2xl:text-[40px]">
            Todo el conocimiento de tu empresa, en un solo lugar.
          </h2>

          <p className="mt-5 max-w-lg text-sm leading-7 text-muted-foreground xl:text-[15px] 2xl:text-base">
            Centraliza documentación, crea formación y transforma el
            conocimiento interno de tu organización en información
            accesible para todo tu equipo.
          </p>

          {/* Funcionalidades */}

          <div className="mt-10 space-y-7 xl:mt-12">
            {features.map((feature) => {
              const Icon = feature.icon;

              return (
                <div
                  key={feature.title}
                  className="flex items-start gap-4"
                >
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-brand-border/50 bg-brand-soft text-brand xl:h-14 xl:w-14">
                    <Icon
                      className="h-6 w-6 xl:h-7 xl:w-7"
                      strokeWidth={1.8}
                    />
                  </div>

                  <div className="min-w-0 pt-0.5">
                    <h3 className="text-sm font-semibold tracking-tight xl:text-[15px]">
                      {feature.title}
                    </h3>

                    <p className="mt-1 max-w-sm text-xs leading-5 text-muted-foreground xl:text-sm xl:leading-6">
                      {feature.description}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Seguridad y pie */}

        <div className="relative z-10 space-y-5">
          <SecurityInfo variant="sidebar" />

          <p className="text-xs text-muted-foreground">
            © 2026 CRS LAB. Todos los derechos reservados.
          </p>
        </div>
      </aside>

      {/* COLUMNA DERECHA */}

      <main className="flex min-h-screen flex-1 flex-col">
        {/* Cabecera */}

        <header className="flex h-16 shrink-0 items-center justify-between px-5 sm:px-8 lg:h-20 lg:px-10 xl:px-12 2xl:px-16">
          <div className="flex items-center gap-2.5 lg:invisible">
            <div className="relative h-8 w-8 overflow-hidden rounded-lg">
              <Image
                src="/logo/logo.png"
                alt="CRS LAB"
                fill
                priority
                className="object-contain"
              />
            </div>

            <span className="text-sm font-semibold tracking-tight">
              CRS LAB
            </span>
          </div>

          <div className="flex items-center gap-2 text-xs text-muted-foreground sm:text-sm">
            <span className="hidden sm:inline">
              ¿No tienes cuenta?
            </span>

            <Link
              href="/register"
              className="font-semibold text-brand transition-colors hover:text-brand/80"
            >
              Crear cuenta
            </Link>
          </div>
        </header>

        {/* Área de login */}

        <div className="flex flex-1 flex-col items-center justify-center px-5 py-8 sm:px-8 lg:px-10 xl:px-12 2xl:px-16">
          <div className="w-full max-w-[390px] sm:max-w-[410px] xl:max-w-[450px] 2xl:max-w-[490px]">
            {/* Logo móvil */}

            <div className="mb-8 flex justify-center lg:hidden">
              <div className="relative h-14 w-14 overflow-hidden rounded-2xl">
                <Image
                  src="/logo/logo.png"
                  alt="CRS LAB"
                  fill
                  priority
                  className="object-contain"
                />
              </div>
            </div>

            {/* Título */}

            <div className="text-center lg:text-left">
              <h1 className="text-2xl font-semibold tracking-tight xl:text-[28px]">
                Bienvenido de nuevo
              </h1>

              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                Inicia sesión para acceder a tu espacio de trabajo.
              </p>
            </div>

            {/* Google */}

            <form action={loginWithGoogle} className="mt-7">
              <Button
                type="submit"
                variant="outline"
                className="h-11 w-full gap-3 rounded-xl px-4 shadow-sm"
              >
                <GoogleIcon />
                Continuar con Google
              </Button>
            </form>

            {/* Separador */}

            <div className="my-6 flex items-center gap-3">
              <div className="h-px flex-1 bg-border" />

              <span className="whitespace-nowrap text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground sm:text-[11px]">
                O continúa con email
              </span>

              <div className="h-px flex-1 bg-border" />
            </div>

            {/* Formulario existente */}

            <LoginCredentialsForm />

            {/* Registro móvil */}

            <div className="mt-6 text-center sm:hidden">
              <p className="text-xs text-muted-foreground">
                ¿Todavía no tienes una cuenta?{" "}
                <Link
                  href="/register"
                  className="font-semibold text-brand"
                >
                  Regístrate
                </Link>
              </p>
            </div>

            {/* Términos */}

            <p className="mx-auto mt-7 max-w-sm text-center text-[10px] leading-5 text-muted-foreground sm:text-[11px]">
              Al continuar aceptas los{" "}
              <span className="font-medium text-brand">
                Términos de uso
              </span>{" "}
              y la{" "}
              <span className="font-medium text-brand">
                Política de privacidad
              </span>{" "}
              de CRS LAB.
            </p>

            {/* TARJETA DE SEGURIDAD */}

            <SecurityInfo variant="login" />

            {/* Pie móvil */}

            <p className="mt-8 text-center text-[10px] text-muted-foreground lg:hidden">
              © 2026 CRS LAB
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}

/* ICONO GOOGLE */

function GoogleIcon() {
  return (
    <svg
      className="h-[18px] w-[18px] shrink-0"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.76h3.56c2.08-1.92 3.28-4.74 3.28-8.09Z"
      />

      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.56-2.76c-.98.66-2.23 1.06-3.72 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23Z"
      />

      <path
        fill="#FBBC05"
        d="M5.84 14.1a6.6 6.6 0 0 1 0-4.2V7.06H2.18a11 11 0 0 0 0 9.88l3.66-2.84Z"
      />

      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84C6.71 7.3 9.14 5.38 12 5.38Z"
      />
    </svg>
  );
}

/* FONDO CORPORATIVO */

function BrandBackground() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      <div className="absolute -left-32 top-[30%] h-[420px] w-[420px] rounded-full bg-brand/15 blur-[140px]" />

      <div className="absolute -right-20 -top-20 h-72 w-72 rounded-full bg-brand/10 blur-[120px]" />

      <div
        className="absolute inset-0 opacity-[0.035]"
        style={{
          backgroundImage:
            "linear-gradient(currentColor 1px, transparent 1px), linear-gradient(90deg, currentColor 1px, transparent 1px)",
          backgroundSize: "40px 40px",
        }}
      />

      <div className="absolute inset-0 bg-gradient-to-br from-transparent via-transparent to-background/10" />
    </div>
  );
}