// components/dashboard/dashboard-knowledge-table.tsx

import Link from "next/link";
import {
  FileText,
  Filter,
  Grid2X2,
  List,
  MoreVertical,
  SlidersHorizontal,
} from "lucide-react";

import type { DashboardDocumentItem } from "@/lib/services/dashboard.service";

type Props = {
  documents: DashboardDocumentItem[];
  totalCount: number;
};

export function DashboardKnowledgeTable({
  documents,
  totalCount,
}: Props) {
  return (
    <section
      className="
        min-w-0 overflow-hidden
        rounded-2xl border border-white/70
        bg-white/90
        shadow-[0_8px_30px_rgba(31,64,120,0.035)]
      "
    >
      {/* Tabs */}
      <div className="border-b border-slate-100 px-5">
        <div className="flex h-[46px] items-end gap-7">
          <Tab label="Todo" active />
          <Tab label="Carpetas" />
          <Tab label="Documentos" />
          <Tab label="Etiquetas" />
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex min-h-[58px] items-center justify-between gap-4 border-b border-slate-100 px-5">
        <div className="flex items-center gap-2">
          <ToolbarButton>
            Todos los tipos
            <Chevron />
          </ToolbarButton>

          <ToolbarButton>
            Todas las carpetas
            <Chevron />
          </ToolbarButton>

          <ToolbarButton>
            <Filter className="h-3.5 w-3.5" />
            Filtros
          </ToolbarButton>
        </div>

        <div className="flex items-center gap-3">
          <div className="hidden overflow-hidden rounded-lg border border-slate-200 lg:flex">
            <button
              type="button"
              className="flex h-8 w-8 items-center justify-center bg-blue-50 text-[#0A58FF]"
              aria-label="Vista de lista"
            >
              <List className="h-3.5 w-3.5" />
            </button>

            <button
              type="button"
              className="flex h-8 w-8 items-center justify-center text-slate-400 transition hover:bg-slate-50"
              aria-label="Vista de cuadrícula"
            >
              <Grid2X2 className="h-3.5 w-3.5" />
            </button>
          </div>

          <ToolbarButton>
            Más recientes
            <Chevron />
          </ToolbarButton>
        </div>
      </div>

      {/* Tabla */}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] border-collapse">
<thead>
  <tr className="border-b border-slate-100">
    <TableHead className="w-[38%]">
      Nombre
    </TableHead>

    <TableHead align="center">
      Tipo
    </TableHead>

    <TableHead align="center">
      Fuente
    </TableHead>

    <TableHead align="center">
      Uso IA
    </TableHead>

    <TableHead align="center">
      Última modificación
    </TableHead>

    <TableHead className="w-10" />
  </tr>
</thead>

          <tbody>
            {documents.length > 0 ? (
              documents.map((document, index) => (
                <DocumentRow
                  key={document.id}
                  document={document}
                  index={index}
                />
              ))
            ) : (
              <tr>
                <td
                  colSpan={6}
                  className="px-5 py-16 text-center text-sm text-slate-500"
                >
                  Todavía no hay conocimiento en este espacio.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Footer */}
      <footer className="flex min-h-[52px] items-center justify-between border-t border-slate-100 px-5">
        <p className="text-[10px] text-slate-500">
          Mostrando 1–{documents.length} de{" "}
          {totalCount} resultados
        </p>

        <div className="flex items-center gap-1">
          <PaginationButton disabled>
            ‹
          </PaginationButton>

          <PaginationButton active>
            1
          </PaginationButton>

          {totalCount > documents.length ? (
            <>
              <PaginationButton>
                2
              </PaginationButton>

              <PaginationButton>
                3
              </PaginationButton>

              <span className="px-1 text-[10px] text-slate-400">
                …
              </span>
            </>
          ) : null}

          <PaginationButton
            disabled={
              totalCount <= documents.length
            }
          >
            ›
          </PaginationButton>
        </div>
      </footer>
    </section>
  );
}

function DocumentRow({
  document,
  index,
}: {
  document: DashboardDocumentItem;
  index: number;
}) {
  const tone = getDocumentTone(document.type);

  const usage = Math.max(document.fileCount, 0);

  return (
    <tr className="group border-b border-slate-100 last:border-b-0 transition-colors hover:bg-slate-50/60">
      {/* Nombre */}
      <td className="px-5 py-[11px]">
        <Link
          href={document.href}
          className="flex min-w-0 items-center gap-3"
        >
          <div
            className={[
              "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg",
              tone.icon,
            ].join(" ")}
          >
            <FileText className="h-4 w-4" />
          </div>

          <div className="min-w-0">
            <p className="max-w-[330px] truncate text-[12px] font-medium text-slate-900">
              {document.title}
            </p>

            <p className="mt-0.5 truncate text-[10px] text-slate-400">
              {document.libraryName}
            </p>
          </div>
        </Link>
      </td>

      {/* Tipo */}
      <td className="px-5 py-[11px] text-center">
        <span
          className={[
            "inline-flex rounded-md px-2 py-1",
            "text-[9px] font-medium uppercase",
            tone.badge,
          ].join(" ")}
        >
          {formatKnowledgeType(document.type)}
        </span>
      </td>

      {/* Fuente */}
      <td className="px-5 py-[11px]">
        <div className="flex items-center justify-center gap-2">
          <span
            className={[
              "h-1.5 w-1.5 shrink-0 rounded-full",
              getSourceDot(index),
            ].join(" ")}
          />

          <span className="max-w-[140px] truncate text-[11px] text-slate-600">
            {document.libraryName}
          </span>
        </div>
      </td>

      {/* Uso IA */}
      <td className="px-5 py-[11px]">
        <div className="flex items-center justify-center gap-3">
          <span className="w-6 text-center text-[11px] font-medium tabular-nums text-slate-700">
            {usage}
          </span>

          <UsageBars seed={index} />
        </div>
      </td>

      {/* Última modificación */}
      <td className="px-5 py-[11px] text-center">
        <p className="whitespace-nowrap text-[11px] font-medium text-slate-700">
          {formatDate(document.updatedAt)}
        </p>

        <p className="mt-0.5 truncate text-[10px] text-slate-400">
          {document.updatedBy}
        </p>
      </td>

      {/* Menú */}
      <td className="px-3 py-[11px] text-right">
        <button
          type="button"
          aria-label={`Opciones de ${document.title}`}
          className="
            inline-flex h-7 w-7
            items-center justify-center
            rounded-lg text-slate-400
            transition
            hover:bg-slate-100
            hover:text-slate-700
          "
        >
          <MoreVertical className="h-3.5 w-3.5" />
        </button>
      </td>
    </tr>
  );
}

function UsageBars({
  seed,
}: {
  seed: number;
}) {
  const patterns = [
    [5, 11, 17, 12, 20, 14],
    [7, 13, 9, 18, 15, 11],
    [4, 9, 15, 20, 13, 8],
    [8, 16, 12, 19, 10, 6],
  ];

  const values =
    patterns[
      seed % patterns.length
    ];

  return (
    <div
      className="flex h-5 items-end gap-[2px]"
      aria-hidden="true"
    >
      {values.map((height, index) => (
        <span
          key={index}
          className="w-[2px] rounded-full bg-[#0A58FF]"
          style={{
            height: `${height}px`,
            opacity:
              0.55 +
              index * 0.07,
          }}
        />
      ))}
    </div>
  );
}

function Tab({
  label,
  active = false,
}: {
  label: string;
  active?: boolean;
}) {
  return (
    <button
      type="button"
      className={[
        "relative h-full pt-4 text-[10px] font-medium transition-colors",
        active
          ? "text-[#0A58FF]"
          : "text-slate-500 hover:text-slate-800",
      ].join(" ")}
    >
      {label}

      {active ? (
        <span className="absolute inset-x-0 bottom-0 h-[2px] rounded-full bg-[#0A58FF]" />
      ) : null}
    </button>
  );
}

function ToolbarButton({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      className="
        inline-flex h-8 items-center
        gap-2 rounded-lg
        border border-slate-200
        bg-white px-3
        text-[9px] font-medium
        text-slate-600
        transition
        hover:bg-slate-50
      "
    >
      {children}
    </button>
  );
}

function Chevron() {
  return (
    <span className="ml-1 text-[10px] text-slate-400">
      ⌄
    </span>
  );
}

function TableHead({
  children,
  className = "",
  align = "left",
}: {
  children?: React.ReactNode;
  className?: string;
  align?: "left" | "center" | "right";
}) {
  return (
    <th
      className={[
        "px-5 py-3 text-[10px] font-medium text-slate-400",
        align === "center"
          ? "text-center"
          : align === "right"
            ? "text-right"
            : "text-left",
        className,
      ].join(" ")}
    >
      {children}
    </th>
  );
}

function PaginationButton({
  children,
  active = false,
  disabled = false,
}: {
  children: React.ReactNode;
  active?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      className={[
        "flex h-7 min-w-7 items-center justify-center rounded-lg px-2 text-[10px] transition-colors",
        active
          ? "bg-blue-50 font-medium text-[#0A58FF]"
          : "text-slate-500 hover:bg-slate-50",
        disabled
          ? "cursor-default opacity-30"
          : "",
      ].join(" ")}
    >
      {children}
    </button>
  );
}

function getDocumentTone(
  type: string,
) {
  const normalized =
    type.toLowerCase();

  if (
    normalized.includes("manual")
  ) {
    return {
      icon: "bg-emerald-50 text-emerald-600",
      badge:
        "bg-emerald-50 text-emerald-600",
    };
  }

  if (
    normalized.includes("reference")
  ) {
    return {
      icon: "bg-violet-50 text-violet-600",
      badge:
        "bg-violet-50 text-violet-600",
    };
  }

  if (
    normalized.includes("process") ||
    normalized.includes("procedure")
  ) {
    return {
      icon: "bg-blue-50 text-blue-600",
      badge:
        "bg-blue-50 text-blue-600",
    };
  }

  return {
    icon: "bg-slate-100 text-slate-500",
    badge:
      "bg-slate-100 text-slate-500",
  };
}

function getSourceDot(
  index: number,
) {
  const colors = [
    "bg-emerald-500",
    "bg-blue-500",
    "bg-violet-500",
    "bg-amber-500",
  ];

  return colors[
    index % colors.length
  ];
}

function formatKnowledgeType(
  type: string,
) {
  const labels: Record<
    string,
    string
  > = {
    procedure: "Proceso",
    process: "Proceso",
    reference: "Referencia",
    policy: "Política",
    manual: "Manual",
    guide: "Guía",
    faq: "FAQ",
    technical: "Técnico",
    functional: "Funcional",
    unknown: "Artículo",
  };

  return labels[type] ?? type;
}

function formatDate(
  date: Date,
) {
  return new Intl.DateTimeFormat(
    "es-ES",
    {
      day: "2-digit",
      month: "short",
      year: "numeric",
    },
  ).format(date);
}