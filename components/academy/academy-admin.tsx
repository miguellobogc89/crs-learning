// components/academy/academy-admin.tsx

"use client";

import { useMemo, useState, useTransition } from "react";
import {
  BookOpen,
  ChevronLeft,
  ChevronRight,
  CircleDot,
  EyeOff,
  FileText,
  Filter,
  GraduationCap,
  MoreVertical,
  Pencil,
  Plus,
  Search,
  ShieldCheck,
  Trash2,
  Upload,
  Users,
} from "lucide-react";
import { toast } from "sonner";

import {
  deleteCourseAction,
  setCoursePublishedAction,
} from "@/app/actions/course";
import { CourseCreatorSheet } from "@/components/academy/course-creator-sheet";
import { CourseManagementSheet } from "@/components/academy/course-management-sheet";
import type { AcademyAdminCourse } from "@/lib/services/academy.service";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type AcademyAdminProps = {
  canManageAcademy: boolean;
  initialCourses: AcademyAdminCourse[];
};

const LEVEL_LABELS = {
  beginner: "Básico",
  intermediate: "Intermedio",
  advanced: "Avanzado",
} as const;

const TYPE_LABELS = {
  required: "Obligatoria",
  skills: "Competencias",
} as const;

export function AcademyAdmin({
  canManageAcademy,
  initialCourses,
}: AcademyAdminProps) {
  const [courses, setCourses] =
    useState<AcademyAdminCourse[]>(initialCourses);

  const [createOpen, setCreateOpen] = useState(false);
  const [selectedCourse, setSelectedCourse] =
    useState<AcademyAdminCourse | null>(null);
  const [managementOpen, setManagementOpen] = useState(false);
  const [courseToDelete, setCourseToDelete] =
    useState<AcademyAdminCourse | null>(null);

  const [activeTab, setActiveTab] = useState<
    "all" | "published" | "draft"
  >("all");

  const [search, setSearch] = useState("");
  const [isChanging, startChanging] = useTransition();

  const visibleCourses = useMemo(() => {
    const query = search.trim().toLowerCase();

    return courses.filter((course) => {
      const matchesTab =
        activeTab === "all" || course.status === activeTab;

      const matchesSearch =
        !query ||
        course.title.toLowerCase().includes(query) ||
        course.description.toLowerCase().includes(query);

      return matchesTab && matchesSearch;
    });
  }, [courses, activeTab, search]);

  const publishedCount = courses.filter(
    (course) => course.status === "published",
  ).length;

  const draftCount = courses.filter(
    (course) => course.status === "draft",
  ).length;

  const studentCount = courses.reduce(
    (total, course) => total + course.students,
    0,
  );

  function upsertCourse(course: AcademyAdminCourse) {
    setCourses((current) => {
      const exists = current.some((item) => item.id === course.id);

      if (!exists) {
        return [course, ...current];
      }

      return current.map((item) =>
        item.id === course.id ? course : item,
      );
    });

    setSelectedCourse((current) =>
      current?.id === course.id ? course : current,
    );
  }

  function handleCourseCreated(course: AcademyAdminCourse) {
    upsertCourse(course);
    setActiveTab("all");
    setSearch("");
  }

  function openCourse(course: AcademyAdminCourse) {
    setSelectedCourse(course);
    setManagementOpen(true);
  }

  function changePublished(
    course: AcademyAdminCourse,
    published: boolean,
  ) {
    startChanging(async () => {
      const result = await setCoursePublishedAction(
        course.id,
        published,
      );

      if (!result.ok) {
        toast.error(result.error);
        return;
      }

      upsertCourse(result.course);

      toast.success(
        published ? "Curso publicado." : "Curso ocultado.",
      );
    });
  }

  function confirmDelete() {
    if (!courseToDelete) {
      return;
    }

    const id = courseToDelete.id;

    startChanging(async () => {
      const result = await deleteCourseAction(id);

      if (!result.ok) {
        toast.error(result.error);
        return;
      }

      setCourses((current) =>
        current.filter((course) => course.id !== id),
      );

      if (selectedCourse?.id === id) {
        setManagementOpen(false);
        setSelectedCourse(null);
      }

      setCourseToDelete(null);
      toast.success("Curso eliminado.");
    });
  }

  if (!canManageAcademy) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-8">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100 text-slate-500">
          <ShieldCheck className="h-5 w-5" />
        </div>

        <h2 className="mt-4 text-base font-semibold text-slate-950">
          Gestión de cursos
        </h2>

        <p className="mt-1 max-w-xl text-sm text-slate-500">
          No tienes permisos para gestionar la formación de la organización.
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="space-y-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="flex items-center gap-2 text-xs font-medium text-slate-500">
              <GraduationCap className="h-4 w-4 text-[#315BFF]" />
              <span>Academy</span>
              <ChevronRight className="h-3.5 w-3.5" />
              <span>Gestión de cursos</span>
            </div>

            <h2 className="mt-3 text-[26px] font-semibold tracking-tight text-slate-950">
              Gestión de cursos
            </h2>

            <p className="mt-1 text-sm text-slate-500">
              Crea y administra la formación de tu organización.
            </p>
          </div>

          <Button
            size="lg"
            className="gap-2 bg-[#315BFF] px-4 text-white hover:bg-[#244BE8]"
            onClick={() => setCreateOpen(true)}
          >
            <Plus className="h-4 w-4" />
            Crear curso
          </Button>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <MetricCard
            icon={BookOpen}
            value={courses.length.toLocaleString("es-ES")}
            label="Cursos totales"
            tone="blue"
          />

          <MetricCard
            icon={CircleDot}
            value={publishedCount.toLocaleString("es-ES")}
            label="Publicados"
            tone="green"
          />

          <MetricCard
            icon={FileText}
            value={draftCount.toLocaleString("es-ES")}
            label="Borradores"
            tone="violet"
          />

          <MetricCard
            icon={Users}
            value={studentCount.toLocaleString("es-ES")}
            label="Asignaciones"
            tone="blue"
          />
        </div>

        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
          <div className="flex flex-col gap-4 border-b border-slate-200 px-4 pt-4 lg:flex-row lg:items-end lg:justify-between">
            <div className="flex min-w-0 gap-1 overflow-x-auto">
              <TabButton
                active={activeTab === "all"}
                onClick={() => setActiveTab("all")}
              >
                Todos los cursos
              </TabButton>

              <TabButton
                active={activeTab === "published"}
                onClick={() => setActiveTab("published")}
              >
                Publicados
              </TabButton>

              <TabButton
                active={activeTab === "draft"}
                onClick={() => setActiveTab("draft")}
              >
                Borradores
              </TabButton>
            </div>

            <div className="flex gap-2 pb-3">
              <div className="relative min-w-0 sm:w-56">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />

                <Input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Buscar cursos..."
                  className="h-9 bg-slate-50 pl-8"
                />
              </div>

              <Button variant="outline" size="lg" className="gap-2">
                <Filter className="h-4 w-4" />
                Filtros
              </Button>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[950px] border-collapse">
              <thead>
                <tr className="bg-slate-50/80 text-left text-[11px] font-medium text-slate-500">
                  <th className="w-12 px-4 py-3" />
                  <th className="px-2 py-3">Curso</th>
                  <th className="px-3 py-3">Tipo</th>
                  <th className="px-3 py-3">Nivel</th>
                  <th className="px-3 py-3">Dificultad</th>
                  <th className="px-3 py-3">Estado</th>
                  <th className="px-3 py-3">Actualización</th>
                  <th className="px-3 py-3">Asignados</th>
                  <th className="w-14 px-3 py-3 text-center">
                    Acciones
                  </th>
                </tr>
              </thead>

              <tbody>
                {visibleCourses.map((course) => (
                  <CourseRow
                    key={course.id}
                    course={course}
                    disabled={isChanging}
                    onOpen={() => openCourse(course)}
                    onPublish={() =>
                      changePublished(course, true)
                    }
                    onHide={() =>
                      changePublished(course, false)
                    }
                    onDelete={() => setCourseToDelete(course)}
                  />
                ))}
              </tbody>
            </table>
          </div>

          {visibleCourses.length === 0 ? (
            <div className="flex min-h-52 flex-col items-center justify-center px-6 text-center">
              <BookOpen className="h-5 w-5 text-slate-300" />

              <p className="mt-3 text-sm font-medium text-slate-800">
                No hay cursos que mostrar
              </p>

              <p className="mt-1 text-xs text-slate-500">
                Crea un curso o cambia los filtros.
              </p>
            </div>
          ) : null}

          <div className="flex items-center justify-between border-t border-slate-200 px-4 py-3">
            <p className="text-xs text-slate-500">
              Mostrando {visibleCourses.length} de {courses.length} cursos
            </p>

            <div className="flex items-center gap-1">
              <Button variant="ghost" size="icon-sm">
                <ChevronLeft className="h-4 w-4" />
              </Button>

              <Button
                size="icon-sm"
                className="bg-[#315BFF] text-white hover:bg-[#244BE8]"
              >
                1
              </Button>

              <Button variant="ghost" size="icon-sm">
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </section>
      </div>

      <CourseCreatorSheet
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCourseCreated={handleCourseCreated}
      />

      <CourseManagementSheet
        course={selectedCourse}
        open={managementOpen}
        onOpenChange={setManagementOpen}
        onCourseUpdated={upsertCourse}
      />

      <AlertDialog
        open={Boolean(courseToDelete)}
        onOpenChange={(open) => {
          if (!open) {
            setCourseToDelete(null);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              ¿Eliminar este curso?
            </AlertDialogTitle>

            <AlertDialogDescription>
              Se eliminará “{courseToDelete?.title}” y sus datos
              asociados. Esta acción no se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>

          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>

            <AlertDialogAction
              variant="destructive"
              disabled={isChanging}
              onClick={confirmDelete}
            >
              Eliminar curso
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function CourseRow({
  course,
  disabled,
  onOpen,
  onPublish,
  onHide,
  onDelete,
}: {
  course: AcademyAdminCourse;
  disabled: boolean;
  onOpen: () => void;
  onPublish: () => void;
  onHide: () => void;
  onDelete: () => void;
}) {
  return (
    <tr
      onClick={onOpen}
      className="cursor-pointer border-t border-slate-100 text-xs transition hover:bg-slate-50/70"
    >
      <td
        className="px-4 py-3"
        onClick={(event) => event.stopPropagation()}
      >
        <input
          type="checkbox"
          aria-label={`Seleccionar ${course.title}`}
          className="h-4 w-4 rounded border-slate-300"
        />
      </td>

      <td className="px-2 py-3">
        <div className="flex min-w-[280px] items-center gap-3">
          <div className="h-11 w-14 shrink-0 overflow-hidden rounded-lg bg-[#EEF2FF]">
            {course.thumbnailUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={course.thumbnailUrl}
                alt=""
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-[#315BFF]">
                <BookOpen className="h-5 w-5" />
              </div>
            )}
          </div>

          <div className="min-w-0">
            <p className="font-semibold text-slate-900">
              {course.title}
            </p>

            <p className="mt-0.5 max-w-[300px] truncate text-[11px] text-slate-500">
              {course.description || "Sin descripción"}
            </p>
          </div>
        </div>
      </td>

      <td className="px-3 py-3">
        <Badge
          variant="secondary"
          className={cn(
            "border-0 font-medium",
            course.type === "required"
              ? "bg-red-50 text-red-600"
              : "bg-[#EEF2FF] text-[#315BFF]",
          )}
        >
          {TYPE_LABELS[course.type]}
        </Badge>
      </td>

      <td className="px-3 py-3">
        <Badge className="border-0 bg-slate-100 font-normal text-slate-600">
          {LEVEL_LABELS[course.level]}
        </Badge>
      </td>

      <td className="px-3 py-3 text-slate-600">
        {course.difficulty === "low"
          ? "Baja"
          : course.difficulty === "high"
            ? "Alta"
            : "Media"}
      </td>

      <td className="px-3 py-3">
        <Badge
          className={cn(
            "border-0 font-normal",
            course.status === "published"
              ? "bg-emerald-50 text-emerald-700"
              : "bg-slate-100 text-slate-600",
          )}
        >
          {course.status === "published"
            ? "Publicado"
            : "Borrador"}
        </Badge>
      </td>

      <td className="px-3 py-3 text-slate-500">
        {course.updatedAt}
      </td>

      <td className="px-3 py-3">
        <div className="flex items-center gap-1.5 text-slate-600">
          <Users className="h-3.5 w-3.5 text-slate-400" />
          {course.students.toLocaleString("es-ES")}
        </div>
      </td>

      <td
        className="px-3 py-3 text-center"
        onClick={(event) => event.stopPropagation()}
      >
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon-sm"
              disabled={disabled}
            >
              <MoreVertical className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>

          <DropdownMenuContent align="end" className="w-44">
            <DropdownMenuItem onSelect={onOpen}>
              <Pencil className="h-4 w-4" />
              Editar
            </DropdownMenuItem>

            {course.status === "published" ? (
              <DropdownMenuItem onSelect={onHide}>
                <EyeOff className="h-4 w-4" />
                Ocultar
              </DropdownMenuItem>
            ) : (
              <DropdownMenuItem onSelect={onPublish}>
                <Upload className="h-4 w-4" />
                Publicar
              </DropdownMenuItem>
            )}

            <DropdownMenuSeparator />

            <DropdownMenuItem
              variant="destructive"
              onSelect={onDelete}
            >
              <Trash2 className="h-4 w-4" />
              Eliminar
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </td>
    </tr>
  );
}

function MetricCard({
  icon: Icon,
  value,
  label,
  tone,
}: {
  icon: typeof BookOpen;
  value: string;
  label: string;
  tone: "blue" | "green" | "violet";
}) {
  const tones = {
    blue: "bg-[#EEF2FF] text-[#315BFF]",
    green: "bg-emerald-50 text-emerald-600",
    violet: "bg-violet-50 text-violet-600",
  };

  return (
    <div className="flex min-h-[82px] items-center gap-4 rounded-xl border border-slate-200 bg-white px-4 py-3">
      <div
        className={cn(
          "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl",
          tones[tone],
        )}
      >
        <Icon className="h-5 w-5" />
      </div>

      <div>
        <p className="text-xl font-semibold leading-none text-slate-950">
          {value}
        </p>

        <p className="mt-1.5 text-xs text-slate-500">
          {label}
        </p>
      </div>
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "relative whitespace-nowrap px-3 pb-3 pt-1 text-xs font-medium transition",
        active
          ? "text-[#315BFF]"
          : "text-slate-500 hover:text-slate-900",
      )}
    >
      {children}

      {active ? (
        <span className="absolute inset-x-2 bottom-0 h-0.5 rounded-full bg-[#315BFF]" />
      ) : null}
    </button>
  );
}