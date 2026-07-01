// app/(app)/courses/new/page.tsx
import { createCourseAction } from "@/app/actions/course";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

import { PageTitle } from "@/components/app/page-title";

export default function NewCoursePage() {
  return (
    <>
      <PageTitle
        title="Nuevo curso"
        subtitle="Empieza creando la información básica."
      />

      <form
        action={createCourseAction}
        className="max-w-2xl space-y-6"
      >

        <Input
          name="title"
          placeholder="Nombre del curso"
          required
        />

        <Textarea
          name="description"
          placeholder="Descripción"
        />

        <select
          name="level"
          className="h-11 w-full rounded-md border border-slate-700 bg-slate-950 px-3 text-white"
        >
          <option value="beginner">Principiante</option>
          <option value="intermediate">Intermedio</option>
          <option value="advanced">Avanzado</option>
        </select>

        <Button type="submit">

          Crear curso

        </Button>

      </form>
    </>
  );
}