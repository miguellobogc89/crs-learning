import { notFound, redirect } from "next/navigation";
import { Roboto } from "next/font/google";
import { auth } from "@/auth";
import { getAcademyCourseDetail } from "@/lib/services/academy.service";
import { AcademyCourseDetailContent } from "@/components/academy/academy-course-detail";
import { AcademySidebar } from "@/components/academy/academy-navigation";
import { AppPageHeader } from "@/components/app/layouts/app-page-header";
import { AppPageLayout } from "@/components/app/layouts/app-page-layout";
import { AppSectionShell } from "@/components/app/section-sidebar";
import { APP_SECTIONS } from "@/lib/navigation/app-sections";

const roboto = Roboto({ subsets: ["latin"], weight: ["400", "500", "600", "700"] });

export default async function CoursePage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) redirect("/");
  const { id } = await params;
  const detail = await getAcademyCourseDetail(session.user.id, id);
  if (!detail) notFound();
  return <div className={`${roboto.className} h-full min-h-0 min-w-0`}>
    <AppSectionShell sidebar={<AcademySidebar />}>
      <AppPageLayout header={<AppPageHeader section={APP_SECTIONS.courses} title={detail.course.title} items={[{ label: "Detalle del curso" }]} />}>
        <AcademyCourseDetailContent detail={detail} />
      </AppPageLayout>
    </AppSectionShell>
  </div>;
}
