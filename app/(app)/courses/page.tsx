// app/(app)/courses/[id]/page.tsx

import {
  notFound,
  redirect,
} from "next/navigation";
import { Roboto } from "next/font/google";

import { auth } from "@/auth";

import {
  AcademyCourseDetailAside,
  AcademyCourseDetailContent,
} from "@/components/academy/course-detail/academy-course-detail";
import { AcademySidebar } from "@/components/academy/academy-navigation";

import { AppPageLayout } from "@/components/app/layouts/app-page-layout";
import { AppSectionShell } from "@/components/app/section-sidebar";

import { getAcademyCourseDetail } from "@/lib/services/academy.service";

const roboto = Roboto({
  subsets: ["latin"],
  weight: [
    "400",
    "500",
    "600",
    "700",
  ],
});

export default async function CoursePage({
  params,
}: {
  params: Promise<{
    id: string;
  }>;
}) {
  const session = await auth();

  if (!session?.user?.id) {
    redirect("/");
  }

  const { id } = await params;

  const detail =
    await getAcademyCourseDetail(
      session.user.id,
      id,
    );

  if (!detail) {
    notFound();
  }

  return (
    <div
      className={`
        ${roboto.className}
        h-full min-h-0 min-w-0
      `}
    >
      <AppSectionShell
        sidebar={<AcademySidebar />}
      >
        <AppPageLayout
          aside={
            <AcademyCourseDetailAside
              detail={detail}
            />
          }
          asideClassName="
            xl:w-[340px]
            2xl:w-[360px]
          "
          contentClassName="
            px-5 pb-5 pt-0
            sm:px-5
            lg:px-5
          "
        >
          <AcademyCourseDetailContent
            detail={detail}
          />
        </AppPageLayout>
      </AppSectionShell>
    </div>
  );
}