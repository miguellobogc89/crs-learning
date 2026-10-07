// components/home/administration/administration-view.tsx

import {
  Building2,
  ShieldCheck,
} from "lucide-react";

type Props = {
  workspaceName: string;
  workspaceDescription: string | null;
  role: string;
};

export function AdministrationView({
  workspaceName,
  workspaceDescription,
  role,
}: Props) {
  return (
    <div className="mx-auto w-full max-w-[1600px] space-y-4 pt-6">
      <section className="rounded-xl border border-slate-200 p-5">
        <Building2 className="h-5 w-5 text-[#0A58FF]" />

        <h2 className="mt-4 text-base font-semibold text-slate-950">
          Espacio de trabajo
        </h2>

        <p className="mt-1 text-sm text-slate-500">
          Información general del espacio seleccionado.
        </p>

        <div className="mt-6 divide-y divide-slate-100">
          <Row
            label="Nombre"
            value={workspaceName}
          />

          <Row
            label="Descripción"
            value={
              workspaceDescription ||
              "Sin descripción"
            }
          />
        </div>
      </section>

      <section className="rounded-xl border border-slate-200 p-5">
        <ShieldCheck className="h-5 w-5 text-[#0A58FF]" />

        <h2 className="mt-4 text-base font-semibold text-slate-950">
          Acceso y permisos
        </h2>

        <p className="mt-1 text-sm text-slate-500">
          Tu nivel de acceso en este espacio.
        </p>

        <div className="mt-6">
          <Row
            label="Tu rol"
            value={role}
          />
        </div>
      </section>
    </div>
  );
}

function Row({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-start justify-between gap-6 py-4 first:pt-0 last:pb-0">
      <p className="text-sm text-slate-500">
        {label}
      </p>

      <p className="max-w-[60%] text-right text-sm font-medium text-slate-900">
        {value}
      </p>
    </div>
  );
}