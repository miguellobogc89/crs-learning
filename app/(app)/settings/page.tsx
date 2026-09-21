// app/(app)/settings/page.tsx

import Link from "next/link";
import {
  ArrowRight,
  Database,
  Sparkles,
  UsersRound,
  Workflow,
} from "lucide-react";

import { auth } from "@/auth";
import { SettingsShell } from "@/components/settings/settings-shell";
import { getPlanUsageForUser } from "@/lib/services/entitlements.service";

export default async function SettingsPage() {
  const session = await auth();
  const planUsage = session?.user?.id
    ? await getPlanUsageForUser(session.user.id)
    : null;

  const firstName =
    session?.user?.name?.split(" ")[0] ??
    session?.user?.email ??
    "Usuario";

  return (
    <SettingsShell>
      <main className="mx-auto w-full max-w-5xl px-6 py-8 lg:px-8 lg:py-10">
        <header>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            Configuracion
          </h1>

          <p className="mt-1 text-sm text-muted-foreground">
            Gestiona tu cuenta, tu plan y las preferencias de CRS LAB.
          </p>
        </header>

        <div className="mt-10 space-y-10">
          <section>
            <div className="mb-4">
              <h2 className="text-sm font-semibold text-foreground">
                Cuenta
              </h2>

              <p className="mt-1 text-sm text-muted-foreground">
                Informacion basica de tu cuenta.
              </p>
            </div>

            <div className="divide-y divide-border rounded-xl border border-border bg-background">
              <div className="flex items-center justify-between gap-6 px-5 py-4">
                <div>
                  <p className="text-sm font-medium text-foreground">
                    Nombre
                  </p>

                  <p className="mt-1 text-sm text-muted-foreground">
                    {firstName}
                  </p>
                </div>

                <span className="text-xs text-muted-foreground">
                  Mi perfil proximamente
                </span>
              </div>

              <div className="flex items-center justify-between gap-6 px-5 py-4">
                <div>
                  <p className="text-sm font-medium text-foreground">
                    Correo electronico
                  </p>

                  <p className="mt-1 text-sm text-muted-foreground">
                    {session?.user?.email ?? "No disponible"}
                  </p>
                </div>
              </div>
            </div>
          </section>

          <section>
            <div className="mb-4">
              <h2 className="text-sm font-semibold text-foreground">
                Plan
              </h2>

              <p className="mt-1 text-sm text-muted-foreground">
                Consulta tu plan actual y las opciones disponibles.
              </p>
            </div>

            <div className="rounded-xl border border-border bg-background p-5">
              <div className="flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-lg font-semibold text-foreground">
                      {planUsage?.plan.name ?? "Plan actual"}
                    </h3>

                    <span className="rounded-full bg-brand-soft px-2 py-0.5 text-[11px] font-medium text-brand">
                      Plan actual
                    </span>
                  </div>

                  <p className="mt-2 max-w-xl text-sm leading-6 text-muted-foreground">
                    {planUsage
                      ? `${planUsage.organization.name} usa este plan para trabajar con espacios, usuarios y grupos.`
                      : "Consulta la capacidad disponible de tu organizacion y las opciones para crecer."}
                  </p>

                  <div className="mt-5 flex flex-wrap gap-x-5 gap-y-2 text-xs text-muted-foreground">
                    <PlanFeature icon={Workflow}>
                      {formatLimit(
                        planUsage?.plan.maxWorkspaces,
                        "workspace",
                        "workspaces",
                      )}
                    </PlanFeature>

                    <PlanFeature icon={UsersRound}>
                      {formatLimit(
                        planUsage?.plan.maxUsers,
                        "usuario",
                        "usuarios",
                      )}
                    </PlanFeature>

                    <PlanFeature icon={Sparkles}>
                      Capacidad de IA segun plan
                    </PlanFeature>

                    <PlanFeature icon={Database}>
                      Almacenamiento segun plan
                    </PlanFeature>
                  </div>
                </div>

                <Link
                  href="/settings/plans"
                  className="inline-flex shrink-0 items-center gap-2 text-sm font-medium text-brand transition-opacity hover:opacity-80"
                >
                  Ver planes
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </div>
            </div>
          </section>

          <section>
            <div className="mb-4">
              <h2 className="text-sm font-semibold text-foreground">
                Uso
              </h2>

              <p className="mt-1 text-sm text-muted-foreground">
                Uso real de los limites principales de tu plan.
              </p>
            </div>

            <div className="grid gap-px overflow-hidden rounded-xl border border-border bg-border sm:grid-cols-2 lg:grid-cols-5">
              <UsagePlaceholder
                label="Uso de IA"
                value="Proximamente"
              />

              <UsagePlaceholder
                label="Almacenamiento"
                value="Proximamente"
              />

              <UsagePlaceholder
                label="Usuarios"
                value={formatUsage(
                  planUsage?.usage.users,
                  planUsage?.plan.maxUsers,
                )}
              />

              <UsagePlaceholder
                label="Workspaces"
                value={formatUsage(
                  planUsage?.usage.workspaces,
                  planUsage?.plan.maxWorkspaces,
                )}
              />

              <UsagePlaceholder
                label="Grupos"
                value={formatUsage(
                  planUsage?.usage.groups,
                  planUsage?.plan.maxGroups,
                )}
              />
            </div>
          </section>
        </div>
      </main>
    </SettingsShell>
  );
}

function PlanFeature({
  icon: Icon,
  children,
}: {
  icon: React.ElementType;
  children: React.ReactNode;
}) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <Icon className="h-3.5 w-3.5 text-brand" />
      {children}
    </span>
  );
}

function UsagePlaceholder({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="bg-background p-4">
      <p className="text-xs text-muted-foreground">
        {label}
      </p>

      <p className="mt-1 text-sm font-medium text-foreground">
        {value}
      </p>
    </div>
  );
}

function formatLimit(
  limit: number | null | undefined,
  singular: string,
  plural: string,
) {
  if (limit === undefined) {
    return "Limite segun plan";
  }

  if (limit === null) {
    return `${plural} ilimitados`;
  }

  return limit === 1
    ? `1 ${singular}`
    : `Hasta ${limit} ${plural}`;
}

function formatUsage(
  current: number | undefined,
  limit: number | null | undefined,
) {
  if (current === undefined) {
    return "No disponible";
  }

  if (limit === null) {
    return `${current} / Ilimitado`;
  }

  if (limit === undefined) {
    return `${current}`;
  }

  return `${current} / ${limit}`;
}
