// app/(app)/settings/billing/checkout/page.tsx

import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import {
  ArrowLeft,
  Building2,
  Check,
  CreditCard,
  LockKeyhole,
  ReceiptText,
} from "lucide-react";

import { SettingsShell } from "@/components/settings/settings-shell";
import { Button } from "@/components/ui/button";
import { getSubscriptionPlanByCode } from "@/lib/services/subscription-plan.service";

type BillingPeriod = "monthly" | "annual";

type CheckoutPageProps = {
  searchParams: Promise<{
    plan?: string;
    billing?: string;
  }>;
};

const VAT_RATE = 0.21;

export default async function CheckoutPage({
  searchParams,
}: CheckoutPageProps) {
  const params = await searchParams;

  if (!params.plan) {
    redirect("/settings/plans");
  }

  const billingPeriod: BillingPeriod =
    params.billing === "monthly"
      ? "monthly"
      : "annual";

  const plan = await getSubscriptionPlanByCode(
    params.plan,
  );

  if (
    !plan ||
    plan.requires_contact ||
    plan.monthly_price_cents === null ||
    plan.monthly_price_cents === 0
  ) {
    notFound();
  }

  /*
   * FUENTE DE VERDAD:
   * precio y descuento proceden de BD.
   *
   * Trabajamos en céntimos para evitar cálculos monetarios
   * con floats.
   */
  const monthlyPriceCents =
    plan.monthly_price_cents;

  const discountPercent =
    Number(plan.annual_discount_percent);

  let subtotalCents: number;

  if (billingPeriod === "annual") {
    const annualBaseCents =
      monthlyPriceCents * 12;

    subtotalCents = Math.round(
      annualBaseCents *
        (1 - discountPercent / 100),
    );
  } else {
    subtotalCents = monthlyPriceCents;
  }

  /*
   * IVA provisional España.
   *
   * Cuando integremos Stripe Tax, este cálculo
   * dejará de ser responsabilidad de esta página.
   */
  const vatCents = Math.round(
    subtotalCents * VAT_RATE,
  );

  const totalCents =
    subtotalCents + vatCents;

  const annualSavingCents =
    billingPeriod === "annual"
      ? monthlyPriceCents * 12 -
        subtotalCents
      : 0;

  const equivalentMonthlyCents =
    billingPeriod === "annual"
      ? Math.round(subtotalCents / 12)
      : monthlyPriceCents;

  return (
    <SettingsShell>
      <div className="h-full min-h-0 overflow-y-auto">
        <main className="mx-auto w-full max-w-6xl px-6 py-8 pb-20 lg:px-8 lg:py-10">
          <Link
            href="/settings/plans"
            className="inline-flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" />
            Volver a planes
          </Link>

          <header className="mt-7 max-w-2xl">
            <p className="text-sm font-medium text-brand">
              Finalizar contratación
            </p>

            <h1 className="mt-2 text-3xl font-semibold tracking-tight text-foreground">
              Activa {plan.name}
            </h1>

            <p className="mt-3 text-sm leading-6 text-muted-foreground">
              Revisa tu plan y los importes antes de
              continuar al pago.
            </p>
          </header>

          <div className="mt-10 grid gap-8 lg:grid-cols-[minmax(0,1fr)_380px] lg:items-start">
            {/* IZQUIERDA */}
            <div className="space-y-6">
              <section className="rounded-xl border border-border bg-background p-6">
                <div className="flex items-start gap-4">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-brand-soft text-brand">
                    <Building2 className="h-5 w-5" />
                  </div>

                  <div>
                    <h2 className="text-base font-semibold text-foreground">
                      {plan.name}
                    </h2>

                    <p className="mt-1 text-sm leading-6 text-muted-foreground">
                      {plan.description}
                    </p>
                  </div>
                </div>

                <div className="mt-6 grid gap-4 border-t border-border pt-6 sm:grid-cols-3">
                  <PlanData
                    label="Facturación"
                    value={
                      billingPeriod === "annual"
                        ? "Anual"
                        : "Mensual"
                    }
                  />

                  <PlanData
                    label="Usuarios"
                    value={
                      plan.max_users === null
                        ? "A medida"
                        : `Hasta ${plan.max_users}`
                    }
                  />

                  <PlanData
                    label="Workspaces"
                    value={
                      plan.max_workspaces === null
                        ? "A medida"
                        : `${plan.max_workspaces}`
                    }
                  />
                </div>
              </section>

              <section className="rounded-xl border border-border bg-background p-6">
                <div className="flex items-center gap-3">
                  <ReceiptText className="h-5 w-5 text-brand" />

                  <div>
                    <h2 className="text-base font-semibold text-foreground">
                      Datos de facturación
                    </h2>

                    <p className="mt-1 text-sm text-muted-foreground">
                      Los datos fiscales se solicitarán
                      antes de completar el pago.
                    </p>
                  </div>
                </div>

                <div className="mt-6 rounded-lg border border-dashed border-border bg-surface p-5">
                  <p className="text-sm font-medium text-foreground">
                    Facturación empresarial
                  </p>

                  <p className="mt-1 text-sm leading-6 text-muted-foreground">
                    En el siguiente paso podrás indicar
                    razón social, NIF/CIF, dirección
                    fiscal y país.
                  </p>
                </div>
              </section>

              <section className="rounded-xl border border-border bg-background p-6">
                <div className="flex items-center gap-3">
                  <CreditCard className="h-5 w-5 text-brand" />

                  <div>
                    <h2 className="text-base font-semibold text-foreground">
                      Pago seguro
                    </h2>

                    <p className="mt-1 text-sm text-muted-foreground">
                      El método de pago se gestionará de
                      forma segura mediante Stripe.
                    </p>
                  </div>
                </div>
              </section>
            </div>

            {/* RESUMEN */}
            <aside className="rounded-xl border border-border bg-background p-6 lg:sticky lg:top-6">
              <h2 className="text-base font-semibold text-foreground">
                Resumen
              </h2>

              <div className="mt-5">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-sm font-medium text-foreground">
                      {plan.name}
                    </p>

                    <p className="mt-1 text-xs text-muted-foreground">
                      {billingPeriod === "annual"
                        ? "Facturación anual"
                        : "Facturación mensual"}
                    </p>
                  </div>

                  <p className="shrink-0 text-sm font-medium text-foreground">
                    {formatCents(subtotalCents)}
                  </p>
                </div>

                {billingPeriod === "annual" ? (
                  <div className="mt-4 rounded-lg bg-brand-soft px-3 py-2.5">
                    <p className="text-xs font-medium text-brand">
                      Ahorras{" "}
                      {formatCents(
                        annualSavingCents,
                      )}{" "}
                      al año
                    </p>

                    <p className="mt-1 text-xs text-muted-foreground">
                      Equivale a{" "}
                      {formatCents(
                        equivalentMonthlyCents,
                      )}
                      /mes
                    </p>
                  </div>
                ) : null}
              </div>

              <div className="my-5 border-t border-border" />

              <div className="space-y-3">
                <PriceRow
                  label="Subtotal"
                  value={formatCents(subtotalCents)}
                />

                <PriceRow
                  label="IVA (21%)"
                  value={formatCents(vatCents)}
                />
              </div>

              <div className="my-5 border-t border-border" />

              <div className="flex items-end justify-between gap-4">
                <div>
                  <p className="text-sm font-semibold text-foreground">
                    Total
                  </p>

                  <p className="mt-1 text-xs text-muted-foreground">
                    IVA incluido
                  </p>
                </div>

                <p className="text-xl font-semibold tracking-tight text-foreground">
                  {formatCents(totalCents)}
                </p>
              </div>

              <Button
                type="button"
                variant="brand"
                disabled
                className="mt-6 w-full"
              >
                Continuar al pago
              </Button>

              <div className="mt-4 flex items-start gap-2 text-xs leading-5 text-muted-foreground">
                <LockKeyhole className="mt-0.5 h-3.5 w-3.5 shrink-0" />

                <p>
                  Todavía no se realizará ningún cargo.
                  La integración de pago está pendiente.
                </p>
              </div>

              <div className="mt-6 border-t border-border pt-5">
                <p className="text-xs font-medium text-foreground">
                  Incluido en {plan.name}
                </p>

                <ul className="mt-3 space-y-2.5">
                  {plan.subscription_plan_features
                    .slice(0, 5)
                    .map((item) => (
                      <li
                        key={item.feature_id}
                        className="flex gap-2 text-xs text-muted-foreground"
                      >
                        <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-brand" />

                        <span>
                          {item.plan_features.name}
                          {item.value
                            ? ` · ${item.value}`
                            : ""}
                        </span>
                      </li>
                    ))}
                </ul>
              </div>
            </aside>
          </div>

          <p className="mt-8 max-w-3xl text-xs leading-5 text-muted-foreground">
            El IVA mostrado corresponde provisionalmente
            al tipo general español del 21 %. El impuesto
            definitivo podrá variar según el país y los
            datos fiscales del cliente cuando se habilite
            la contratación.
          </p>
        </main>
      </div>
    </SettingsShell>
  );
}

function PlanData({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">
        {label}
      </p>

      <p className="mt-1 text-sm font-medium text-foreground">
        {value}
      </p>
    </div>
  );
}

function PriceRow({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="text-sm text-muted-foreground">
        {label}
      </span>

      <span className="text-sm text-foreground">
        {value}
      </span>
    </div>
  );
}

function formatCents(cents: number) {
  return new Intl.NumberFormat("es-ES", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
    useGrouping: "always",
  }).format(cents / 100);
}