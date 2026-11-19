import Image from "next/image";
import Link from "next/link";
import {
  ArrowUpRight,
  BookOpenText,
  ChartCandlestick,
  IceCreamBowl,
  Wallet,
  type LucideIcon,
} from "lucide-react";

import { APP_MODULES, type AppDefinition, type AppId } from "@/lib/platform/apps";

const ICONS: Record<AppId, LucideIcon> = {
  trading: ChartCandlestick,
  finanzas: Wallet,
  negocio: BookOpenText,
  heladeria: IceCreamBowl,
};

function AppCard({ app }: { app: AppDefinition }) {
  const Icon = ICONS[app.id];
  const isPreview = app.id === "trading";
  const content = (
    <>
      <div className="flex items-start justify-between gap-4">
        <span className="flex size-12 items-center justify-center rounded-2xl bg-blue-50 text-blue-600">
          <Icon className="size-6" strokeWidth={1.8} aria-hidden="true" />
        </span>
        {isPreview ? (
          <ArrowUpRight className="size-5 text-blue-600" aria-hidden="true" />
        ) : (
          <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-medium text-slate-500">En preparación</span>
        )}
      </div>
      <div className="mt-7">
        <h2 className="text-lg font-semibold tracking-tight text-slate-900">{app.title}</h2>
        <p className="mt-1.5 text-sm leading-6 text-slate-500">{app.description}</p>
        {isPreview && <p className="mt-4 text-xs font-semibold text-[#0A58FF]">Explorar componentes</p>}
      </div>
    </>
  );

  if (isPreview) {
    return (
      <Link
        href="/apps/trading"
        className="group rounded-3xl border border-blue-200 bg-white p-6 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
      >
        {content}
      </Link>
    );
  }

  return <article className="rounded-3xl border border-slate-200 bg-white p-6 opacity-75">{content}</article>;
}

export default function AppsPage() {
  return (
    <main className="min-h-dvh bg-[#F8FAFC] px-5 pb-12 pt-[max(1.5rem,env(safe-area-inset-top))] text-slate-900 sm:px-8 lg:px-12">
      <div className="mx-auto max-w-5xl">
        <header className="flex items-center justify-between gap-3">
          <Link href="/apps" className="flex items-center gap-3" aria-label="Inicio de CRS">
            <span className="flex size-10 items-center justify-center rounded-xl bg-slate-900">
              <Image src="/logo/logo.png" alt="" width={30} height={30} className="size-7 object-contain" />
            </span>
            <span className="font-semibold tracking-tight">CRS</span>
          </Link>
          <span className="rounded-full border border-blue-100 bg-blue-50 px-3 py-1.5 text-xs font-medium text-blue-700">
            Estructura de la app
          </span>
        </header>

        <div className="pb-8 pt-14 sm:pt-20">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-600">Plataforma CRS</p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">Mis aplicaciones</h1>
          <p className="mt-3 max-w-xl text-sm leading-6 text-slate-500 sm:text-base">
            Una sola aplicación para todos los módulos. Explora la estructura y prueba los componentes sin iniciar sesión.
          </p>
        </div>

        <section aria-label="Módulos de CRS" className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {APP_MODULES.map((app) => <AppCard key={app.id} app={app} />)}
        </section>
      </div>
    </main>
  );
}
