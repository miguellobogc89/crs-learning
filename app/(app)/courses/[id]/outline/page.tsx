// app/(app)/courses/[id]/outline/page.tsx
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

export default async function CourseOutlineJsonPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) redirect("/");
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();

  const [user, course] = await Promise.all([
    prisma.users.findUnique({ where: { id: session.user.id }, select: { system_role: true, company_id: true } }),
    prisma.courses.findUnique({ where: { id }, select: {
      id: true, title: true, company_id: true, is_published: true, evaluation_config: true,
    } }),
  ]);
  if (!user || !course || !["org_manager", "system_admin"].includes(user.system_role) ||
      (user.system_role !== "system_admin" && (!user.company_id || user.company_id !== course.company_id))) {
    notFound();
  }
  const config = course.evaluation_config;
  const outline = config && typeof config === "object" && !Array.isArray(config) ? config.outline : null;

  return (
    <main className="h-full overflow-y-auto bg-slate-50 px-6 py-8 text-slate-900">
      <div className="mx-auto max-w-5xl">
        <Link href="/courses?view=admin" className="text-sm text-blue-600 hover:underline">← Administración</Link>
        <h1 className="mt-5 text-2xl font-semibold">{course.title}</h1>
        <p className="mt-2 text-sm text-slate-500">Propuesta de módulos en JSON · pendiente de revisión</p>
        <pre className="mt-6 overflow-x-auto rounded-xl border border-slate-200 bg-white p-6 text-xs leading-6 text-slate-800">{JSON.stringify(outline ?? { message: "Este curso todavía no tiene una propuesta generada." }, null, 2)}</pre>
      </div>
    </main>
  );
}
