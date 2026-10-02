// app/(app)/courses/page.tsx

import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { AppPageLayout } from "@/components/app/layouts/app-page-layout";
import { AppSectionShell } from "@/components/app/section-sidebar";
import { AcademyAdmin } from "@/components/academy/academy-admin";
import { AcademyHome } from "@/components/academy/academy-home";
import { AcademySidebar } from "@/components/academy/academy-navigation";
import { ACADEMY_SECTIONS } from "@/lib/navigation/academy-sections";
import { APP_SECTIONS } from "@/lib/navigation/app-sections";
import { prisma } from "@/lib/prisma";
import {
  getAcademyAdminCourses,
  getAcademyHomeData,
} from "@/lib/services/academy.service";

export default async function AcademyPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string }>;
}) {
  const session = await auth();

  if (!session?.user?.id) {
    redirect("/");
  }

  const { view } = await searchParams;

  const section =
    ACADEMY_SECTIONS.find((item) => item.id === view) ??
    ACADEMY_SECTIONS[0];

  const isHome = section.id === "home";
  const isAdmin = section.id === "admin";

  const [academyHomeData, currentUser, adminCourses] = await Promise.all([
    isHome
      ? getAcademyHomeData(session.user.id)
      : Promise.resolve(null),

    isAdmin
      ? prisma.users.findUnique({
          where: {
            id: session.user.id,
          },
          select: {
            system_role: true,
          },
        })
      : Promise.resolve(null),

    isAdmin
      ? getAcademyAdminCourses(session.user.id)
      : Promise.resolve([]),
  ]);

  const canManageAcademy =
    currentUser?.system_role === "org_manager" ||
    currentUser?.system_role === "system_admin";

  return (
    <AppSectionShell sidebar={<AcademySidebar />}>
      <AppPageLayout>
        <div className="mx-auto flex min-h-full w-full max-w-[1600px] flex-col">

          {isHome && academyHomeData ? (
            <AcademyHome data={academyHomeData} />
          ) : null}

          {isAdmin ? (
            <AcademyAdmin
              canManageAcademy={canManageAcademy}
              initialCourses={adminCourses}
            />
          ) : null}
        </div>
      </AppPageLayout>
    </AppSectionShell>
  );
}