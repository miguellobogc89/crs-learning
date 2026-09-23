
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
        "group flex w-full cursor-pointer items-center justify-between",
        "rounded-lg px-3 py-2 text-sm",
        "transition-colors duration-200",
        item.active
          ? "bg-[#EDF3FF] font-medium text-[#0A58FF]"
          : "font-medium text-slate-600 hover:bg-[#F0F4FC] hover:text-slate-900",
      ].join(" ")}
      type="button"
      onClick={onSelect}
    >
      <span className="flex min-w-0 items-center gap-2.5">
        <Icon
          className={[
            "h-[18px] w-[18px] shrink-0",
            item.active
              ? "text-[#0A58FF]"
              : "text-slate-500 transition-colors group-hover:text-[#0A58FF]",
          ].join(" ")}
          strokeWidth={2.4}
        />

        <span className="truncate">{item.label}</span>
      </span>

      <span
        className={[
          "ml-2 shrink-0 text-xs tabular-nums",
          item.active ? "text-[#0A58FF]" : "text-slate-400",
        ].join(" ")}
      >
        {item.count}
      </span>
    </button>
  );
}