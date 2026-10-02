// components/academy/academy-admin.tsx

import Link from "next/link";
import {
  BookOpen,
  ChevronRight,
  GraduationCap,
  Plus,
  Settings2,
} from "lucide-react";

import { Button } from "@/components/ui/button";

type AcademyAdminProps = {
  canManageAcademy: boolean;
};

export function AcademyAdmin({
  canManageAcademy,
}: AcademyAdminProps) {
  if (!canManageAcademy) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-8">
        <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-slate-100 text-slate-500">
          <Settings2 className="h-5 w-5" />
        </div>

        <h2 className="mt-4 text-base font-semibold text-slate-950">
          Administración de Academy
        </h2>

        <p className="mt-1 max-w-xl text-sm leading-6 text-slate-500">
          No tienes permisos para gestionar los cursos de la organización.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-4">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#EDF3FF] text-[#0A58FF]">
              <GraduationCap className="h-5 w-5" />
            </div>

            <div>
              <h2 className="text-base font-semibold text-slate-950">
                Gestión de cursos
              </h2>

              <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-500">
                Crea, edita y publica la formación disponible para tu
                organización.
              </p>
            </div>
          </div>

          <Button asChild className="shrink-0 gap-2">
            <Link href="/courses/new">
              <Plus className="h-4 w-4" />
              Crear curso
            </Link>
          </Button>
        </div>
      </section>

      <section>
        <div className="mb-3 flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold text-slate-950">
              Cursos
            </h2>

            <p className="mt-1 text-xs text-slate-500">
              Formación creada y gestionada desde Academy.
            </p>
          </div>
        </div>

        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
          <div className="flex min-h-[260px] flex-col items-center justify-center px-6 py-12 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-slate-500">
              <BookOpen className="h-5 w-5" />
            </div>

            <h3 className="mt-4 text-sm font-semibold text-slate-900">
              Empieza creando tu primer curso
            </h3>

            <p className="mt-1 max-w-md text-sm leading-6 text-slate-500">
              Los cursos que gestiones aparecerán aquí para que puedas
              editarlos, publicarlos y consultar su estado.
            </p>

            <Button asChild variant="secondary" className="mt-5 gap-2">
              <Link href="/courses/new">
                Crear curso
                <ChevronRight className="h-4 w-4" />
              </Link>
            </Button>
          </div>
        </div>
      </section>
    </div>
  );
}

