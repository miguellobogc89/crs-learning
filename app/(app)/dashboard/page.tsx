// app/dashboard/page.tsx
import { PageTitle } from "@/components/app/page-title";

import { StatCard } from "@/components/app/stat-card";

import { CourseCard } from "@/components/app/course-card";

export default function DashboardPage() {
  return (
    <>

      <PageTitle
        title="Dashboard"
        subtitle="Continúa aprendiendo donde lo dejaste."
      />

      <section className="grid gap-6 md:grid-cols-3">

        <StatCard
          title="Cursos"
          value={3}
        />

        <StatCard
          title="Nivel"
          value={2}
        />

        <StatCard
          title="XP"
          value={120}
        />

      </section>

      <section className="mt-12">

        <h2 className="mb-6 text-2xl font-bold text-white">
          Continúa donde lo dejaste
        </h2>

        <div className="grid gap-6 lg:grid-cols-2">

          <CourseCard
            title="Power Query"
            description="Aprende a transformar datos, crear merges, appends y automatizar procesos."
            progress={42}
          />

        </div>

      </section>

      <section className="mt-14">

        <h2 className="mb-6 text-2xl font-bold text-white">
          Todos los cursos
        </h2>

        <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">

          <CourseCard
            title="Power Query"
            description="Desde cero."
            progress={42}
          />

          <CourseCard
            title="Power BI"
            description="Próximamente."
            progress={0}
          />

          <CourseCard
            title="SQL"
            description="Próximamente."
            progress={0}
          />

        </div>

      </section>

    </>
  );
}