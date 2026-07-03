// components/ui/app-breadcrumb.tsx
import Link from "next/link";
import { ChevronRight, type LucideIcon } from "lucide-react";

type BreadcrumbItem = {
  label: string;
  href?: string;
  icon?: LucideIcon;
};

type Props = {
  items: BreadcrumbItem[];
};

export function AppBreadcrumb({ items }: Props) {
  return (
    <nav className="mb-6 flex items-center gap-1 text-sm text-muted-foreground">
      {items.map((item, index) => {
        const Icon = item.icon;
        const isLast = index === items.length - 1;

        return (
          <div key={`${item.label}-${index}`} className="flex min-w-0 items-center gap-1">
            {index > 0 && (
              <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground/60" />
            )}

            {item.href && !isLast ? (
              <Link
                href={item.href}
                className="flex min-w-0 items-center gap-1.5 hover:text-foreground"
              >
                {Icon && <Icon className="h-4 w-4 shrink-0" />}
                <span className="truncate">{item.label}</span>
              </Link>
            ) : (
              <span className="flex min-w-0 items-center gap-1.5 font-medium text-foreground">
                {Icon && <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />}
                <span className="truncate">{item.label}</span>
              </span>
            )}
          </div>
        );
      })}
    </nav>
  );
}