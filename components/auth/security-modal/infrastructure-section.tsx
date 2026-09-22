// components/auth/security-modal/infrastructure-section.tsx
import { ArrowUpRight, Database } from "lucide-react";
import { CompanyLogos, neonCompanies, vercelCompanies } from "./company-references";
import { SectionHeading } from "./section-heading";

export function InfrastructureSection() {
  return (
    <section>
      <SectionHeading
        eyebrow="Nuestra infraestructura"
        title="Tecnología en la que confiamos"
        description="CRS LAB utiliza servicios especializados para ejecutar la aplicación y gestionar su base de datos."
      />
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <ProviderCard
          name="Vercel"
          badge="Aplicación web"
          description="Infraestructura para desplegar y ejecutar la aplicación web de CRS LAB."
          href="https://security.vercel.com/"
          companies={vercelCompanies}
          vercel
        />
        <ProviderCard
          name="Neon"
          badge="Base de datos"
          description="Infraestructura PostgreSQL para almacenar y gestionar los datos de la aplicación."
          href="https://trust.neon.com/"
          companies={neonCompanies}
        />
      </div>
    </section>
  );
}

type Company = { name: string; domain: string };

function ProviderCard({ name, badge, description, href, companies, vercel = false }: {
  name: string;
  badge: string;
  description: string;
  href: string;
  companies: Company[];
  vercel?: boolean;
}) {
  return (
    <article className="relative flex min-w-0 flex-col overflow-hidden rounded-2xl border border-sky-100 bg-gradient-to-br from-sky-50/70 via-white to-white p-4 sm:p-5">
      <div aria-hidden="true" className="pointer-events-none absolute -right-12 -top-16 h-44 w-44 rounded-full bg-sky-100/70 blur-3xl" />
      <div className="relative flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <ProviderLogo vercel={vercel} />
          <h4 className="text-base font-semibold text-slate-950">{name}</h4>
        </div>
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`Consultar la seguridad de ${name}`}
          className="inline-flex shrink-0 items-center gap-1 text-[10px] font-semibold text-sky-700 hover:text-sky-900 sm:text-[11px]"
        >
          Seguridad <ArrowUpRight className="h-3.5 w-3.5" />
        </a>
      </div>
      <span className={`relative mt-2 w-fit rounded-full px-2.5 py-1 text-[10px] font-medium ${vercel ? "bg-sky-50 text-sky-700" : "bg-emerald-50 text-emerald-700"}`}>
        {badge}
      </span>
      <p className="relative mt-3 min-h-[60px] flex-1 text-xs leading-5 text-slate-500 sm:text-[13px]">
        {description}
      </p>
      <div className="relative mt-4 border-t border-sky-100 pt-3">
        <p className="mb-3 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
          Empresas que utilizan {name}
        </p>
        <CompanyLogos companies={companies} />
      </div>
    </article>
  );
}

function ProviderLogo({ vercel }: { vercel: boolean }) {
  if (vercel) {
    return (
      <svg viewBox="0 0 24 24" className="h-7 w-7 shrink-0 fill-current text-slate-950" aria-hidden="true">
        <path d="M12 2 24 22H0L12 2Z" />
      </svg>
    );
  }
  return (
    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600">
      <Database className="h-5 w-5" strokeWidth={1.8} />
    </div>
  );
}
