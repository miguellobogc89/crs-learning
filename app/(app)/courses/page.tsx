import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { AppPageLayout } from "@/components/app/layouts/app-page-layout";
import { AppSectionShell } from "@/components/app/section-sidebar";
import { AcademyHome } from "@/components/academy/academy-home";
import { AcademySidebar } from "@/components/academy/academy-navigation";
import { ACADEMY_SECTIONS } from "@/lib/navigation/academy-sections";
import { APP_SECTIONS } from "@/lib/navigation/app-sections";
import { getAcademyHomeData } from "@/lib/services/academy.service";

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
  const academyHomeData = isHome
    ? await getAcademyHomeData(session.user.id)
    : null;

  return (
    <AppSectionShell sidebar={<AcademySidebar />}>
      <AppPageLayout>
        <div className="mx-auto flex min-h-full w-full max-w-[1600px] flex-col">
          <header className="shrink-0 pb-5">
            <h1 className="text-[22px] font-semibold tracking-tight text-slate-950">
              {isHome ? APP_SECTIONS.courses.label : section.label}
            </h1>
            <p className="mt-1 text-sm text-slate-500">
              {isHome
                ? "Tu espacio para aprender y seguir avanzando."
                : "Academy"}
            </p>
          </header>

          {isHome && academyHomeData ? (
            <AcademyHome data={academyHomeData} />
          ) : null}
        </div>
      </AppPageLayout>
    </AppSectionShell>
  );
}
