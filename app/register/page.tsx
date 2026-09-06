import { auth } from "@/auth";
import { RegisterForm } from "@/components/auth/register-form";
import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";

export default async function RegisterPage() {
  const session = await auth();

  if (session?.user) {
    redirect("/dashboard");
  }

  return (
    <AuthPageShell>
      <div className="text-center lg:text-left">
        <h1 className="text-2xl font-semibold tracking-tight sm:text-[26px] 2xl:text-3xl">
          Crear cuenta
        </h1>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          Registra tu acceso con email y contrasena.
        </p>
      </div>

      <RegisterForm />

      <p className="mt-6 text-center text-xs text-muted-foreground">
        Ya tienes cuenta?{" "}
        <Link href="/" className="font-semibold text-brand">
          Inicia sesion
        </Link>
      </p>
    </AuthPageShell>
  );
}

function AuthPageShell({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-screen w-full items-center justify-center bg-background px-5 py-10 text-foreground sm:px-8">
      <div className="w-full max-w-[410px]">
        <div className="mb-8 flex items-center justify-center gap-3">
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

        {children}
      </div>
    </main>
  );
}
