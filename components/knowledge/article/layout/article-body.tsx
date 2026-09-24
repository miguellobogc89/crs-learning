
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
        "min-w-0 rounded-xl border border-border bg-background",
        "px-6 py-8 md:px-8 md:py-10",
        "text-sm leading-7 text-foreground",

        // Títulos: mismo formato en todas las pestañas.
        "[&_h1]:mb-5 [&_h1]:text-2xl [&_h1]:font-semibold [&_h1]:leading-tight [&_h1]:text-foreground",
        "[&_h2]:mb-4 [&_h2]:text-2xl [&_h2]:font-semibold [&_h2]:leading-tight [&_h2]:text-foreground",
        "[&_h3]:mb-3 [&_h3]:text-lg [&_h3]:font-semibold [&_h3]:leading-snug [&_h3]:text-foreground",

        // Texto y listas.
        "[&_p]:text-sm [&_p]:leading-7",
        "[&_li]:text-sm [&_li]:leading-7",
        "[&_ul]:list-disc [&_ul]:pl-6",
        "[&_ol]:list-decimal [&_ol]:pl-6",

        // Elementos multimedia.
        "[&_img]:max-w-full [&_img]:rounded-lg",
        "[&_table]:w-full [&_table]:text-sm",

        className,
      ].join(" ")}
    >
      {children}
    </div>
  );
}