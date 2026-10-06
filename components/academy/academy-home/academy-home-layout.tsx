// components/academy-home/academy-home-layout.tsx

import type { ReactNode } from "react";

type AcademyHomeLayoutProps = {
  children: ReactNode;
};

export function AcademyHomeLayout({
  children,
}: AcademyHomeLayoutProps) {
  return (
    <section
      className="
        flex h-full min-h-0 w-full min-w-0 flex-col
        overflow-hidden
        rounded-xl border border-slate-200/80
        bg-[#F8FAFF]
      "
    >
      <header
        className="
          shrink-0 border-b border-slate-200/80
          bg-white px-5 py-4
          sm:px-6
        "
      >
        <h1 className="text-[24px] font-extrabold leading-tight tracking-[-0.04em] text-[#07113D]">
          Academy
        </h1>

        <p className="mt-1 text-[13px] text-[#66728F]">
          Tu espacio para aprender y seguir avanzando.
        </p>
      </header>

      <div
        className="
          grid min-h-0 min-w-0 flex-1
          grid-cols-1 gap-4
          overflow-hidden p-4
          lg:grid-cols-[minmax(0,1.9fr)_minmax(280px,1fr)]
          xl:gap-5 xl:p-5
        "
      >
        {children}
      </div>
    </section>
  );
}

type AcademyHomeColumnProps = {
  children: ReactNode;
  className?: string;
};

export function AcademyHomeColumn({
  children,
  className = "",
}: AcademyHomeColumnProps) {
  return (
    <div
      className={`
        flex min-h-0 min-w-0 flex-col gap-4
        overflow-hidden
        ${className}
      `}
    >
      {children}
    </div>
  );
}

type AcademyHomeSlotProps = {
  children?: ReactNode;
  className?: string;
};

export function AcademyHomeSlot({
  children,
  className = "",
}: AcademyHomeSlotProps) {
  return (
    <div
      className={`
        min-h-0 min-w-0
        rounded-xl border border-slate-200/80
        bg-white
        ${className}
      `}
    >
      {children}
    </div>
  );
}