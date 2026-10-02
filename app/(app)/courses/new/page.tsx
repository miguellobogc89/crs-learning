import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { auth } from "@/auth";
import { AppPageLayout } from "@/components/app/layouts/app-page-layout";
import { AppSectionShell } from "@/components/app/section-sidebar";
import { AcademySidebar } from "@/components/academy/academy-navigation";
import { CourseCreateForm } from "@/components/academy/course-create-form";
import { prisma } from "@/lib/prisma";

export default async function NewCoursePage() {
  const session = await auth();

  if (!session?.user?.id) {
    redirect("/");
  }

  const user = await prisma.users.findUnique({
    where: { id: session.user.id },
    select: {
      system_role: true,
      company_id: true,
    },
  });

  const canManageAcademy =
    user?.system_role === "org_manager" || user?.system_role === "system_admin";

  if (!user || !canManageAcademy) {
    redirect("/courses");
  }

  if (!user.company_id && user.system_role !== "system_admin") {
    redirect("/courses");
  }

  return (
    <AppSectionShell sidebar={<AcademySidebar />}>
      <AppPageLayout>
        <div className="mx-auto w-full max-w-[1400px]">
          <header className="pb-6">
            <Link
              href="/courses?view=admin"
              className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-500 transition hover:text-slate-900"
            >
              <ArrowLeft className="h-4 w-4" />
              Administración
            </Link>

            <h1 className="mt-4 text-[22px] font-semibold tracking-tight text-slate-950">
              Crear curso
            </h1>
            <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-500">
              Define la base del curso y cómo se evaluará. Se guardará como
              borrador antes de generar o editar su contenido.
            </p>
          </header>

          <CourseCreateForm />
        </div>
      </AppPageLayout>
    </AppSectionShell>
  );
}
