// app/(app)/courses/page.tsx

import { redirect } from "next/navigation";
import { Roboto } from "next/font/google";

import { auth } from "@/auth";
import { AppPageLayout } from "@/components/app/layouts/app-page-layout";
import { AppSectionShell } from "@/components/app/section-sidebar";
import { AcademyAdmin } from "@/components/academy/academy-admin";
import { AcademyHome } from "@/components/academy/academy-home";
import { AcademySidebar } from "@/components/academy/academy-navigation";
import { ACADEMY_SECTIONS } from "@/lib/navigation/academy-sections";
import { AcademyCatalog } from "@/components/academy/catalog/academy-catalog";
import { prisma } from "@/lib/prisma";
import {
  getAcademyAdminCourses,
  getAcademyHomeData,
} from "@/lib/services/academy.service";
import {
  ChevronRight,
  GraduationCap,
} from "lucide-react";

const roboto = Roboto({
  subsets: ["latin"],
  weight: [
    "400",
    "500",
    "600",
    "700",
  ],
});

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
    ACADEMY_SECTIONS.find(
      (item) => item.id === view,
    ) ?? ACADEMY_SECTIONS[0];

  const isHome = section.id === "home";
  const isCatalog = section.id === "catalog";
  const isAdmin = section.id === "admin";

  const [
    academyHomeData,
    currentUser,
    adminCourses,
  ] = await Promise.all([
    isHome
      ? getAcademyHomeData(
          session.user.id,
        )
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
      ? getAcademyAdminCourses(
          session.user.id,
        )
      : Promise.resolve([]),
  ]);

  const canManageAcademy =
    currentUser?.system_role ===
      "org_manager" ||
    currentUser?.system_role ===
      "system_admin";

const header =
  isHome ? (
    <div className="min-w-0">
      <div className="flex items-center gap-2 text-xs font-medium text-slate-500">
        <GraduationCap className="h-4 w-4 text-[#315BFF]" />

        <span>Academy</span>

        <ChevronRight className="h-3.5 w-3.5" />

        <span>Inicio</span>
      </div>

      <h1 className="mt-3 text-[26px] font-semibold tracking-tight text-slate-950">
        Academy
      </h1>
    </div>
  ) : isAdmin ? (
      <div className="min-w-0">
        <div className="mb-1 truncate text-sm text-muted-foreground">
          Academy / Administración
        </div>

        <h1 className="text-xl font-semibold tracking-tight text-slate-950">
          Administración
        </h1>
      </div>
    ) : (
      <div className="min-w-0">
        <div className="mb-1 truncate text-sm text-muted-foreground">
          Academy / {section.label}
        </div>

        <h1 className="text-xl font-semibold tracking-tight text-slate-950">
          {section.label}
        </h1>
      </div>
    );

return (
  <div
    className={`${roboto.className} h-full min-h-0`}
  >
    <AppSectionShell
      sidebar={<AcademySidebar />}
    >
        <AppPageLayout
          header={header}
          contentClassName={
            isHome
              ? "!flex !min-h-0 !flex-col !overflow-hidden !p-0"
              : undefined
          }
        >
          {isHome && academyHomeData ? (
            <AcademyHome
              data={academyHomeData}
            />
          ) : null}

          {isCatalog ? (
  <AcademyCatalog />
) : null}

          {isAdmin ? (
            <AcademyAdmin
              canManageAcademy={
                canManageAcademy
              }
              initialCourses={
                adminCourses
              }
            />
          ) : null}
        </AppPageLayout>
      </AppSectionShell>
    </div>
  );
}