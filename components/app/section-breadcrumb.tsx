// components/app/section-breadcrumb.tsx

import Link from "next/link";
import {
  ChevronRight,
  type LucideIcon,
} from "lucide-react";

export type SectionBreadcrumbItem = {
  label: string;
  href?: string;
};

type Props = {
  section: {
    label: string;
    href: string;
    icon: LucideIcon;
  };
  items?: SectionBreadcrumbItem[];
};

export function SectionBreadcrumb({
  section,
  items = [],
}: Props) {
  const Icon = section.icon;

  return (
    <nav
      aria-label="Breadcrumb"
      className="
        flex min-w-0 flex-wrap
        items-center gap-x-2 gap-y-1
        text-sm text-slate-500
      "
    >
      <Link
        href={section.href}
        className="
          inline-flex min-w-0
          items-center gap-2
          transition-colors
          hover:text-slate-900
        "
      >
        <Icon
          aria-hidden="true"
          className="
            h-4 w-4 shrink-0
            text-[#315BFF]
          "
        />

        <span className="truncate">
          {section.label}
        </span>
      </Link>

      {items.map((item, index) => {
        const isLast =
          index === items.length - 1;

        return (
          <div
            key={`${item.label}-${index}`}
            className="
              inline-flex min-w-0
              items-center gap-2
            "
          >
            <ChevronRight
              aria-hidden="true"
              className="
                h-3.5 w-3.5 shrink-0
                text-slate-400
              "
            />

            {item.href && !isLast ? (
              <Link
                href={item.href}
                className="
                  truncate
                  transition-colors
                  hover:text-slate-900
                "
              >
                {item.label}
              </Link>
            ) : (
              <span
                className="
                  truncate
                  text-slate-600
                "
              >
                {item.label}
              </span>
            )}
          </div>
        );
      })}
    </nav>
  );
}