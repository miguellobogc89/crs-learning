// components/ui/data-table.tsx

"use client";

import type {
  KeyboardEvent,
  ReactNode,
} from "react";

export type DataTableColumn<T> = {
  id: string;
  header: ReactNode;
  render: (row: T) => ReactNode;

  align?: "left" | "center" | "right";

  className?: string;
  headerClassName?: string;

  hideBelow?: "sm" | "md" | "lg" | "xl" | "2xl";
};

type DataTableProps<T> = {
  rows: T[];
  columns: DataTableColumn<T>[];

  getRowId: (row: T) => string;

  emptyMessage?: string;

  onRowClick?: (row: T) => void;

  rowClassName?: string;
};

function getAlignmentClass(
  align: DataTableColumn<unknown>["align"],
) {
  if (align === "left") {
    return "text-left";
  }

  if (align === "right") {
    return "text-right";
  }

  return "text-center";
}

function getResponsiveVisibilityClass(
  breakpoint: DataTableColumn<unknown>["hideBelow"],
) {
  if (breakpoint === "sm") {
    return "hidden sm:table-cell";
  }

  if (breakpoint === "md") {
    return "hidden md:table-cell";
  }

  if (breakpoint === "lg") {
    return "hidden lg:table-cell";
  }

  if (breakpoint === "xl") {
    return "hidden xl:table-cell";
  }

  if (breakpoint === "2xl") {
    return "hidden 2xl:table-cell";
  }

  return "";
}

export function DataTable<T>({
  rows,
  columns,
  getRowId,
  emptyMessage = "No hay datos disponibles.",
  onRowClick,
  rowClassName = "",
}: DataTableProps<T>) {
  function handleRowKeyDown(
    event: KeyboardEvent<HTMLTableRowElement>,
    row: T,
  ) {
    if (!onRowClick) {
      return;
    }

    if (event.key !== "Enter") {
      return;
    }

    onRowClick(row);
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table
        className="
          w-full
          text-[10px]
          sm:text-[11px]
          md:text-xs
          lg:text-[13px]
          xl:text-sm
          2xl:text-[15px]
        "
      >
        <thead>
          <tr className="border-b border-border bg-surface">
            {columns.map((column) => {
              const alignment =
                getAlignmentClass(column.align);

              const visibility =
                getResponsiveVisibilityClass(
                  column.hideBelow,
                );

              return (
                <th
                  key={column.id}
                  className={[
                    "px-2 py-2 font-semibold text-foreground",
                    "sm:px-2.5",
                    "md:px-3 md:py-2.5",
                    "lg:px-3.5",
                    "xl:px-4 xl:py-3",
                    "2xl:px-5",
                    alignment,
                    visibility,
                    column.headerClassName ?? "",
                  ].join(" ")}
                >
                  {column.header}
                </th>
              );
            })}
          </tr>
        </thead>

        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td
                colSpan={columns.length}
                className="px-4 py-8 text-center text-muted-foreground"
              >
                {emptyMessage}
              </td>
            </tr>
          ) : (
            rows.map((row) => {
              const isClickable = Boolean(onRowClick);

              return (
                <tr
                  key={getRowId(row)}
                  tabIndex={isClickable ? 0 : undefined}
                  role={isClickable ? "button" : undefined}
                  onClick={() => {
                    if (!onRowClick) {
                      return;
                    }

                    onRowClick(row);
                  }}
                  onKeyDown={(event) => {
                    handleRowKeyDown(event, row);
                  }}
                  className={[
                    "border-b border-border",
                    "transition-colors duration-150",
                    isClickable
                      ? "cursor-pointer hover:bg-surface/60 focus:bg-surface/60 focus:outline-none"
                      : "",
                    rowClassName,
                  ].join(" ")}
                >
                  {columns.map((column) => {
                    const alignment =
                      getAlignmentClass(
                        column.align,
                      );

                    const visibility =
                      getResponsiveVisibilityClass(
                        column.hideBelow,
                      );

                    return (
                      <td
                        key={column.id}
                        className={[
                          "px-2 py-2",
                          "sm:px-2.5",
                          "md:px-3 md:py-2.5",
                          "lg:px-3.5",
                          "xl:px-4 xl:py-3",
                          "2xl:px-5",
                          alignment,
                          visibility,
                          column.className ?? "",
                        ].join(" ")}
                      >
                        {column.render(row)}
                      </td>
                    );
                  })}
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );
}