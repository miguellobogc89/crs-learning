// components/app/layouts/app-page-header.tsx

import type { ReactNode } from "react";

import {
  SectionBreadcrumb,
  type SectionBreadcrumbItem,
} from "@/components/app/section-breadcrumb";

type AppPageHeaderProps = {
  section: Parameters<
    typeof SectionBreadcrumb
  >[0]["section"];
  title: string;
  items?: SectionBreadcrumbItem[];
  actions?: ReactNode;
};

export function AppPageHeader({
  section,
  title,
  items = [],
  actions,
}: AppPageHeaderProps) {
  return (
    <div className="flex min-w-0 items-center justify-between gap-6">
      <div className="min-w-0 flex-1">
        <SectionBreadcrumb
          section={section}
          items={items}
        />

<h1 className="mt-3 min-w-0 truncate text-[26px] font-semibold leading-[1.2] tracking-tight text-slate-950">
  {title}
</h1>
      </div>

      {actions ? (
        <div className="flex shrink-0 items-center">
          {actions}
        </div>
      ) : null}
    </div>
  );
}