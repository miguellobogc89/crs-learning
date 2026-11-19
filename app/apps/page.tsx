import Link from "next/link";
import { ArrowUpRight } from "lucide-react";

import { AppModuleIcon } from "@/components/platform/app-navigation";
import { AppShell } from "@/components/platform/app-shell";
import { APP_MODULES, type AppDefinition } from "@/lib/platform/apps";

function AppCard({ app }: { app: AppDefinition }) {
  return (
    <Link
      href={app.platformHref}
      className="group rounded-3xl border border-slate-200 bg-white p-6 shadow-sm transition-all hover:-translate-y-0.5 hover:border-blue-200 hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <div className="flex items-start justify-between gap-4">
        <span className="flex size-12 items-center justify-center rounded-2xl bg-blue-50 text-blue-600">
          <AppModuleIcon appId={app.id} />
        </span>
        <ArrowUpRight className="size-5 text-slate-400 transition-colors group-hover:text-blue-600" aria-hidden="true" />
      </div>
      <h2 className="mt-7 text-lg font-semibold tracking-tight text-slate-900">{app.title}</h2>
      <p className="mt-1.5 text-sm leading-6 text-slate-500">{app.description}</p>
      <p className="mt-4 text-xs font-semibold text-blue-600">
        {app.id === "trading" ? "Explorar componentes" : "Abrir estructura"}
      </p>
    </Link>
  );
}

export default function AppsPage() {
  return (
    <AppShell title="Mis aplicaciones">
      <div className="pb-8 pt-5 sm:pt-10">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-600">Plataforma CRS</p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">Mis aplicaciones</h1>
        <p className="mt-3 max-w-xl text-sm leading-6 text-slate-500 sm:text-base">
          Accede a los módulos de CRS. Sus interiores comparten navegación y componentes, pero mantendrán sus funciones separadas.
        </p>
      </div>
      <section aria-label="Módulos de CRS" className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {APP_MODULES.map((app) => <AppCard key={app.id} app={app} />)}
      </section>
    </AppShell>
  );
}
