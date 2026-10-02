// components/academy/create-course/create-course-header.tsx

export function CreateCourseHeader() {
  return (
    <header className="shrink-0 border-b border-[#EEF1F6] bg-white px-8 pb-4 pt-5">
      <h2 className="text-[25px] font-bold leading-[1.1] tracking-[-0.045em] text-[#071747]">
        Crear nuevo curso
      </h2>

      <p className="mt-0.5 text-[12.5px] font-normal leading-[1.35] tracking-[-0.025em] text-[#314270]">
        Define la información del curso. La IA te ayudará a generar la
        estructura y las evaluaciones.
      </p>
    </header>
  );
}