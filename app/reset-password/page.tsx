import { ResetPasswordForm } from "@/components/auth/reset-password-form";
import Image from "next/image";
import Link from "next/link";

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{
    token?: string;
  }>;
}) {
  const { token } = await searchParams;

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
            Cambiar contrasena
          </h1>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            Elige una nueva contrasena para tu cuenta.
          </p>
        </div>

        {token ? (
          <ResetPasswordForm token={token} />
        ) : (
          <div className="mt-7 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm leading-5 text-red-700">
            El enlace no es valido o esta incompleto.
          </div>
        )}

        <p className="mt-6 text-center text-xs text-muted-foreground">
          <Link href="/" className="font-semibold text-brand">
            Volver al login
          </Link>
        </p>
      </div>
    </main>
  );
}
