// components/settings/plans-view.tsx

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Building2,
  Check,
  Minus,
  Sparkles,
} from "lucide-react";

import { Button } from "@/components/ui/button";

export type PlanViewModel = {
  id: string;
  code: string;
  name: string;
  description: string;

  monthlyPriceCents: number | null;
  annualDiscountPercent: number;

  maxUsers: number | null;
  maxWorkspaces: number | null;
  maxGroups: number | null;

  storageBytes: number | null;
  monthlyAiTokens: number | null;
  annualMonthlyPriceCents: number | null;

  isRecommended: boolean;
  requiresContact: boolean;

  features: {
    code: string;
    name: string;
    value: string | null;
  }[];
};

type BillingPeriod = "monthly" | "annual";

export function PlansView({
  plans,
}: {
  plans: PlanViewModel[];
}) {
  const [billingPeriod, setBillingPeriod] =
    useState<BillingPeriod>("annual");

  return (
    <div className="h-full min-h-0 overflow-y-auto">
      <main className="mx-auto w-full max-w-[1500px] px-6 py-8 pb-20 lg:px-8 lg:py-10 lg:pb-24">
        <header className="max-w-2xl">

          <h1 className="mt-3 text-3xl font-semibold tracking-tight text-foreground">
            Elige cómo quieres trabajar con CRS
          </h1>

          <p className="mt-3 text-sm leading-6 text-muted-foreground">
            Empieza de forma individual y amplía CRS a tu equipo o a toda tu
            organización cuando lo necesites.
          </p>
        </header>

        <div className="mt-8 flex justify-center">
          <BillingSwitcher
            value={billingPeriod}
            onChange={setBillingPeriod}
          />
        </div>

        <section className="mt-8 grid items-stretch gap-4 md:grid-cols-2 xl:grid-cols-5">
          {plans.map((plan) => (
            <PlanCard
              key={plan.id}
              plan={plan}
              billingPeriod={billingPeriod}
            />
          ))}
        </section>

        <section className="mt-16">
          <div className="mb-6">
            <h2 className="text-xl font-semibold tracking-tight text-foreground">
              Comparar planes
            </h2>

            <p className="mt-1 text-sm text-muted-foreground">
              Compara capacidad, usuarios y funcionalidades disponibles en
              cada nivel.
            </p>
          </div>

          <ComparisonTable plans={plans} />
        </section>

        <section className="mt-16 rounded-xl border border-border bg-surface p-6 sm:flex sm:items-center sm:justify-between sm:gap-8">
          <div className="flex gap-4">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-brand-soft text-brand">
              <Building2 className="h-5 w-5" />
            </div>

            <div>
              <h2 className="text-sm font-semibold text-foreground">
                ¿Necesitas una configuración específica?
              </h2>

              <p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">
                Enterprise permite adaptar usuarios, capacidad de IA,
                almacenamiento, seguridad e integraciones a las necesidades
                de tu organización.
              </p>
            </div>
          </div>

          <Button
            type="button"
            variant="brand"
            disabled
            className="mt-5 shrink-0 sm:mt-0"
          >
            Contactar
          </Button>
        </section>

        <p className="mt-6 text-xs leading-5 text-muted-foreground">
          Los planes, precios y límites mostrados pueden cambiar mientras CRS
          LAB continúa en desarrollo.
        </p>
      </main>
    </div>
  );
}

function BillingSwitcher({
  value,
  onChange,
}: {
  value: BillingPeriod;
  onChange: (value: BillingPeriod) => void;
}) {
  return (
    <div className="inline-flex items-center rounded-lg border border-border bg-surface p-1">
      <button
        type="button"
        onClick={() => onChange("monthly")}
        className={[
          "rounded-md px-4 py-2 text-sm font-medium transition-colors",
          value === "monthly"
            ? "bg-background text-foreground"
            : "text-muted-foreground hover:text-foreground",
        ].join(" ")}
      >
        Mensual
      </button>

      <button
        type="button"
        onClick={() => onChange("annual")}
        className={[
          "flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-colors",
          value === "annual"
            ? "bg-background text-foreground"
            : "text-muted-foreground hover:text-foreground",
        ].join(" ")}
      >
        Anual

        <span className="rounded-full bg-brand-soft px-2 py-0.5 text-[10px] font-semibold text-brand">
          -15%
        </span>
      </button>
    </div>
  );
}

function PlanCard({
  plan,
  billingPeriod,
}: {
  plan: PlanViewModel;
  billingPeriod: BillingPeriod;
}) {
  const pricing = getPricing(plan, billingPeriod);

  const router = useRouter();

const handleSelectPlan = () => {
  if (plan.requiresContact) {
    return;
  }

  if (plan.code === "free") {
    return;
  }

  const params = new URLSearchParams({
    plan: plan.code,
    billing: billingPeriod,
  });

  router.push(`/settings/billing/checkout?${params.toString()}`);
};

  return (
    <article
      className={[
        "relative flex h-full flex-col rounded-xl border bg-background p-5",
        plan.isRecommended
          ? "border-brand-border"
          : "border-border",
      ].join(" ")}
    >
      <div className="min-h-[132px]">
        <div className="flex min-h-6 items-start justify-between gap-2">
          <h2 className="text-base font-semibold text-foreground">
            {plan.name}
          </h2>

          {plan.isRecommended ? (
            <span className="shrink-0 rounded-full bg-brand-soft px-2 py-1 text-[10px] font-semibold text-brand">
              Recomendado
            </span>
          ) : null}
        </div>

        <p className="mt-2 text-sm leading-5 text-muted-foreground">
          {plan.description}
        </p>
      </div>

      <div className="min-h-[120px]">
        <p className="text-2xl font-semibold tracking-tight text-foreground">
          {pricing.price}
        </p>

        <p className="mt-1 text-xs text-muted-foreground">
          {pricing.detail}
        </p>

        {pricing.secondary ? (
          <p className="mt-2 text-xs font-medium text-foreground">
            {pricing.secondary}
          </p>
        ) : (
          <div className="h-6" />
        )}

        {pricing.saving ? (
          <p className="mt-1 text-xs font-medium text-brand">
            {pricing.saving}
          </p>
        ) : null}
      </div>

      <div className="pb-5">
        <Button
        type="button"
        variant={plan.code === "free" ? "outline" : "brand"}
        disabled={plan.code === "free" || plan.requiresContact}
        onClick={handleSelectPlan}
        className="w-full"
        >
        {plan.code === "free"
            ? "Plan actual"
            : plan.requiresContact
            ? "Contactar"
            : `Elegir ${plan.name}`}
        </Button>
      </div>

      <div className="border-t border-border" />

      <ul className="flex-1 space-y-3 pt-5">
        <PlanLimit>
          {formatUsers(plan.maxUsers)}
        </PlanLimit>

        <PlanLimit>
          {formatWorkspaces(plan.maxWorkspaces)}
        </PlanLimit>

        <PlanLimit>
          {formatGroups(plan.maxGroups)}
        </PlanLimit>

        <PlanLimit>
          {formatStorage(plan.storageBytes)}
        </PlanLimit>

        <PlanLimit>
          {formatAiCapacity(plan.monthlyAiTokens)}
        </PlanLimit>

        {plan.features.map((feature) => (
          <PlanLimit key={feature.code}>
            {feature.value
              ? `${feature.name}: ${feature.value}`
              : feature.name}
          </PlanLimit>
        ))}
      </ul>
    </article>
  );
}

function PlanLimit({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <li className="flex gap-2.5 text-sm text-muted-foreground">
      <Check className="mt-0.5 h-4 w-4 shrink-0 text-brand" />
      <span>{children}</span>
    </li>
  );
}

function ComparisonTable({
  plans,
}: {
  plans: PlanViewModel[];
}) {
  const rows = [
    {
      label: "Usuarios por organización",
      getValue: (plan: PlanViewModel) =>
        plan.maxUsers === null
          ? "A medida"
          : plan.maxUsers.toLocaleString("es-ES"),
    },
    {
      label: "Workspaces",
      getValue: (plan: PlanViewModel) =>
        plan.maxWorkspaces === null
          ? "A medida"
          : plan.maxWorkspaces.toLocaleString("es-ES"),
    },
    {
      label: "Grupos",
      getValue: (plan: PlanViewModel) =>
        plan.maxGroups === null
          ? plan.requiresContact
            ? "A medida"
            : "Ilimitados"
          : plan.maxGroups.toLocaleString("es-ES"),
    },
    {
      label: "Almacenamiento",
      getValue: (plan: PlanViewModel) =>
        formatStorageValue(plan.storageBytes, plan.requiresContact),
    },
    {
      label: "Capacidad IA mensual",
      getValue: (plan: PlanViewModel) =>
        plan.monthlyAiTokens === null
          ? "A medida"
          : formatNumber(plan.monthlyAiTokens),
    },
  ];

  const allFeatures = Array.from(
    new Map(
      plans
        .flatMap((plan) => plan.features)
        .map((feature) => [feature.code, feature]),
    ).values(),
  );

  return (
    <div className="overflow-x-auto rounded-xl border border-border">
      <table className="w-full min-w-[1100px] border-collapse text-sm">
        <thead>
          <tr className="border-b border-border bg-surface">
            <th className="px-5 py-4 text-left font-medium text-muted-foreground">
              Funcionalidad
            </th>

            {plans.map((plan) => (
              <th
                key={plan.id}
                className="px-5 py-4 text-left font-semibold text-foreground"
              >
                <div className="flex items-center gap-2">
                  {plan.name}

                  {plan.isRecommended ? (
                    <span className="rounded-full bg-brand-soft px-2 py-0.5 text-[10px] font-medium text-brand">
                      Recomendado
                    </span>
                  ) : null}
                </div>
              </th>
            ))}
          </tr>
        </thead>

        <tbody>
          {rows.map((row) => (
            <tr
              key={row.label}
              className="border-b border-border"
            >
              <td className="px-5 py-4 font-medium text-foreground">
                {row.label}
              </td>

              {plans.map((plan) => (
                <ComparisonCell
                  key={plan.id}
                  value={row.getValue(plan)}
                />
              ))}
            </tr>
          ))}

          {allFeatures.map((feature) => (
            <tr
              key={feature.code}
              className="border-b border-border last:border-0"
            >
              <td className="px-5 py-4 font-medium text-foreground">
                {feature.name}
              </td>

              {plans.map((plan) => {
                const included = plan.features.find(
                  (item) => item.code === feature.code,
                );

                return (
                  <ComparisonCell
                    key={plan.id}
                    value={
                      included
                        ? included.value ?? true
                        : false
                    }
                  />
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
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

function formatCurrency(value: number) {
  const formatted = new Intl.NumberFormat("es-ES", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
    useGrouping: "always",
  }).format(value);

  return `${formatted} €`;
}

function formatCurrencyWhole(value: number) {
  const formatted = new Intl.NumberFormat("es-ES", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
    useGrouping: "always",
  }).format(value);

  return `${formatted} €`;
}

function formatPercentage(value: number) {
  return new Intl.NumberFormat("es-ES", {
    maximumFractionDigits: 2,
  }).format(value) + "%";
}

function getPricing(
  plan: PlanViewModel,
  billingPeriod: BillingPeriod,
) {
  if (
    plan.requiresContact ||
    plan.monthlyPriceCents === null
  ) {
    return {
      price: "A medida",
      detail: "Configuración personalizada",
      secondary: "Usuarios y capacidad a medida",
      saving: null,
    };
  }

  if (plan.monthlyPriceCents === 0) {
    return {
      price: "0 €",
      detail: "Para siempre",
      secondary: null,
      saving: null,
    };
  }

  const monthlyPrice =
    plan.monthlyPriceCents / 100;

  if (billingPeriod === "monthly") {
    const pricePerUser =
      plan.maxUsers && plan.maxUsers > 0
        ? Math.floor(monthlyPrice / plan.maxUsers)
        : null;

    return {
      price: `${formatCurrency(monthlyPrice)}/mes`,
      detail: "Facturación mensual",
      secondary:
        pricePerUser !== null
          ? `${formatCurrency(pricePerUser)} por usuario / mes`
          : null,
      saving: null,
    };
  }

if (plan.annualMonthlyPriceCents == null) {
  return {
    price: "Precio no disponible",
    detail: "Revisa la configuración del plan",
    secondary: null,
    saving: null,
  };
}

  const annualMonthlyPrice =
    plan.annualMonthlyPriceCents / 100;

  const annualTotal =
    annualMonthlyPrice * 12;

  const monthlyAnnualTotal =
    monthlyPrice * 12;

  const annualSaving =
    monthlyAnnualTotal - annualTotal;

  const realDiscount =
    (1 - annualMonthlyPrice / monthlyPrice) * 100;

  const pricePerUser =
    plan.maxUsers && plan.maxUsers > 0
      ? Math.floor(annualMonthlyPrice / plan.maxUsers)
      : null;

  return {
    price: `${formatCurrency(annualMonthlyPrice)}/mes`,

    detail: `Facturación anual · -${Math.round(
      realDiscount,
    )}%`,

    secondary:
      pricePerUser !== null
        ? `${formatCurrency(pricePerUser)} por usuario / mes`
        : null,

    saving: `Ahorras ${formatCurrency(
      annualSaving,
    )} al año`,
  };
}

function formatUsers(value: number | null) {
  if (value === null) {
    return "Usuarios a medida";
  }

  if (value === 1) {
    return "1 usuario por organización";
  }

  return `Hasta ${value.toLocaleString("es-ES")} usuarios por organización`;
}

function formatWorkspaces(value: number | null) {
  if (value === null) {
    return "Workspaces a medida";
  }

  if (value === 1) {
    return "1 workspace";
  }

  return `Hasta ${value.toLocaleString("es-ES")} workspaces`;
}

function formatGroups(value: number | null) {
  if (value === null) {
    return "Grupos ilimitados o a medida";
  }

  if (value === 0) {
    return "Sin grupos compartidos";
  }

  return `Hasta ${value.toLocaleString("es-ES")} grupos`;
}

function formatStorage(value: number | null) {
  if (value === null) {
    return "Almacenamiento a medida";
  }

  return `${formatBytes(value)} de almacenamiento`;
}

function formatStorageValue(
  value: number | null,
  requiresContact: boolean,
) {
  if (value === null) {
    return requiresContact
      ? "A medida"
      : "Ilimitado";
  }

  return formatBytes(value);
}

function formatAiCapacity(value: number | null) {
  if (value === null) {
    return "Capacidad de IA a medida";
  }

  return `${formatNumber(value)} tokens de IA / mes`;
}

function formatBytes(bytes: number) {
  const gb = bytes / 1024 / 1024 / 1024;

  if (gb >= 1) {
    return `${new Intl.NumberFormat("es-ES", {
      maximumFractionDigits: gb % 1 === 0 ? 0 : 1,
    }).format(gb)} GB`;
  }

  const mb = bytes / 1024 / 1024;

  return `${new Intl.NumberFormat("es-ES", {
    maximumFractionDigits: 0,
  }).format(mb)} MB`;
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("es-ES").format(value);
}

