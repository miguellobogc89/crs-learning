// components/knowledge/article/layout/article-layout.tsx

import type { ReactNode } from "react";

type ArticleLayoutProps = {
  header: ReactNode;
  tabs: ReactNode;
  children: ReactNode;
};

export function ArticleLayout({
  header,
  tabs,
  children,
}: ArticleLayoutProps) {
  return (
    <div className="h-full min-h-0 overflow-hidden bg-transparent px-6 pb-6 lg:px-8">
      <div
        className="
          mx-auto flex h-full min-h-0 max-w-7xl flex-col
          overflow-hidden rounded-2xl border border-slate-200
          bg-white
          shadow-[0_1px_2px_rgba(15,23,42,0.025)]
        "
      >
        {/* Cabecera común del artículo */}
        <div className="shrink-0 px-6 pt-4 lg:px-8">
          {header}
          {tabs}
        </div>

        {/* Contenido de General / Detalles / Documentos */}
        <div className="min-h-0 flex-1 overflow-hidden">
          {children}
        </div>
      </div>
    </div>
  );
}