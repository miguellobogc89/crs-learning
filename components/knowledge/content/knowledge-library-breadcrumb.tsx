// components/knowledge/content/knowledge-library-breadcrumb.tsx

"use client";

import type { LibraryItem } from "@/components/knowledge/sidebar/types";
import { SectionBreadcrumb } from "@/components/app/section-breadcrumb";
import { APP_SECTIONS } from "@/lib/navigation/app-sections";

type Props = {
  path: LibraryItem[];
  includeKnowledgeRoot?: boolean;
};

export function KnowledgeLibraryBreadcrumb({
  path,
  includeKnowledgeRoot = false,
}: Props) {
  // El último elemento es la carpeta actual.
  // Ya se muestra como título debajo del breadcrumb.
  const parentPath = path.slice(0, -1);

  const showKnowledgeRoot =
    includeKnowledgeRoot ||
    path.length === 0;

  const items = [
    ...(showKnowledgeRoot
      ? [
          {
            label: "Mi biblioteca",
            href: "/knowledge",
          },
        ]
      : []),

    ...parentPath.map((library) => ({
      label: library.name,
      href: `/knowledge?library=${encodeURIComponent(
        library.id,
      )}`,
    })),
  ];

  return (
    <SectionBreadcrumb
      section={{
        label:
          APP_SECTIONS.knowledge.label,
        href:
          APP_SECTIONS.knowledge.href,
        icon:
          APP_SECTIONS.knowledge.icon,
      }}
      items={items}
    />
  );
}