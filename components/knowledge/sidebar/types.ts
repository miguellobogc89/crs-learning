// components/knowledge/sidebar/types.ts
export type SidebarIcon = "book" | "file" | "shield" | "globe";

export type SidebarItem = {
  label: string;
  count: number;
  icon: SidebarIcon;
  active: boolean;
};

export type LibraryItem = {
  id: string;
  name: string;
  isEditing?: boolean;
  isExpanded?: boolean;
  children?: LibraryItem[];
};