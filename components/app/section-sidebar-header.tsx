// components/app/section-sidebar-header.tsx


"use client";

import { usePathname } from "next/navigation";
import {
  BookOpen,
  GraduationCap,
  LayoutDashboard,
  Settings2,
  Trophy,
  UserRound,
  type LucideIcon,
} from "lucide-react";

import { WorkspaceSelector } from "@/components/workspace/workspace-selector";
import type { AccessibleWorkspace } from "@/lib/repositories/workspace.repository";

type Props = {
  activeWorkspace: AccessibleWorkspace;
  workspaces: AccessibleWorkspace[];
};

type Section = {
  path: string;
  label: string;
  icon: LucideIcon;
};

const sections: Section[] = [
  {
    path: "/dashboard",
    label: "Inicio",
    icon: LayoutDashboard,
  },
  {
    path: "/knowledge",
    label: "Conocimiento",
    icon: BookOpen,
  },
  {
    path: "/courses",
    label: "Cursos",
    icon: GraduationCap,
  },
  {
    path: "/achievements",
    label: "Logros",
    icon: Trophy,
  },
  {
    path: "/my-space",
    label: "Mi espacio",
    icon: UserRound,
  },
  {
    path: "/settings",
    label: "Configuración",
    icon: Settings2,
  },
];

export function SectionSidebarHeader({
  activeWorkspace,
  workspaces,
}: Props) {
  const pathname = usePathname();

  const section =
    sections.find(
      (item) =>
        pathname === item.path ||
        pathname.startsWith(`${item.path}/`),
    ) ?? sections[0];

  const Icon = section.icon;

  return (
    <div className="shrink-0 border-b border-border px-4 pb-3 pt-5">
      <div className="flex min-w-0 items-center gap-2.5 px-2">
        <Icon
          className="h-[19px] w-[19px] shrink-0 text-brand"
          strokeWidth={2.1}
        />

        <h2 className="min-w-0 truncate text-[15px] font-semibold tracking-[-0.02em] text-foreground">
          {section.label}
        </h2>
      </div>

      <div className="mt-3 min-w-0">
        <WorkspaceSelector
          activeWorkspace={activeWorkspace}
          workspaces={workspaces}
          variant="sidebar"
        />
      </div>
    </div>
  );
}