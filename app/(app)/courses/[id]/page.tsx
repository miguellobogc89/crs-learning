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
import { AcademyCourseDetailHeader } from "@/components/academy/course-detail/academy-course-detail-header";
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
        h-full
        min-h-0
        min-w-0
        overflow-hidden
        bg-200
      `}
    >
      <AppSectionShell
        sidebar={<AcademySidebar />}
      >
        <AppPageLayout
          aside={
            <div className="h-full bg-200">
              <AcademyCourseDetailAside
                detail={detail}
              />
            </div>
          }
          asideClassName="
            bg-200
            xl:w-[340px]
            2xl:w-[360px]
          "
          contentClassName="
            min-h-0
            overflow-hidden
            bg-yellow-200
            !px-0
            !pb-0
            !pt-0
          "
        >
          <div className="bg-300 px-5">
            <AcademyCourseDetailHeader
              detail={detail}
            />
          </div>

          <div
            className="
              min-h-0
              min-w-0
              flex-1
              overflow-hidden
              bg-300
              !px-5
              !pt-0
              !pb-0
            "
          >
            <div className="h-full min-h-0 pb-0">
              <AcademyCourseDetailContent
                detail={detail}
              />
            </div>
          </div>
        </AppPageLayout>
      </AppSectionShell>
    </div>
  );
}