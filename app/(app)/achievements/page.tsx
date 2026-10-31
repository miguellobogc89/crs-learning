// app/(app)/achievements/page.tsx
import { AppPageLayout } from "@/components/app/layouts/app-page-layout";
import { AppPageHeader } from "@/components/app/layouts/app-page-header";
import { APP_SECTIONS } from "@/lib/navigation/app-sections";
import {
  AppSectionShell,
} from "@/components/app/section-sidebar";

export default function AchievementsPage() {
  return (
    <AppSectionShell
      sidebar={<AchievementsSidebar />}
    >
      <AppPageLayout
        header={
          <AppPageHeader section={APP_SECTIONS.achievements} title="Logros" />
        }
      >
        <p className="pt-2 text-sm text-slate-500">Próximamente.</p>
      </AppPageLayout>
    </AppSectionShell>
  );
}

function AchievementsSidebar() {
  return (
    <div className="space-y-6 p-4">
      <div>
        <p className="mb-2 px-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          Logros
        </p>

        <div className="space-y-1">
          {[
            "Resumen",
            "Insignias",
            "Progreso",
          ].map((item) => (
            <button
              key={item}
              type="button"
              className="flex w-full items-center rounded-lg px-3 py-2 text-left text-sm text-muted-foreground transition hover:bg-surface hover:text-foreground"
            >
              {item}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
