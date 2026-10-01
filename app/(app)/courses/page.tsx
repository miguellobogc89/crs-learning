import { AppPageLayout } from "@/components/app/layouts/app-page-layout";
import { AppSectionShell } from "@/components/app/section-sidebar";
import { APP_SECTIONS } from "@/lib/navigation/app-sections";

export default function AcademyPage() {
  return (
    <AppSectionShell
      sidebar={
        <div className="border-b border-slate-200/60 px-4 py-4">
          <h2 className="text-[13px] font-semibold text-slate-900">
            {APP_SECTIONS.courses.label}
          </h2>
        </div>
      }
    >
      <AppPageLayout>
        <div className="mx-auto flex min-h-full w-full max-w-[1600px] flex-col">
          <header className="shrink-0 pb-5">
            <h1 className="text-[22px] font-semibold tracking-tight text-slate-950">
              {APP_SECTIONS.courses.label}
            </h1>
          </header>
        </div>
      </AppPageLayout>
    </AppSectionShell>
  );
}
