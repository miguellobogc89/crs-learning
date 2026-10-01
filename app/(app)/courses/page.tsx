import { AppPageLayout } from "@/components/app/layouts/app-page-layout";
import { AppSectionShell } from "@/components/app/section-sidebar";
import { APP_SECTIONS } from "@/lib/navigation/app-sections";
import { ACADEMY_SECTIONS } from "@/lib/navigation/academy-sections";
import { AcademySidebar } from "@/components/academy/academy-navigation";
import { AcademyHome } from "@/components/academy/academy-home";

export default async function AcademyPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string }>;
}) {
  const { view } = await searchParams;
  const section = ACADEMY_SECTIONS.find((item) => item.id === view) ?? ACADEMY_SECTIONS[0];
  const isHome = section.id === "home";

  return (
    <AppSectionShell sidebar={<AcademySidebar />}>
      <AppPageLayout>
        <div className="mx-auto flex min-h-full w-full max-w-[1600px] flex-col">
          <header className="shrink-0 pb-5">
            <h1 className="text-[22px] font-semibold tracking-tight text-slate-950">
              {isHome ? APP_SECTIONS.courses.label : section.label}
            </h1>
            <p className="mt-1 text-sm text-slate-500">
              {isHome ? "Tu espacio para aprender y seguir avanzando." : "Academy"}
            </p>
            {isHome && <p className="mt-2 text-xs text-slate-400">Datos de demostración</p>}
          </header>
          {isHome && <AcademyHome />}
        </div>
      </AppPageLayout>
    </AppSectionShell>
  );
}
