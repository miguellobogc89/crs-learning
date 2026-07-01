// app/page.tsx
import { auth } from "@/auth";
import { loginWithGoogle, logout } from "@/app/actions/auth";
import Link from "next/link";

export default async function HomePage() {
  const session = await auth();

  return (
    <main className="min-h-screen bg-slate-950 text-white">
      <section className="mx-auto flex min-h-screen max-w-5xl flex-col items-center justify-center px-6 text-center">
        <p className="mb-4 rounded-full border border-cyan-400/30 px-4 py-1 text-sm text-cyan-300">
          CRS Learning
        </p>

        <h1 className="max-w-3xl text-5xl font-bold tracking-tight">
          Aprende Power Query con cursos prácticos y progreso gamificado.
        </h1>

        <p className="mt-6 max-w-2xl text-lg text-slate-300">
          Formación guiada, módulos desbloqueables, tests, niveles, XP y logros.
        </p>

        <div className="mt-10 flex gap-4">
          {session?.user ? (
            <>
              <Link
                href="/dashboard"
                className="rounded-xl bg-cyan-400 px-6 py-3 font-semibold text-slate-950"
              >
                Ir al dashboard
              </Link>

              <form action={logout}>
                <button className="rounded-xl border border-slate-600 px-6 py-3 font-semibold">
                  Salir
                </button>
              </form>
            </>
          ) : (
            <form action={loginWithGoogle}>
              <button className="rounded-xl bg-cyan-400 px-6 py-3 font-semibold text-slate-950">
                Entrar con Google
              </button>
            </form>
          )}
        </div>
      </section>
    </main>
  );
}