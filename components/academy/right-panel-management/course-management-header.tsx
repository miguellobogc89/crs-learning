// components/academy/right-panel-management/course-management-header.tsx

"use client";

import { BookOpen } from "lucide-react";

type CourseManagementHeaderProps = {
  mode: "create" | "edit";
};

export function CourseManagementHeader({
  mode,
}: CourseManagementHeaderProps) {
  const isEditing = mode === "edit";

  return (
    <header className="shrink-0 border-b border-[#EEF1F6] bg-white px-5 py-4">
      <div className="flex items-start gap-3">
        <div className="flex h-7 w-7 shrink-0 items-center justify-center text-[#315BFF]">
          <BookOpen
            className="h-[18px] w-[18px]"
            strokeWidth={2}
          />
        </div>

        <div>
          <h2 className="text-[15px] font-bold leading-5 tracking-[-0.025em] text-[#071747]">
            {isEditing
              ? "Editar curso"
              : "Crear nuevo curso"}
          </h2>

          <p className="mt-0.5 text-[11.5px] leading-4 tracking-[-0.015em] text-[#536184]">
            {isEditing
              ? "Modifica la información y configuración del curso."
              : "Define la información básica. Después podrás generar el contenido y las evaluaciones."}
          </p>
        </div>
      </div>
    </header>
  );
}