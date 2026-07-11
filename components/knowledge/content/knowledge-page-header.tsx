// components/knowledge/content/knowledge-page-header.tsx
import type { ReactNode } from "react";

type Props = {
  breadcrumb?: ReactNode;
  children: ReactNode;
  tabs?: ReactNode;
};

export function KnowledgePageHeader({
  breadcrumb,
  children,
  tabs,
}: Props) {
  return (
    <header className="shrink-0 bg-background">
      <div className="mx-auto max-w-7xl border-b border-border px-6 pt-6 lg:px-8">
        {breadcrumb ? (
          <div className="mb-5">{breadcrumb}</div>
        ) : null}

        {children}

        {tabs ? <div className="mt-5">{tabs}</div> : null}
      </div>
    </header>
  );
}