// components/course/new-section.tsx
import { createSection } from "@/app/actions/section";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function NewSection({
  courseId,
}: {
  courseId: string;
}) {
  return (
    <form
      action={createSection}
      className="flex gap-3"
    >

      <input
        type="hidden"
        name="courseId"
        value={courseId}
      />

      <Input
        name="title"
        placeholder="Nueva sección"
      />

      <Button>

        Crear

      </Button>

    </form>
  );
}