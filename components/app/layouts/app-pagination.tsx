// components/app/layouts/app-pagination.tsx

"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";

type AppPaginationProps = {
  page: number;
  totalPages: number;
  totalItems: number;
  pageSize: number;
  onPageChange: (page: number) => void;
};

export function AppPagination({
  page,
  totalPages,
  totalItems,
  pageSize,
  onPageChange,
}: AppPaginationProps) {
  const firstItem = totalItems === 0 ? 0 : (page - 1) * pageSize + 1;
  const lastItem = Math.min(page * pageSize, totalItems);

  return (
    <div className="flex flex-wrap items-center justify-between gap-4 border-t border-slate-100 px-6 py-4">
      <p className="text-xs text-slate-500">
        Mostrando {firstItem}–{lastItem} de {totalItems} elementos
      </p>

      {totalPages > 1 ? (
        <nav
          aria-label="Paginación"
          className="flex items-center gap-1"
        >
          <button
            type="button"
            aria-label="Página anterior"
            disabled={page === 1}
            onClick={() => onPageChange(page - 1)}
            className="flex h-9 w-9 items-center justify-center rounded-xl text-slate-500 transition-colors hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-30"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>

          {Array.from(
            { length: totalPages },
            (_, index) => index + 1,
          )
            .filter(
              (pageNumber) =>
                pageNumber === 1 ||
                pageNumber === totalPages ||
                Math.abs(pageNumber - page) <= 1,
            )
            .map((pageNumber, index, visiblePages) => (
              <div
                key={pageNumber}
                className="flex items-center gap-1"
              >
                {index > 0 &&
                pageNumber - visiblePages[index - 1] > 1 ? (
                  <span className="px-1 text-xs text-slate-400">
                    …
                  </span>
                ) : null}

                <button
                  type="button"
                  aria-label={`Página ${pageNumber}`}
                  aria-current={
                    pageNumber === page ? "page" : undefined
                  }
                  onClick={() => onPageChange(pageNumber)}
                  className={[
                    "flex h-9 min-w-9 items-center justify-center rounded-xl px-2 text-xs font-medium transition-colors",
                    pageNumber === page
                      ? "bg-blue-50 text-blue-600"
                      : "text-slate-500 hover:bg-slate-50",
                  ].join(" ")}
                >
                  {pageNumber}
                </button>
              </div>
            ))}

          <button
            type="button"
            aria-label="Página siguiente"
            disabled={page === totalPages}
            onClick={() => onPageChange(page + 1)}
            className="flex h-9 w-9 items-center justify-center rounded-xl text-slate-500 transition-colors hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-30"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </nav>
      ) : null}
    </div>
  );
}