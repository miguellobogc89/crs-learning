// components/home/organization/organization-aside.tsx

import {
  Building2,
  ShieldCheck,
} from "lucide-react";

type Props = {
  workspaceName: string;
  role: string;
};

export function OrganizationAside({
  workspaceName,
  role,
}: Props) {
  return (
    <div className="space-y-4 p-4">
      <section className="rounded-xl border border-slate-200 p-4">
        <Building2 className="h-4 w-4 text-[#0A58FF]" />

        <p className="mt-3 text-xs text-slate-500">
          Espacio actual
        </p>

        <p className="mt-1 text-sm font-semibold text-slate-950">
          {workspaceName}
        </p>
      </section>

      <section className="rounded-xl border border-slate-200 p-4">
        <ShieldCheck className="h-4 w-4 text-[#0A58FF]" />

        <p className="mt-3 text-xs text-slate-500">
          Tu acceso
        </p>

        <p className="mt-1 text-sm font-semibold text-slate-950">
          {role}
        </p>
      </section>
    </div>
  );
}