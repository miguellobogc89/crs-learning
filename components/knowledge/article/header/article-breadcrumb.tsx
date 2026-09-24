// components/knowledge/article/header/article-breadcrumb.tsx

import Link from "next/link";
import { ChevronRight } from "lucide-react";

type LibraryPathItem = {
  id: string;
  name: string;
};

type ArticleBreadcrumbProps = {
  libraryPath: LibraryPathItem[];
};

export function ArticleBreadcrumb({
  libraryPath,
}: ArticleBreadcrumbProps) {
  const folders = libraryPath.filter(
    (item, index) =>
      !(
        index === 0 &&
        item.name.trim().toLowerCase() === "mi biblioteca"
      ),
  );

  return (
    <nav
      aria-label="Ruta del artículo"
      className="flex min-w-0 items-center gap-2 text-sm text-muted-foreground"
    >
      <Link
        href="/knowledge"
        className="shrink-0 hover:text-foreground"
      >
        Mi biblioteca
      </Link>

      {folders.map((item) => (
        <div
          key={item.id}
          className="flex min-w-0 items-center gap-2"
        >
          <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground/50" />

          <Link
            href={`/knowledge?library=${item.id}`}
            className="truncate hover:text-foreground"
          >
            {item.name}
          </Link>
        </div>
      ))}
    </nav>
  );
}
