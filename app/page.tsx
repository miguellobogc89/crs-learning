// app/page.tsx

import { auth } from "@/auth";
import { loginWithGoogle } from "@/app/actions/auth";
import { redirect } from "next/navigation";
import Image from "next/image";
import {
  ArrowRight,
  Check,
  Sparkles,
} from "lucide-react";

export default async function HomePage() {
  const session = await auth();

  if (session?.user) {
    redirect("/knowledge");
  }

  return (
    <div className="flex min-h-screen w-full bg-background text-foreground">
      {/* =========================================================
          PANEL IZQUIERDO
          Visible desde LG
      ========================================================= */}
      <aside className="relative hidden min-h-screen w-[42%] flex-col justify-between overflow-hidden border-r border-border bg-sidebar px-8 py-8 lg:flex xl:w-[44%] xl:px-10 xl:py-10 2xl:w-[46%] 2xl:px-14 2xl:py-12">
        <BrandBackground />

        {/* Logo */}
        <div className="relative z-10 flex items-center gap-3">
          <div className="relative h-10 w-10 overflow-hidden rounded-xl xl:h-11 xl:w-11">
            <Image
              src="/logo/logo.png"
              alt="CRS LAB"
              fill
              priority
              className="object-contain"
            />
          </div>

          <span className="text-[15px] font-semibold tracking-tight xl:text-base">
            CRS LAB
          </span>
        </div>

        {/* Contenido principal */}
        <div className="relative z-10 max-w-sm xl:max-w-md 2xl:max-w-lg">
          <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-[#1DA1F2]/20 bg-[#1DA1F2]/10 px-3 py-1.5 text-xs font-medium text-[#1DA1F2]">
            <Sparkles className="h-3.5 w-3.5" />
            Plataforma de conocimiento interno
          </div>

          <h2 className="text-[28px] font-semibold leading-[1.15] tracking-tight xl:text-3xl 2xl:text-4xl">
            Todo el conocimiento de tu empresa, en un solo lugar.
          </h2>

          <p className="mt-4 max-w-md text-sm leading-6 text-muted-foreground xl:text-[15px] 2xl:text-base 2xl:leading-7">
            Centraliza documentación, crea formación y transforma el
            conocimiento interno de tu organización en información accesible
            para todo tu equipo.
          </p>

          <div className="mt-7 space-y-3.5 xl:mt-8">
            <Feature text="Knowledge con IA integrada" />
            <Feature text="Formación y aprendizaje interno" />
            <Feature text="Conocimiento organizado por equipos" />
          </div>
        </div>

        {/* Footer */}
        <div className="relative z-10 text-xs text-muted-foreground">
          © 2026 CRS LAB
        </div>
      </aside>

      {/* =========================================================
          PANEL DERECHO
      ========================================================= */}
      <main className="flex min-h-screen flex-1 flex-col">
        {/* Header */}
        <header className="flex h-16 items-center justify-between px-5 sm:px-8 lg:h-20 lg:px-8 xl:px-10 2xl:px-14">
          {/* Logo móvil / tablet */}
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

          {/* Registro superior */}
          <div className="flex items-center gap-2 text-xs text-muted-foreground sm:text-sm">
            <span className="hidden sm:inline">¿No tienes cuenta?</span>

            {/* TODO: conectar registro */}
            <button
              type="button"
              className="font-medium text-foreground transition-colors hover:text-[#1DA1F2]"
            >
              Crear cuenta
            </button>
          </div>
        </header>

        {/* Zona central */}
        <div className="flex flex-1 items-center justify-center px-5 pb-12 pt-4 sm:px-8 sm:pb-16 lg:px-10 lg:pb-20 xl:px-12 2xl:px-16">
          <div className="w-full max-w-[390px] sm:max-w-[410px] xl:max-w-[430px] 2xl:max-w-[450px]">
            {/* Logo móvil pequeño */}
            <div className="mb-8 flex justify-center lg:hidden">
              <div className="relative h-14 w-14 overflow-hidden rounded-2xl sm:h-16 sm:w-16">
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
              <h1 className="text-2xl font-semibold tracking-tight sm:text-[26px] 2xl:text-3xl">
                Bienvenido de nuevo
              </h1>

              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                Inicia sesión para acceder a tu espacio de trabajo.
              </p>
            </div>

            {/* =====================================================
                GOOGLE
            ===================================================== */}
            <form action={loginWithGoogle} className="mt-7">
              <button
                type="submit"
                className="flex h-11 w-full items-center justify-center gap-3 rounded-lg border border-input bg-background px-4 text-sm font-medium shadow-sm transition-all hover:border-[#1DA1F2]/40 hover:bg-accent focus:outline-none focus:ring-2 focus:ring-[#1DA1F2]/20 sm:h-11"
              >
                <GoogleIcon />

                Continuar con Google
              </button>
            </form>

            {/* Separador */}
            <div className="my-6 flex items-center gap-3">
              <div className="h-px flex-1 bg-border" />

              <span className="whitespace-nowrap text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground sm:text-[11px]">
                o continúa con email
              </span>

              <div className="h-px flex-1 bg-border" />
            </div>

            {/* =====================================================
                LOGIN EMAIL
                UI preparada. Funcionalidad pendiente.
            ===================================================== */}
            <form className="space-y-4">
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
                  className="h-11 w-full rounded-lg border border-input bg-background px-3.5 text-sm outline-none transition-all placeholder:text-muted-foreground/60 focus:border-[#1DA1F2] focus:ring-2 focus:ring-[#1DA1F2]/15"
                />
              </div>

              <div>
                <div className="mb-1.5 flex items-center justify-between">
                  <label
                    htmlFor="password"
                    className="text-xs font-medium text-foreground/80"
                  >
                    Contraseña
                  </label>

                  {/* TODO: conectar recuperación de contraseña */}
                  <button
                    type="button"
                    className="text-xs font-medium text-muted-foreground transition-colors hover:text-[#1DA1F2]"
                  >
                    ¿Olvidaste tu contraseña?
                  </button>
                </div>

                <input
                  id="password"
                  name="password"
                  type="password"
                  autoComplete="current-password"
                  placeholder="••••••••"
                  className="h-11 w-full rounded-lg border border-input bg-background px-3.5 text-sm outline-none transition-all placeholder:text-muted-foreground/60 focus:border-[#1DA1F2] focus:ring-2 focus:ring-[#1DA1F2]/15"
                />
              </div>

              <div className="flex items-center justify-between py-0.5">
                <label className="flex cursor-pointer items-center gap-2 text-xs text-muted-foreground">
                  <input
                    type="checkbox"
                    defaultChecked
                    className="h-3.5 w-3.5 rounded border-input accent-[#1DA1F2]"
                  />

                  Mantener sesión iniciada
                </label>
              </div>

              {/* TODO:
                  Este botón es solo UI.
                  Cuando implementemos auth por email,
                  aquí irá su server action.
              */}
              <button
                type="button"
                className="flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-[#1DA1F2] px-4 text-sm font-semibold text-white shadow-sm transition-all hover:bg-[#168BD2] focus:outline-none focus:ring-2 focus:ring-[#1DA1F2]/30 focus:ring-offset-2"
              >
                Iniciar sesión
                <ArrowRight className="h-4 w-4" />
              </button>
            </form>

            {/* Registro móvil */}
            <div className="mt-6 text-center sm:hidden">
              <p className="text-xs text-muted-foreground">
                ¿Todavía no tienes una cuenta?{" "}
                <button
                  type="button"
                  className="font-semibold text-[#1DA1F2]"
                >
                  Regístrate
                </button>
              </p>
            </div>

            {/* Legal */}
            <p className="mx-auto mt-8 max-w-sm text-center text-[10px] leading-5 text-muted-foreground/80 sm:text-[11px]">
              Al continuar aceptas los{" "}
              <button
                type="button"
                className="underline-offset-2 hover:text-foreground hover:underline"
              >
                Términos de uso
              </button>{" "}
              y la{" "}
              <button
                type="button"
                className="underline-offset-2 hover:text-foreground hover:underline"
              >
                Política de privacidad
              </button>{" "}
              de CRS LAB.
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}

/* =============================================================
   FEATURES
============================================================= */

function Feature({ text }: { text: string }) {
  return (
    <div className="flex items-center gap-3 text-sm text-foreground/80 2xl:text-[15px]">
      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#1DA1F2]/15 text-[#1DA1F2]">
        <Check className="h-3 w-3 stroke-[2.5]" />
      </span>

      <span>{text}</span>
    </div>
  );
}

/* =============================================================
   GOOGLE ICON
============================================================= */

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

/* =============================================================
   FONDO PANEL IZQUIERDO
============================================================= */

function BrandBackground() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      {/* Glow principal */}
      <div className="absolute -left-32 top-[30%] h-[420px] w-[420px] rounded-full bg-[#1DA1F2]/15 blur-[140px]" />

      {/* Glow superior */}
      <div className="absolute -right-20 -top-20 h-72 w-72 rounded-full bg-[#1DA1F2]/10 blur-[120px]" />

      {/* Grid */}
      <div
        className="absolute inset-0 opacity-[0.035]"
        style={{
          backgroundImage:
            "linear-gradient(currentColor 1px, transparent 1px), linear-gradient(90deg, currentColor 1px, transparent 1px)",
          backgroundSize: "40px 40px",
        }}
      />

      {/* Degradado para profundidad */}
      <div className="absolute inset-0 bg-gradient-to-br from-transparent via-transparent to-background/10" />
    </div>
  );
}