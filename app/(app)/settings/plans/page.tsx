// app/(app)/settings/plans

import {
  Building2,
  Check,
  Minus,
  Sparkles,
  UsersRound,
} from "lucide-react";

import { SettingsShell } from "@/components/settings/settings-shell";
import { Button } from "@/components/ui/button";

type Plan = {
  name: string;
  description: string;
  price: string;
  priceDetail?: string;
  badge?: string;
  current?: boolean;
  cta: string;
  ctaDisabled?: boolean;
  features: string[];
};

const plans: Plan[] = [
  {
    name: "Free",
    description: "Para descubrir CRS LAB y probarlo con un pequeño equipo.",
    price: "0 €",
    priceDetail: "para siempre",
    current: true,
    cta: "Plan actual",
    ctaDisabled: true,
    features: [
      "1 workspace",
      "Hasta 3 miembros",
      "2 grupos",
      "Knowledge",
      "Asistente IA",
      "Uso de IA limitado",
      "Almacenamiento básico",
    ],
  },
  {
    name: "Pro",
    description: "Para profesionales y pequeños equipos que trabajan con CRS cada día.",
    price: "29 €",
    priceDetail: "por usuario / mes",
    badge: "Recomendado",
    cta: "Mejorar a Pro",
    ctaDisabled: true,
    features: [
      "Hasta 3 workspaces",
      "Hasta 15 miembros",
      "10 grupos",
      "Mayor capacidad de IA",
      "Más almacenamiento",
      "Permisos avanzados",
      "Agentes IA",
    ],
  },
  {
    name: "Business",
    description: "Para departamentos y empresas que quieren desplegar CRS en su organización.",
    price: "Desde 299 €",
    priceDetail: "al mes",
    cta: "Hablar con ventas",
    ctaDisabled: true,
    features: [
      "Workspaces ampliados",
      "25–150+ usuarios",
      "Grupos ilimitados",
      "Pool de IA para la empresa",
      "Administración avanzada",
      "Agentes e integraciones",
      "Actividad y control avanzados",
    ],
  },
  {
    name: "Enterprise",
    description: "Para organizaciones con necesidades avanzadas de seguridad y despliegue.",
    price: "A medida",
    cta: "Contactar",
    ctaDisabled: true,
    features: [
      "Usuarios personalizados",
      "Workspaces personalizados",
      "SSO y seguridad empresarial",
      "Auditoría avanzada",
      "Controles administrativos",
      "Capacidad de IA personalizada",
      "Soporte y despliegue dedicado",
    ],
  },
];

const comparisonRows = [
  {
    feature: "Workspaces",
    free: "1",
    pro: "3",
    business: "Ampliados",
    enterprise: "Personalizado",
  },
  {
    feature: "Miembros",
    free: "3",
    pro: "15",
    business: "25–150+",
    enterprise: "Personalizado",
  },
  {
    feature: "Grupos",
    free: "2",
    pro: "10",
    business: "Ilimitados",
    enterprise: "Ilimitados",
  },
  {
    feature: "Knowledge",
    free: true,
    pro: true,
    business: true,
    enterprise: true,
  },
  {
    feature: "Asistente IA",
    free: true,
    pro: true,
    business: true,
    enterprise: true,
  },
  {
    feature: "Capacidad de IA",
    free: "Básica",
    pro: "Ampliada",
    business: "Pool empresa",
    enterprise: "Personalizada",
  },
  {
    feature: "Agentes IA",
    free: "Básico",
    pro: "Incluidos",
    business: "Avanzados",
    enterprise: "Avanzados",
  },
  {
    feature: "Permisos avanzados",
    free: false,
    pro: true,
    business: true,
    enterprise: true,
  },
  {
    feature: "Administración centralizada",
    free: false,
    pro: false,
    business: true,
    enterprise: true,
  },
  {
    feature: "SSO y auditoría avanzada",
    free: false,
    pro: false,
    business: false,
    enterprise: true,
  },
];

export default function PlansPage() {
  return (
    <SettingsShell>
      <main className="mx-auto w-full max-w-7xl px-6 py-8 lg:px-8 lg:py-10">
        <header className="max-w-2xl">
          <div className="flex items-center gap-2 text-sm font-medium text-brand">
            <Sparkles className="h-4 w-4" />
            Planes CRS LAB
          </div>

          <h1 className="mt-3 text-3xl font-semibold tracking-tight text-foreground">
            Elige cómo quieres trabajar con CRS
          </h1>

          <p className="mt-3 text-sm leading-6 text-muted-foreground">
            Empieza gratis, incorpora a tu equipo y amplía capacidades cuando
            CRS forme parte de vuestro trabajo diario.
          </p>
        </header>

        <section className="mt-10 grid gap-4 lg:grid-cols-2 xl:grid-cols-4">
          {plans.map((plan) => (
            <PlanCard key={plan.name} plan={plan} />
          ))}
        </section>

        <section className="mt-16">
          <div className="mb-6">
            <h2 className="text-xl font-semibold tracking-tight text-foreground">
              Comparar planes
            </h2>

            <p className="mt-1 text-sm text-muted-foreground">
              Una visión general de las capacidades incluidas en cada nivel.
            </p>
          </div>

          <div className="overflow-x-auto rounded-xl border border-border">
            <table className="w-full min-w-[820px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="px-5 py-4 text-left font-medium text-muted-foreground">
                    Funcionalidad
                  </th>

                  {plans.map((plan) => (
                    <th
                      key={plan.name}
                      className="px-5 py-4 text-left font-semibold text-foreground"
                    >
                      <div className="flex items-center gap-2">
                        {plan.name}

                        {plan.current ? (
                          <span className="rounded-full bg-brand-soft px-2 py-0.5 text-[10px] font-medium text-brand">
                            Actual
                          </span>
                        ) : null}
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>

              <tbody>
                {comparisonRows.map((row) => (
                  <tr
                    key={row.feature}
                    className="border-b border-border last:border-0"
                  >
                    <td className="px-5 py-4 font-medium text-foreground">
                      {row.feature}
                    </td>

                    <ComparisonCell value={row.free} />
                    <ComparisonCell value={row.pro} />
                    <ComparisonCell value={row.business} />
                    <ComparisonCell value={row.enterprise} />
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="mt-16 rounded-xl border border-border bg-surface p-6 sm:flex sm:items-center sm:justify-between sm:gap-8">
          <div className="flex gap-4">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-brand-soft text-brand">
              <Building2 className="h-5 w-5" />
            </div>

            <div>
              <h2 className="text-sm font-semibold text-foreground">
                ¿Necesitas desplegar CRS en toda tu empresa?
              </h2>

              <p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">
                Podemos adaptar usuarios, capacidad de IA, almacenamiento,
                seguridad e integraciones a las necesidades de tu organización.
              </p>
            </div>
          </div>

          <Button
            type="button"
            variant="brand"
            disabled
            className="mt-5 sm:mt-0"
          >
            Contactar
          </Button>
        </section>

        <p className="mt-6 text-xs leading-5 text-muted-foreground">
          Los planes y límites mostrados están sujetos a cambios mientras CRS
          LAB continúa en desarrollo.
        </p>
      </main>
    </SettingsShell>
  );
}

function PlanCard({
  plan,
}: {
  plan: Plan;
}) {
  return (
    <article
      className={[
        "relative flex min-h-full flex-col rounded-xl border bg-background p-5",
        plan.badge
          ? "border-brand-border"
          : "border-border",
      ].join(" ")}
    >
      {plan.badge ? (
        <span className="absolute right-4 top-4 rounded-full bg-brand-soft px-2 py-1 text-[10px] font-semibold text-brand">
          {plan.badge}
        </span>
      ) : null}

      <div>
        <h2 className="text-base font-semibold text-foreground">
          {plan.name}
        </h2>

        <p className="mt-2 min-h-12 text-sm leading-5 text-muted-foreground">
          {plan.description}
        </p>
      </div>

      <div className="mt-6">
        <p className="text-2xl font-semibold tracking-tight text-foreground">
          {plan.price}
        </p>

        {plan.priceDetail ? (
          <p className="mt-1 text-xs text-muted-foreground">
            {plan.priceDetail}
          </p>
        ) : (
          <div className="h-5" />
        )}
      </div>

      <div className="mt-6">
        <Button
          type="button"
          variant={plan.current ? "outline" : "brand"}
          disabled={plan.ctaDisabled}
          className="w-full"
        >
          {plan.cta}
        </Button>
      </div>

      <div className="my-6 border-t border-border" />

      <ul className="space-y-3">
        {plan.features.map((feature) => (
          <li
            key={feature}
            className="flex gap-2.5 text-sm text-muted-foreground"
          >
            <Check className="mt-0.5 h-4 w-4 shrink-0 text-brand" />

            <span>{feature}</span>
          </li>
        ))}
      </ul>
    </article>
  );
}

function ComparisonCell({
  value,
}: {
  value: string | boolean;
}) {
  return (
    <td className="px-5 py-4 text-muted-foreground">
      {value === true ? (
        <Check className="h-4 w-4 text-brand" />
      ) : value === false ? (
        <Minus className="h-4 w-4 text-muted-foreground/40" />
      ) : (
        value
      )}
    </td>
  );
}