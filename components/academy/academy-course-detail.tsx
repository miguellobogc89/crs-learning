import Link from "next/link";
import type { ReactNode } from "react";
import { AcademyThumbnail } from "@/components/academy/academy-learning-sections";
import type { AcademyCourseDetail } from "@/lib/services/academy.service";

const labels: Record<string, string> = {
  id: "Identificador", title: "Título", slug: "Slug", description: "Descripción",
  level: "Nivel", category: "Categoría", is_published: "Publicado", sort_order: "Orden",
  created_at: "Creación", updated_at: "Última actualización", required_course_id: "Curso previo (ID)",
  knowledge_source_id: "Fuente de conocimiento (ID)", company_id: "Empresa (ID)",
  created_by_user_id: "Creador (ID)", evaluation_config: "Configuración de evaluación y generación",
  name: "Nombre", user_id: "Usuario (ID)", course_id: "Curso (ID)",
  assigned_by_user_id: "Asignado por (ID)", is_required: "Obligatorio", assigned_at: "Fecha de asignación",
  due_at: "Fecha límite", status: "Estado", progress_percent: "Progreso (%)", started_at: "Inicio",
  completed_at: "Finalización", suspended_at: "Suspensión", module_id: "Sección (ID)",
  lesson_id: "Lección (ID)", section_id: "Sección (ID)", quiz_id: "Evaluación (ID)",
  required_section_id: "Sección previa (ID)", learning_objectives: "Objetivos de aprendizaje",
  content: "Contenido", lesson_type: "Tipo de lección", estimated_minutes: "Duración estimada (min)",
  lessons: "Lecciones", quizzes: "Evaluaciones", section_items: "Estructura y orden de contenidos",
  item_type: "Tipo de contenido", user_lesson_progress: "Tu progreso en la lección",
  questions: "Preguntas", question_text: "Pregunta", question_type: "Tipo de pregunta",
  explanation: "Explicación", question_options: "Opciones", option_text: "Opción",
  question_id: "Pregunta (ID)", is_correct: "Respuesta correcta", passing_score: "Puntuación mínima",
  max_attempts: "Máximo de intentos", time_limit_seconds: "Límite de tiempo (s)",
  quiz_attempts: "Tus intentos registrados", score: "Puntuación", passed: "Aprobado",
  users_course_assignments_user_idTousers: "Persona asignada",
  users_course_assignments_assigned_by_user_idTousers: "Asignado por",
  owner_user_id: "Propietario (ID)", visibility: "Visibilidad", knowledge_type: "Tipo de conocimiento",
  library_id: "Biblioteca (ID)", updated_by_user_id: "Actualizado por (ID)", summary: "Resumen",
  language: "Idioma", domain: "Dominio", confidence: "Confianza", tags: "Etiquetas",
  keywords: "Palabras clave", entities: "Entidades", knowledge_files: "Archivos de origen",
  file_name: "Nombre del archivo", file_type: "Tipo de archivo", file_size: "Tamaño (bytes)",
};

function Information({ value }: { value: unknown }): ReactNode {
  if (value === null || value === undefined) return <span className="text-slate-400">Sin dato</span>;
  if (value instanceof Date) return <time dateTime={value.toISOString()}>{new Intl.DateTimeFormat("es-ES", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Madrid" }).format(value)}</time>;
  if (typeof value === "boolean") return value ? "Sí" : "No";
  if (Array.isArray(value)) return value.length ? <div className="space-y-3">{value.map((item, index) => <div key={index} className="min-w-0 rounded-lg border border-slate-200 p-3"><Information value={item} /></div>)}</div> : <span className="text-slate-500">Sin registros</span>;
  if (typeof value === "object") return <dl className="grid min-w-0 gap-3">{Object.entries(value).map(([key, item]) => <div key={key} className="min-w-0"><dt className="mb-1 text-xs font-semibold text-slate-500">{labels[key] ?? key.replaceAll("_", " ")}</dt><dd className="min-w-0 whitespace-pre-wrap break-words text-sm text-slate-800 [overflow-wrap:anywhere]"><Information value={item} /></dd></div>)}</dl>;
  return String(value);
}

function Block({ title, children }: { title: string; children: ReactNode }) {
  return <section className="min-w-0 rounded-lg border border-slate-200 bg-white p-4 sm:p-5"><h2 className="mb-4 text-base font-semibold text-[#07113D]">{title}</h2>{children}</section>;
}

export function AcademyCourseDetailContent({ detail }: { detail: AcademyCourseDetail }) {
  const { course, source } = detail;
  const { sections, course_assignments, user_course_progress, users, companies, thumbnail_url, description, evaluation_config, ...metadata } = course;
  return <div className="min-w-0 space-y-4 pb-4">
    <Link href="/courses" className="inline-flex rounded text-sm font-semibold text-[#315BFF] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#315BFF]">Volver a Academy</Link>
    <Block title="Información del curso">
      <div className="flex min-w-0 flex-wrap items-start gap-5">
        {thumbnail_url ? <AcademyThumbnail variant="knowledge" url={`/api/academy/course-cover/${course.id}`} className="h-40 w-full max-w-sm rounded-lg" /> : null}
        <div className="min-w-0 flex-1 basis-60 space-y-3">
          <Information value={{ title: course.title, category: course.category, level: course.level, is_published: course.is_published }} />
          <p className="text-sm text-slate-600">Duración estimada: {sections.some(section => section.lessons.length) ? `${detail.estimatedMinutes} min (suma de las lecciones)` : "Sin lecciones para calcularla"}</p>
          <p className="text-sm text-slate-600">{sections.length} secciones · {sections.reduce((total, section) => total + section.lessons.length, 0)} lecciones</p>
        </div>
      </div>
    </Block>
    {description !== null ? <Block title="Descripción"><p className="whitespace-pre-wrap break-words text-sm leading-6 text-slate-700">{description}</p></Block> : null}
    <Block title="Tu estado y progreso">{user_course_progress.length ? <Information value={user_course_progress} /> : <p className="text-sm text-slate-500">Todavía no tienes progreso registrado en este curso.</p>}</Block>
    <Block title={detail.canManage ? "Asignaciones del curso" : "Tu asignación"}>{course_assignments.length ? <Information value={course_assignments} /> : <p className="text-sm text-slate-500">Sin asignaciones registradas.</p>}</Block>
    {users ? <Block title="Creador"><Information value={users} /></Block> : null}
    {companies ? <Block title="Empresa"><Information value={companies} /></Block> : null}
    {detail.requiredCourse || detail.dependentCourses.length ? <Block title="Cursos relacionados"><div className="space-y-2">{detail.requiredCourse ? <p className="text-sm">Curso previo: <Link className="text-[#315BFF] underline" href={`/courses/${detail.requiredCourse.id}`}>{detail.requiredCourse.title}</Link></p> : null}{detail.dependentCourses.map(item => <p key={item.id} className="text-sm">Requiere este curso: <Link className="text-[#315BFF] underline" href={`/courses/${item.id}`}>{item.title}</Link></p>)}</div></Block> : null}
    {sections.length ? <Block title="Estructura y contenido"><div className="space-y-3">{sections.map(section => <details key={section.id} className="min-w-0 rounded-lg border border-slate-200 p-3"><summary className="cursor-pointer break-words rounded font-semibold text-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#315BFF]">{section.title}</summary><div className="mt-4"><Information value={section} /></div></details>)}</div></Block> : null}
    {evaluation_config !== null ? <Block title="Configuración y metadatos de evaluación"><Information value={evaluation_config} /></Block> : null}
    {source ? <Block title="Fuente de conocimiento"><Information value={source} /></Block> : course.knowledge_source_id ? <Block title="Fuente de conocimiento"><p className="text-sm text-slate-500">Fuente vinculada. Su información requiere permisos de Knowledge.</p></Block> : null}
    <Block title="Información administrativa"><Information value={metadata} /></Block>
  </div>;
}
