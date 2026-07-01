// app/(app)/courses/page.tsx
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

import { PageTitle } from "@/components/app/page-title";

import { listCourses } from "@/lib/services/course.service";

export default async function CoursesPage() {
  const courses = await listCourses();

  return (
    <>
      <div className="mb-8 flex items-center justify-between">

        <PageTitle
          title="Mis cursos"
          subtitle="Gestiona todas tus formaciones."
        />

        <Button asChild>
          <Link href="/courses/new">
            Nuevo curso
          </Link>
        </Button>

      </div>

      <div className="grid gap-6 lg:grid-cols-3">

        {courses.map((course) => (

          <Link
            key={course.id}
            href={`/courses/${course.id}`}
          >

            <Card className="cursor-pointer border-slate-800 bg-slate-950 transition hover:border-cyan-500">

              <CardContent className="space-y-4 p-6">

                <h2 className="text-xl font-bold text-white">
                  {course.title}
                </h2>

                <p className="line-clamp-2 text-sm text-slate-400">
                  {course.description}
                </p>

                <p className="text-xs uppercase text-cyan-400">
                  {course.level}
                </p>

              </CardContent>

            </Card>

          </Link>

        ))}

      </div>
    </>
  );
}