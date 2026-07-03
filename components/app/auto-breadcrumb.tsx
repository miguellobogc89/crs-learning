// components/app/auto-breadcrumb.tsx
"use client";

import { usePathname } from "next/navigation";

import { AppBreadcrumb } from "@/components/ui/app-breadcrumb";
import { APP_SECTIONS } from "@/lib/navigation/app-sections";

export function AutoBreadcrumb() {
  const pathname = usePathname();

  if (pathname === "/dashboard") {
    return null;
  }

  if (pathname.startsWith("/knowledge")) {
    const isDetail = pathname !== "/knowledge" && pathname !== "/knowledge/new";

    return (
      <AppBreadcrumb
        items={[
          {
            label: APP_SECTIONS.knowledge.label,
            href: APP_SECTIONS.knowledge.href,
            icon: APP_SECTIONS.knowledge.icon,
          },
          ...(pathname === "/knowledge/new"
            ? [{ label: "Nuevo Knowledge" }]
            : isDetail
              ? [{ label: "Detalle" }]
              : []),
        ]}
      />
    );
  }

  if (pathname.startsWith("/courses")) {
    const isDetail = pathname !== "/courses" && pathname !== "/courses/new";

    return (
      <AppBreadcrumb
        items={[
          {
            label: APP_SECTIONS.courses.label,
            href: APP_SECTIONS.courses.href,
            icon: APP_SECTIONS.courses.icon,
          },
          ...(pathname === "/courses/new"
            ? [{ label: "Nuevo curso" }]
            : isDetail
              ? [{ label: "Detalle" }]
              : []),
        ]}
      />
    );
  }

  const section = Object.values(APP_SECTIONS).find((item) =>
    pathname.startsWith(item.href)
  );

  if (!section) {
    return null;
  }

  return (
    <AppBreadcrumb
      items={[
        {
          label: section.label,
          href: section.href,
          icon: section.icon,
        },
      ]}
    />
  );
}