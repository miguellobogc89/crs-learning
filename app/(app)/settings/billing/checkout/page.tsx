// app/(app)/settings/billing/checkout/page.tsx

import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import {
  ArrowLeft,
  Building2,
  Check,
  CheckCircle2,
  CreditCard,
  LockKeyhole,
  ShieldCheck,
  Sparkles,
  Zap,
} from "lucide-react";

import { SettingsShell } from "@/components/settings/settings-shell";
import { getSubscriptionPlanByCode } from "@/lib/services/subscription-plan.service";

type BillingPeriod = "monthly" | "annual";

type CheckoutPageProps = {
  searchParams: Promise<{
    plan?: string;
    billing?: string;
  }>;
};

const VAT_RATE = 0.21;

const BRAND = "#2563EB";
const BRAND_DARK = "#1D4ED8";
const BRAND_SOFT = "#EFF4FF";
const BRAND_BORDER = "#C7DBFE";

export default async function CheckoutPage({
  searchParams,
}: CheckoutPageProps) {
  const params = await searchParams;

  if (!params.plan) {
    redirect("/settings/plans");
  }

  const billingPeriod: BillingPeriod =
    params.billing === "monthly" ? "monthly" : "annual";

  const plan = await getSubscriptionPlanByCode(params.plan);

  if (
    !plan ||
    plan.requires_contact ||
    plan.monthly_price_cents === null ||
    plan.monthly_price_cents === 0
  ) {
    notFound();
  }

  const monthlyPriceCents = plan.monthly_price_cents;
  const annualMonthlyPriceCents = plan.annual_monthly_price_cents;

  if (
    billingPeriod === "annual" &&
    annualMonthlyPriceCents === null
  ) {
    notFound();
  }

  const subtotalCents =
    billingPeriod === "annual"
      ? annualMonthlyPriceCents! * 12
      : monthlyPriceCents;

  const vatCents = Math.round(subtotalCents * VAT_RATE);
  const totalCents = subtotalCents + vatCents;

  const annualSavingCents =
    monthlyPriceCents * 12 -
    (annualMonthlyPriceCents ?? monthlyPriceCents) * 12;

  const equivalentMonthlyCents =
    billingPeriod === "annual"
      ? annualMonthlyPriceCents!
      : monthlyPriceCents;

  const annualDiscountPercent =
    annualMonthlyPriceCents !== null
      ? Math.round(
          (1 - annualMonthlyPriceCents / monthlyPriceCents) * 100,
        )
      : 0;

  const periodLabel =
    billingPeriod === "annual" ? "anual" : "mensual";

  const features = plan.subscription_plan_features.slice(0, 5);

  return (
    <SettingsShell>
      <div className="h-full min-h-0 overflow-y-auto bg-background text-foreground">
        <main className="mx-auto w-full max-w-6xl px-5 pb-20 pt-6 sm:px-6 lg:px-8">
          <Link
            href="/settings/plans"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" />
            Volver a planes
          </Link>

          <header className="mt-3 mb-6 flex flex-wrap items-end justify-between gap-3">
            <div>
              <p
                className="text-xs font-bold uppercase tracking-wider"
                style={{ color: BRAND }}
              >
                Finalizar contratación
              </p>

              <h1 className="mt-0.5 text-2xl font-bold tracking-tight">
                Plan {plan.name}
              </h1>
            </div>
          </header>

          <div className="grid grid-cols-1 items-start gap-6 xl:grid-cols-[minmax(0,1fr)_360px] 2xl:grid-cols-[minmax(0,1fr)_380px]">
            <div className="flex min-w-0 flex-col gap-5">
              <Section step={1} title="Plan seleccionado">
                <div className="flex items-start gap-4">
                  <IconTile>
                    <Building2 className="h-5 w-5" />
                  </IconTile>

                  <div className="min-w-0 flex-1">
                    <h3 className="text-base font-semibold">
                      {plan.name}
                    </h3>

                    {plan.description ? (
                      <p className="mt-0.5 text-sm leading-6 text-muted-foreground">
                        {plan.description}
                      </p>
                    ) : null}
                  </div>
                </div>

                <div
                  className="mt-4 inline-flex flex-wrap rounded-lg p-0.5"
                  style={{ backgroundColor: BRAND_SOFT }}
                  aria-label="Período de facturación"
                >
                  {annualMonthlyPriceCents !== null ? (
                    <CycleLink
                      href={checkoutHref(plan.code, "annual")}
                      active={billingPeriod === "annual"}
                    >
                      Anual
                      {annualDiscountPercent > 0
                        ? ` · −${annualDiscountPercent}%`
                        : ""}
                    </CycleLink>
                  ) : null}

                  <CycleLink
                    href={checkoutHref(plan.code, "monthly")}
                    active={billingPeriod === "monthly"}
                  >
                    Mensual
                  </CycleLink>
                </div>

                <dl className="mt-4 grid grid-cols-1 gap-3 border-t border-border pt-4 sm:grid-cols-3">
                  <PlanData
                    label="Facturación"
                    value={
                      billingPeriod === "annual" ? "Anual" : "Mensual"
                    }
                    hint={
                      billingPeriod === "annual" &&
                      annualSavingCents > 0
                        ? `Ahorras ${formatCents(annualSavingCents)} al año`
                        : undefined
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
                        : String(plan.max_workspaces)
                    }
                  />
                </dl>
              </Section>

              <Section step={2} title="Datos de facturación">
                <div className="flex items-start gap-4">
                  <IconTile>
                    <Building2 className="h-5 w-5" />
                  </IconTile>

                  <p className="min-w-0 flex-1 text-sm leading-6 text-muted-foreground">
                    Los datos fiscales se solicitarán antes de completar
                    el pago.
                  </p>
                </div>

                <div
                  className="mt-4 rounded-lg border p-4"
                  style={{
                    borderColor: BRAND_BORDER,
                    backgroundColor: BRAND_SOFT,
                  }}
                >
                  <div className="flex items-center gap-2">
                    <ShieldCheck
                      className="h-4 w-4 shrink-0"
                      style={{ color: BRAND }}
                    />
                    <h3 className="text-sm font-semibold">
                      Facturación empresarial
                    </h3>
                  </div>

                  <p className="mt-1 text-xs leading-5 text-muted-foreground">
                    En el siguiente paso podrás indicar razón social,
                    NIF/CIF, dirección fiscal y país.
                  </p>
                </div>
              </Section>

              <Section step={3} title="Pago seguro">
                <div className="flex items-start gap-4">
                  <IconTile>
                    <CreditCard className="h-5 w-5" />
                  </IconTile>

                  <p className="min-w-0 flex-1 text-sm leading-6 text-muted-foreground">
                    El método de pago se gestionará de forma segura
                    mediante Stripe.
                  </p>
                </div>

                <div className="mt-4 grid grid-cols-[minmax(0,1fr)_110px] gap-3">
                  <div className="rounded-lg border border-border bg-muted/30 px-3 py-2.5">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                      Titular
                    </p>
                    <p className="mt-0.5 text-sm font-medium">—</p>
                  </div>

                  <div className="rounded-lg border border-border bg-muted/30 px-3 py-2.5">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                      Vencimiento
                    </p>
                    <p className="mt-0.5 text-sm font-medium">
                      MM / AA
                    </p>
                  </div>
                </div>

                <p
                  className="mt-2 flex items-center gap-1.5 text-xs font-medium"
                  style={{ color: BRAND }}
                >
                  <LockKeyhole className="h-3.5 w-3.5" />
                  El pago se habilitará cuando esté lista la integración.
                </p>
              </Section>
            </div>

            <aside className="min-w-0 xl:sticky xl:top-6 xl:self-start">
              <div className="overflow-hidden rounded-xl border border-border bg-card shadow-lg">
                <div
                  className="px-5 py-4 text-white"
                  style={{
                    background: `linear-gradient(135deg, ${BRAND_DARK}, ${BRAND})`,
                  }}
                >
                  <h2 className="text-sm font-semibold uppercase tracking-wider">
                    Plan {plan.name}
                  </h2>

                  <p className="mt-0.5 text-xs text-white/75">
                    Facturación {periodLabel}
                  </p>
                </div>

                <div className="p-5">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="text-sm text-muted-foreground">
                      {plan.name} ({periodLabel})
                    </span>

                    <span className="shrink-0 text-sm font-semibold">
                      {formatCents(subtotalCents)}
                    </span>
                  </div>

                  {billingPeriod === "annual" &&
                  annualSavingCents > 0 ? (
                    <div
                      className="mt-3 flex items-start gap-2 rounded-lg border px-3 py-2.5"
                      style={{
                        backgroundColor: BRAND_SOFT,
                        borderColor: BRAND_BORDER,
                      }}
                    >
                      <Zap
                        className="mt-0.5 h-4 w-4 shrink-0"
                        style={{ color: BRAND }}
                      />

                      <div className="min-w-0 flex-1">
                        <p
                          className="text-sm font-semibold"
                          style={{ color: BRAND_DARK }}
                        >
                          Ahorras {formatCents(annualSavingCents)} al año
                        </p>

                        <p className="mt-0.5 text-[11px] text-muted-foreground">
                          Equivale a{" "}
                          {formatCents(equivalentMonthlyCents)}/mes
                        </p>
                      </div>
                    </div>
                  ) : null}

                  <div className="mt-4 space-y-2 border-t border-border pt-4">
                    <PriceRow
                      label="Subtotal"
                      value={formatCents(subtotalCents)}
                    />

                    <PriceRow
                      label="IVA (21%)"
                      value={formatCents(vatCents)}
                    />
                  </div>

                  <div className="mt-4 flex flex-wrap items-end justify-between gap-3 border-t border-border pt-4">
                    <div>
                      <p className="text-sm font-semibold">Total</p>
                      <p className="text-[11px] text-muted-foreground">
                        IVA incluido
                      </p>
                    </div>

                    <p className="text-2xl font-bold tracking-tight sm:text-3xl">
                      {formatCents(totalCents)}
                    </p>
                  </div>

                  <button
                    type="button"
                    disabled
                    className="mt-5 flex w-full cursor-not-allowed items-center justify-center gap-2 rounded-lg px-4 py-3 text-sm font-semibold text-white opacity-60"
                    style={{ backgroundColor: BRAND }}
                  >
                    <LockKeyhole className="h-4 w-4" />
                    Continuar al pago
                  </button>

                  <p className="mt-3 flex items-start justify-center gap-1.5 text-center text-[11px] leading-5 text-muted-foreground">
                    <LockKeyhole className="mt-0.5 h-3 w-3 shrink-0" />
                    Todavía no se realizará ningún cargo. La
                    integración de pago está pendiente.
                  </p>

                  {features.length > 0 ? (
                    <div className="mt-5 border-t border-border pt-4">
                      <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                        Incluido en {plan.name}
                      </p>

                      <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
                        {features.map((item) => (
                          <li
                            key={item.feature_id}
                            className="flex items-start gap-1.5 text-xs"
                          >
                            <Check
                              className="mt-0.5 h-3.5 w-3.5 shrink-0"
                              style={{ color: BRAND }}
                            />

                            <span>
                              {item.plan_features.name}
                              {item.value ? ` · ${item.value}` : ""}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                </div>
              </div>

              <div
                className="mt-3 flex items-start gap-2 rounded-lg px-3 py-2.5"
                style={{ backgroundColor: BRAND_SOFT }}
              >
                <CheckCircle2
                  className="mt-0.5 h-4 w-4 shrink-0"
                  style={{ color: BRAND }}
                />

                <p
                  className="text-[11px] font-medium leading-5"
                  style={{ color: BRAND_DARK }}
                >
                  Revisa los datos del plan antes de continuar con la
                  contratación.
                </p>
              </div>
            </aside>
          </div>

          <p className="mx-auto mt-10 max-w-3xl text-center text-[11px] leading-relaxed text-muted-foreground">
            El IVA mostrado corresponde provisionalmente al tipo
            general español del 21 %. El impuesto definitivo podrá
            variar según el país y los datos fiscales indicados
            cuando se habilite la contratación.
          </p>
        </main>
      </div>
    </SettingsShell>
  );
}

function Section({
  step,
  title,
  children,
}: {
  step: number;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
      <div className="flex items-center gap-3 border-b border-border bg-muted/30 px-5 py-3">
        <span
          className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white"
          style={{ backgroundColor: BRAND }}
        >
          {step}
        </span>

        <h2 className="text-sm font-semibold">{title}</h2>
      </div>

      <div className="p-5">{children}</div>
    </section>
  );
}

function IconTile({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div
      className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg"
      style={{
        backgroundColor: BRAND_SOFT,
        color: BRAND,
      }}
    >
      {children}
    </div>
  );
}

function CycleLink({
  href,
  active,
  children,
}: {
  href: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className="rounded-md px-3 py-1.5 text-xs font-semibold transition-colors"
      style={
        active
          ? {
              backgroundColor: BRAND,
              color: "#FFFFFF",
              boxShadow: "0 1px 3px rgba(0,0,0,0.12)",
            }
          : { color: "#475569" }
      }
    >
      {children}
    </Link>
  );
}

function PlanData({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div>
      <dt className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </dt>

      <dd className="mt-0.5 text-sm font-semibold">{value}</dd>

      {hint ? (
        <p className="mt-0.5 text-[11px] leading-4 text-muted-foreground">
          {hint}
        </p>
      ) : null}
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
    <div className="flex items-baseline justify-between gap-3 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}

function checkoutHref(
  planCode: string,
  billing: BillingPeriod,
) {
  const query = new URLSearchParams({
    plan: planCode,
    billing,
  });

  return `/settings/billing/checkout?${query.toString()}`;
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