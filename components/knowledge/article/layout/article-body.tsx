
// components/knowledge/article/layout/article-body.tsx

import type { ReactNode } from "react";

type ArticleBodyProps = {
  children: ReactNode;
  className?: string;
};

export function ArticleBody({
  children,
  className = "",
}: ArticleBodyProps) {
  return (
    <div
      className={[
        // Contenedor único del artículo.
        "article-body min-w-0 rounded-xl border border-border bg-white",
        "px-6 py-8 md:px-8 md:py-10",

        // Tipografía general.
        "text-sm leading-7 text-slate-900",

        // Secciones.
        "[&_section+section]:mt-10",

        // Títulos.
        "[&_h2]:mb-4 [&_h2]:text-2xl",
        "[&_h2]:font-semibold [&_h2]:tracking-tight",
        "[&_h2]:leading-tight [&_h2]:text-slate-950",

        "[&_h3]:mb-3 [&_h3]:text-lg",
        "[&_h3]:font-semibold [&_h3]:leading-snug",
        "[&_h3]:text-slate-900",

        // Párrafos.
        "[&_p]:text-sm [&_p]:leading-7",
        "[&_p]:text-slate-800",
        "[&_p+p]:mt-3",

        // Listas.
        "[&_ul]:my-4 [&_ul]:list-disc [&_ul]:pl-6",
        "[&_ol]:my-4 [&_ol]:list-decimal [&_ol]:pl-6",
        "[&_li]:my-2 [&_li]:pl-1",
        "[&_li]:text-sm [&_li]:leading-7",
        "[&_li]:text-slate-800",

        // Iconos.
        "[&_svg]:h-5 [&_svg]:w-5",
        "[&_svg]:shrink-0 [&_svg]:text-blue-600",

        // Botones de los estados vacíos.
        "[&_button]:inline-flex",
        "[&_button]:items-center [&_button]:gap-2",
        "[&_button]:rounded-lg [&_button]:bg-blue-600",
        "[&_button]:px-4 [&_button]:py-2",
        "[&_button]:text-sm [&_button]:font-medium",
        "[&_button]:text-white",
        "[&_button:hover]:bg-blue-700",
        "[&_button:disabled]:opacity-50",
        "[&_button_svg]:text-white",

        // Tablas.
        "[&_table]:w-full [&_table]:text-sm",
        "[&_th]:text-left [&_th]:font-semibold",
        "[&_td]:align-top",

        className,
      ].join(" ")}
    >
      {children}
    </div>
  );
}