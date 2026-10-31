// components/admin/admin-page.tsx

import type { ReactNode } from "react";

import { AppPageHeader } from "@/components/app/layouts/app-page-header";
import { APP_SECTIONS } from "@/lib/navigation/app-sections";

type AdminPageProps = {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  summary?: ReactNode;
  children: ReactNode;
};

export function AdminPage({
  title,
  subtitle,
  actions,
  summary,
  children,
}: AdminPageProps) {
  return (
    <div className="space-y-6">
      <AppPageHeader
        section={APP_SECTIONS.admin}
        title={title}
        description={subtitle}
        actions={actions}
      />

      {summary ? <div>{summary}</div> : null}

      {children}
    </div>
  );
}