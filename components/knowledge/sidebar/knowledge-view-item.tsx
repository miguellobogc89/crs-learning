// components/knowledge/sidebar/knowledge-view-item.tsx
// components/knowledge/sidebar/knowledge-view-item.tsx
import type { SidebarItem } from "./types";
import { sidebarIcons } from "./sidebar-icons";

type Props = {
  item: SidebarItem;
  onSelect: () => void;
};

export function KnowledgeViewItem({ item, onSelect }: Props) {
  const Icon = sidebarIcons[item.icon];

  return (
    <button
      className={[
        "flex w-full cursor-pointer items-center justify-between rounded-lg px-3 py-2 text-sm transition-colors",
        item.active
          ? "bg-surface text-foreground"
          : "text-panel-foreground/70 hover:bg-surface-hover hover:text-foreground",
      ].join(" ")}
      type="button"
      onClick={onSelect}
    >
      <span className="flex items-center gap-2">
        <Icon className="h-4 w-4" />
        {item.label}
      </span>

      <span className="text-xs text-muted-foreground">{item.count}</span>
    </button>
  );
}