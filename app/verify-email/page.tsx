import { verifyEmailToken } from "@/lib/auth/account.service";
import Image from "next/image";
import Link from "next/link";

export default async function VerifyEmailPage({
  searchParams,
}: {
  searchParams: Promise<{
    token?: string;
  }>;
}) {
  const { token } = await searchParams;
  const result = await verifyEmailToken(token);

  const copy = result.ok
    ? {
        title: "Email verificado",
        body: "Tu cuenta ya esta activa. Puedes iniciar sesion con tu email y contrasena.",
        tone: "success" as const,
      }
    : {
        title:
          result.reason === "expired"
            ? "Enlace caducado"
            : "Enlace no valido",
        body:
          result.reason === "expired"
            ? "El enlace de verificacion ha caducado. Crea un nuevo registro o solicita ayuda."
            : "El enlace de verificacion no existe, esta incompleto o ya fue utilizado.",
        tone: "error" as const,
      };

  const messageClass =
    copy.tone === "success"
      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
      : "border-red-200 bg-red-50 text-red-700";

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
            {copy.title}
          </h1>
        </div>

        <div
          className={`mt-7 rounded-lg border px-3 py-2 text-sm leading-5 ${messageClass}`}
        >
          {copy.body}
        </div>

        <Link
          href="/"
          className="mt-6 flex h-11 w-full items-center justify-center rounded-lg bg-[#1DA1F2] px-4 text-sm font-semibold text-white shadow-sm transition-all hover:bg-[#168BD2]"
        >
          Ir al login
        </Link>
      </div>
    </main>
  );
}
