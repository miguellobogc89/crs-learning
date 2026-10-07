// app/(app)/courses/page.tsx

import { redirect } from "next/navigation";
import { Roboto } from "next/font/google";

import { auth } from "@/auth";

import { AcademyAdmin } from "@/components/academy/academy-admin";
import { AcademyCreateCourseAction } from "@/components/academy/academy-create-course-action";
import { AcademyHome } from "@/components/academy/academy-home/academy-home";
import { AcademyHomeAside } from "@/components/academy/academy-home/academy-home-aside";
import { AcademySidebar } from "@/components/academy/academy-navigation";
import { AcademyCatalog } from "@/components/academy/catalog/academy-catalog";

import { AppPageHeader } from "@/components/app/layouts/app-page-header";
import { AppPageLayout } from "@/components/app/layouts/app-page-layout";
import { AppSectionShell } from "@/components/app/section-sidebar";

import { ACADEMY_SECTIONS } from "@/lib/navigation/academy-sections";
import { APP_SECTIONS } from "@/lib/navigation/app-sections";

import { prisma } from "@/lib/prisma";

import {
  getAcademyAdminCourses,
  getAcademyHomeData,
} from "@/lib/services/academy.service";

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
  searchParams: Promise<{
    view?: string;
  }>;
}) {
  const session = await auth();

  if (!session?.user?.id) {
    redirect("/");
  }

  const { view } =
    await searchParams;

  const section =
    ACADEMY_SECTIONS.find(
      (item) =>
        item.id === view,
    ) ??
    ACADEMY_SECTIONS[0];

  const isHome =
    section.id === "home";

  const isCatalog =
    section.id === "catalog";

  const isAdmin =
    section.id === "admin";

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

  const header = (
    <AppPageHeader
      section={
        APP_SECTIONS.courses
      }
      title={section.label}
      actions={
        isAdmin &&
        canManageAcademy ? (
          <AcademyCreateCourseAction />
        ) : undefined
      }
    />
  );

  const aside =
    isHome &&
    academyHomeData ? (
      <AcademyHomeAside
        data={
          academyHomeData
        }
      />
    ) : undefined;

  return (
    <div
      className={`${roboto.className} h-full min-h-0`}
    >
      <AppSectionShell
        sidebar={
          <AcademySidebar />
        }
      >
        <AppPageLayout
          header={header}
          aside={aside}
          asideClassName="xl:w-[400px] 2xl:w-[440px]"
        >
          {isHome &&
          academyHomeData ? (
            <AcademyHome
              data={
                academyHomeData
              }
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