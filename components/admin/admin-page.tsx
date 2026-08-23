// components/admin/admin-page.tsx

import type { ReactNode } from "react";

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
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-3xl font-bold tracking-tight text-foreground">
            {title}
          </h1>

          {subtitle ? (
            <p className="mt-2 text-muted-foreground">
              {subtitle}
            </p>
          ) : null}
        </div>

        {actions ? (
          <div className="shrink-0">
            {actions}
          </div>
        ) : null}
      </div>

      {summary ? <div>{summary}</div> : null}

      {children}
    </div>
  );
}