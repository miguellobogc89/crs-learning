// components/knowledge/sidebar/types.ts
export type SidebarIcon =
  | "book"
  | "file"
  | "shield"
  | "globe"
  | "star"
  | "clock"
  | "users"
  | "activity";

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
  is_shared?: boolean;
  is_team_shared?: boolean;
  children?: LibraryItem[];
};