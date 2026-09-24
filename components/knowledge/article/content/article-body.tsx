
// components/knowledge/article/content/article-body.tsx

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
        // CONTENEDOR ÚNICO
        // Fondo blanco solo para el área de contenido.
        // El exterior conserva el fondo de la página.
        "min-w-0 w-full rounded-2xl border border-slate-200",
        "bg-white px-6 py-8 md:px-8 md:py-10",
        "text-[14px] leading-7 text-slate-700",
        "shadow-[0_1px_2px_rgba(15,23,42,0.025)]",

        // ESTRUCTURA GENERAL
        // Las secciones son transparentes: no generan
        // tarjetas, fondos ni bordes adicionales.
        "[&_section]:min-w-0",
        "[&_section]:bg-transparent",
        "[&_section]:border-0",
        "[&_section]:p-0",

        // Separación entre bloques principales.
        // Se aplica al contenido directo de la vista,
        // sin acumular márgenes en secciones anidadas.
        "[&>section>section+section]:mt-10",
        "[&>section>div+section]:mt-10",
        "[&>section>section+div]:mt-10",

        // TÍTULOS
        // H1: título principal, si una vista lo utiliza.
        "[&_h1]:m-0",
        "[&_h1]:text-[26px] [&_h1]:font-semibold",
        "[&_h1]:leading-tight [&_h1]:tracking-[-0.025em]",
        "[&_h1]:text-slate-950",
        "[&_h1]:mb-6",

        // H2: título de cada sección.
        // Más compacto que antes, pero con jerarquía clara.
        "[&_h2]:m-0",
        "[&_h2]:text-[20px] [&_h2]:font-semibold",
        "[&_h2]:leading-7 [&_h2]:tracking-[-0.02em]",
        "[&_h2]:text-slate-900",
        "[&_h2]:mb-4",

        // H3: subsecciones, documentos y procedimientos.
        "[&_h3]:m-0",
        "[&_h3]:text-[16px] [&_h3]:font-semibold",
        "[&_h3]:leading-6 [&_h3]:tracking-[-0.01em]",
        "[&_h3]:text-slate-900",
        "[&_h3]:mb-3",

        // H4: pasos y títulos de menor nivel.
        "[&_h4]:m-0",
        "[&_h4]:text-[14px] [&_h4]:font-semibold",
        "[&_h4]:leading-6 [&_h4]:text-slate-900",
        "[&_h4]:mb-2",

        // Espacio antes de un título cuando viene
        // después de otro contenido dentro de la sección.
        "[&_p+h2]:mt-9",
        "[&_ul+h2]:mt-9",
        "[&_ol+h2]:mt-9",
        "[&_dl+h2]:mt-9",
        "[&_table+h2]:mt-9",
        "[&_p+h3]:mt-6",
        "[&_ul+h3]:mt-6",
        "[&_ol+h3]:mt-6",

        // PÁRRAFOS
        "[&_p]:m-0",
        "[&_p]:text-[14px] [&_p]:leading-7",
        "[&_p]:text-slate-700",
        "[&_p+p]:mt-3",
        "[&_p+ul]:mt-3",
        "[&_p+ol]:mt-3",

        // Énfasis.
        "[&_strong]:font-semibold",
        "[&_strong]:text-slate-900",

        // LISTAS
        "[&_ul]:my-0 [&_ul]:list-disc [&_ul]:pl-6",
        "[&_ol]:my-0 [&_ol]:list-decimal [&_ol]:pl-6",
        "[&_li]:pl-1",
        "[&_li]:text-[14px] [&_li]:leading-7",
        "[&_li]:text-slate-700",
        "[&_li+li]:mt-1.5",
        "[&_li>h4]:mt-0",
        "[&_li>p]:mt-1",
        "[&_li>p+p]:mt-2",

        // DEFINICIONES Y METADATOS
        // Se muestran como pares etiqueta / valor,
        // evitando el aspecto de texto plano de Detalles.
        "[&_dl]:my-0",
        "[&_dl]:grid [&_dl]:grid-cols-1",
        "[&_dl]:gap-x-8 [&_dl]:gap-y-4",
        "sm:[&_dl]:grid-cols-2",

        "[&_dl>div]:min-w-0",
        "[&_dt]:m-0",
        "[&_dt]:text-[12px] [&_dt]:font-medium",
        "[&_dt]:leading-5 [&_dt]:text-slate-500",
        "[&_dd]:m-0",
        "[&_dd]:mt-1",
        "[&_dd]:break-words",
        "[&_dd]:text-[14px] [&_dd]:font-medium",
        "[&_dd]:leading-6 [&_dd]:text-slate-900",

        // Compatibilidad con listas de definiciones
        // que contienen dt y dd directamente, sin div.
        "[&_dl>dt]:self-end",
        "[&_dl>dt+dd]:mt-0",

        // TABLAS
        "[&_table]:my-0",
        "[&_table]:w-full [&_table]:border-collapse",
        "[&_table]:text-left [&_table]:text-[13px]",
        "[&_table]:leading-6",
        "[&_table]:text-slate-700",
        "[&_th]:border-b [&_th]:border-slate-200",
        "[&_th]:bg-slate-50",
        "[&_th]:px-4 [&_th]:py-3",
        "[&_th]:text-[12px] [&_th]:font-semibold",
        "[&_th]:text-slate-600",
        "[&_td]:border-b [&_td]:border-slate-100",
        "[&_td]:px-4 [&_td]:py-3",
        "[&_td]:align-top",
        "[&_tbody>tr:last-child>td]:border-b-0",

        // DOCUMENTOS DESPLEGABLES
        // Una fila por documento. Sin tarjetas internas:
        // solo separadores sutiles y fondo transparente.
        "[&_details]:border-0",
        "[&_details]:border-b [&_details]:border-slate-100",
        "[&_details]:bg-transparent",
        "[&_details:last-child]:border-b-0",

        "[&_summary]:cursor-pointer",
        "[&_summary]:py-4",
        "[&_summary]:text-[14px] [&_summary]:leading-6",
        "[&_summary]:text-slate-700",
        "[&_summary]:transition-colors",
        "hover:[&_summary]:text-slate-950",
        "[&_summary]:marker:text-slate-400",
        "[&_summary_strong]:font-semibold",
        "[&_summary_strong]:text-slate-900",

        // Contenido abierto del documento.
        "[&_details>section]:pb-5",
        "[&_details>section+section]:pt-5",
        "[&_details>section+section]:border-t",
        "[&_details>section+section]:border-slate-100",
        "[&_details>section>h3]:mb-3",

        // Espacio entre la introducción de Documentos
        // y la primera fila desplegable.
        "[&_section>p+details]:mt-5",

        // BOTONES DE ESTADOS VACÍOS
        "[&_button]:cursor-pointer",
        "[&_button]:rounded-lg",
        "[&_button]:border [&_button]:border-slate-200",
        "[&_button]:bg-white",
        "[&_button]:px-4 [&_button]:py-2",
        "[&_button]:text-[13px] [&_button]:font-medium",
        "[&_button]:text-slate-900",
        "[&_button]:transition-colors",
        "hover:[&_button]:bg-slate-50",
        "[&_button:disabled]:cursor-not-allowed",
        "[&_button:disabled]:opacity-50",
        "[&_p+button]:mt-5",

        // ERRORES Y ELEMENTOS MULTIMEDIA
        "[&_[role=alert]]:text-red-600",
        "[&_img]:max-w-full",
        "[&_img]:rounded-lg",

        className,
      ].join(" ")}
    >
      {children}
    </div>
  );
}