import { ForgotPasswordForm } from "@/components/auth/forgot-password-form";
import Image from "next/image";
import Link from "next/link";

export default function ForgotPasswordPage() {
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

        <div className="text-center lg:text-left">
          <h1 className="text-2xl font-semibold tracking-tight sm:text-[26px] 2xl:text-3xl">
            Recuperar contrasena
          </h1>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            Te enviaremos un enlace temporal si el email corresponde a una
            cuenta con contrasena.
          </p>
        </div>

        <ForgotPasswordForm />

        <p className="mt-6 text-center text-xs text-muted-foreground">
          Recordaste tu contrasena?{" "}
          <Link href="/" className="font-semibold text-brand">
            Volver al login
          </Link>
        </p>
      </div>
    </main>
  );
}
