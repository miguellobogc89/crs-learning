// components/academy/right-panel-management/course-management-header.tsx

"use client";

type CourseManagementHeaderProps = {
  mode: "create" | "edit";
};

export function CourseManagementHeader({
  mode,
}: CourseManagementHeaderProps) {
  const isEditing = mode === "edit";

  return (
    <header className="shrink-0 border-b border-slate-100 bg-white px-7 pb-4 pt-5">
      <h2 className="text-[26px] font-extrabold leading-[30px] tracking-[-0.045em] text-[#07113D]">
        {isEditing
          ? "Editar curso"
          : "Crear nuevo curso"}
      </h2>

      <p className="mt-0.5 text-[14px] font-medium leading-[17px] tracking-[-0.025em] text-[#35446F]">
        {isEditing
          ? "Modifica la información del curso y su configuración."
          : "Define la información del curso. La IA te ayudará a generar la estructura y las evaluaciones."}
      </p>
    </header>
  );
}