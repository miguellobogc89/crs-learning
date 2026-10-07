
 // components/dashboard/dashboard-management-view.tsx
import Link from "next/link";
import {
  ArrowUpRight,
  Building2,
  CreditCard,
  ShieldCheck,
  UsersRound,
  Wallet,
} from "lucide-react";

import { getWorkspaceMembers } from "@/lib/repositories/workspace.repository";
import { listTeams } from "@/lib/services/knowledge-team.service";
import { getPlanUsageForUser } from "@/lib/services/entitlements.service";
import type { DashboardView } from "@/lib/navigation/dashboard-sections";

type Props = {
  view: Exclude<DashboardView, "home">;
  userId: string;
  workspace: {
    id: string;
    name: string;
    description: string | null;
    role: string;
  };
};

export async function DashboardManagementView({
  view,
  userId,
  workspace,
}: Props) {
  if (view === "organization") {
    const [members, teams] = await Promise.all([
      getWorkspaceMembers(workspace.id),
      listTeams({
        userId,
        workspaceId: workspace.id,
      }),
    ]);

    return (
      <div className="space-y-6 pt-6">
        <div className="grid gap-4 sm:grid-cols-2">
          <SummaryCard
            icon={UsersRound}
            label="Personas"
            value={members.length.toString()}
          />
          <SummaryCard
            icon={Building2}
            label="Equipos"
            value={teams.length.toString()}
          />
        </div>

        <section className="overflow-hidden rounded-xl border border-slate-200">
          <SectionHeading
            title="Personas"
            description="Miembros del espacio de trabajo actual"
          />

          <div className="divide-y divide-slate-100">
            {members.map((member) => (
              <div
                key={member.id}
                className="flex items-center justify-between gap-4 px-5 py-3"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-slate-900">
                    {member.users.name ||
                      member.users.email}
                  </p>
                  <p className="truncate text-xs text-slate-500">
                    {member.users.email}
                  </p>
                </div>
                <span className="text-xs text-slate-500">
                  {member.role}
                </span>
              </div>
            ))}

            {members.length === 0 && (
              <EmptyState text="No hay miembros disponibles." />
            )}
          </div>
        </section>

        <section className="overflow-hidden rounded-xl border border-slate-200">
          <SectionHeading
            title="Equipos"
            description="Equipos vinculados al espacio de trabajo"
          />

          <div className="divide-y divide-slate-100">
            {teams.map((team) => (
              <div
                key={team.id}
                className="px-5 py-3"
              >
                <p className="text-sm font-medium text-slate-900">
                  {team.name}
                </p>
              </div>
            ))}

            {teams.length === 0 && (
              <EmptyState text="Todavía no hay equipos creados." />
            )}
          </div>
        </section>
      </div>
    );
  }

  if (view === "administration") {
    return (
      <div className="grid gap-4 pt-6 lg:grid-cols-2">
        <InformationCard
          icon={Building2}
          title="Espacio de trabajo"
          description="Identidad y contexto del espacio seleccionado."
        >
          <Detail label="Nombre" value={workspace.name} />
          <Detail
            label="Descripción"
            value={workspace.description || "Sin descripción"}
          />
        </InformationCard>

        <InformationCard
          icon={ShieldCheck}
          title="Acceso y permisos"
          description="Información de tu acceso al espacio."
        >
          <Detail
            label="Tu rol"
            value={workspace.role}
          />
          <p className="mt-4 text-xs leading-5 text-slate-500">
            La edición de políticas y permisos requiere
            controles específicos de autorización.
          </p>
        </InformationCard>
      </div>
    );
  }

  const planUsage = await getPlanUsageForUser(userId);

  return (
    <div className="space-y-6 pt-6">
      <InformationCard
        icon={Wallet}
        title={planUsage.plan.name}
        description={`Suscripción de ${planUsage.organization.name}`}
      >
        <div className="grid gap-4 sm:grid-cols-3">
          <Usage
            label="Usuarios"
            current={planUsage.usage.users}
            limit={planUsage.plan.maxUsers}
          />
          <Usage
            label="Espacios"
            current={planUsage.usage.workspaces}
            limit={planUsage.plan.maxWorkspaces}
          />
          <Usage
            label="Equipos"
            current={planUsage.usage.groups}
            limit={planUsage.plan.maxGroups}
          />
        </div>
      </InformationCard>

      <Link
        href="/settings/plans"
        className="inline-flex items-center gap-2 text-sm font-medium text-[#0A58FF] hover:underline"
      >
        <CreditCard className="h-4 w-4" />
        Consultar planes
        <ArrowUpRight className="h-4 w-4" />
      </Link>

      <p className="text-xs text-slate-500">
        El consumo y los límites mostrados corresponden
        a la organización de la suscripción, no
        exclusivamente al espacio seleccionado.
      </p>
    </div>
  );
}

function SummaryCard({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof UsersRound;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-xl border border-slate-200 p-5">
      <Icon className="h-5 w-5 text-[#315BFF]" />
      <p className="mt-4 text-xs text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-slate-950">
        {value}
      </p>
    </div>
  );
}

function SectionHeading({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="border-b border-slate-100 px-5 py-4">
      <h2 className="text-sm font-semibold text-slate-900">
        {title}
      </h2>
      <p className="mt-1 text-xs text-slate-500">
        {description}
      </p>
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <p className="px-5 py-8 text-sm text-slate-500">
      {text}
    </p>
  );
}

function InformationCard({
  icon: Icon,
  title,
  description,
  children,
}: {
  icon: typeof Building2;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-slate-200 p-5">
      <Icon className="h-5 w-5 text-[#315BFF]" />
      <h2 className="mt-4 text-base font-semibold text-slate-950">
        {title}
      </h2>
      <p className="mt-1 text-sm text-slate-500">
        {description}
      </p>
      <div className="mt-5">{children}</div>
    </section>
  );
}

function Detail({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="mb-3">
      <p className="text-xs text-slate-500">{label}</p>
      <p className="mt-1 text-sm font-medium text-slate-900">
        {value}
      </p>
    </div>
  );
}

function Usage({
  label,
  current,
  limit,
}: {
  label: string;
  current: number;
  limit: number | null;
}) {
  return (
    <div>
      <p className="text-xs text-slate-500">{label}</p>
      <p className="mt-1 text-lg font-semibold text-slate-950">
        {current} / {limit ?? "∞"}
      </p>
    </div>
  );
}
