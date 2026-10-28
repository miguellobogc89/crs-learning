"use client";

import * as React from "react";
import { Popover as PopoverPrimitive } from "radix-ui";
import { CheckIcon, ChevronDownIcon, SearchIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * The app's dropdown: a styled trigger and a floating list (same look as the menus), with an optional search box
 * on top. Long lists show the first matches and ask to type to narrow them, so the list stays short.
 */
export type ComboOption = { value: string; label: string; hint?: string | null };
export type ComboAction = { label: string; onSelect: () => void; icon?: React.ReactNode };

const normalize = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

export function Combobox({
  value, options, onChange, placeholder = "Seleccionar…", searchable = false, searchPlaceholder = "Buscar…", emptyText = "Sin resultados",
  limit = 50, actions = [], disabled = false, variant = "outline", className, contentClassName, ariaLabel, align = "start", renderValue,
}: {
  value: string | null; options: ComboOption[]; onChange: (value: string) => void;
  placeholder?: string; searchable?: boolean; searchPlaceholder?: string; emptyText?: string; limit?: number;
  /** Extra entries at the end of the list (e.g. "+ Nueva empresa…"). */
  actions?: ComboAction[];
  disabled?: boolean; variant?: "outline" | "ghost"; className?: string; contentClassName?: string; ariaLabel?: string;
  align?: "start" | "center" | "end"; renderValue?: (option: ComboOption | undefined) => React.ReactNode;
}) {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const [active, setActive] = React.useState(0);
  const listRef = React.useRef<HTMLDivElement>(null);
  const selected = options.find(o => o.value === value);

  const matches = React.useMemo(() => {
    const q = normalize(query.trim());
    return q ? options.filter(o => normalize(`${o.label} ${o.hint ?? ""}`).includes(q)) : options;
  }, [options, query]);
  const shown = matches.slice(0, limit);
  const entries = shown.length + actions.length;

  React.useEffect(() => { if (open) { setQuery(""); setActive(Math.max(0, shown.findIndex(o => o.value === value))); } }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  React.useEffect(() => { listRef.current?.querySelector(`[data-index="${active}"]`)?.scrollIntoView({ block: "nearest" }); }, [active]);

  function choose(index: number) {
    if (index < shown.length) onChange(shown[index].value);
    else actions[index - shown.length]?.onSelect();
    setOpen(false);
  }
  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") { e.preventDefault(); setActive(a => Math.min(entries - 1, a + 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive(a => Math.max(0, a - 1)); }
    else if (e.key === "Enter" && entries) { e.preventDefault(); choose(active); }
  }

  return <PopoverPrimitive.Root open={open} onOpenChange={setOpen}>
    <PopoverPrimitive.Trigger asChild disabled={disabled}>
      <button type="button" aria-label={ariaLabel} title={selected?.label}
        className={cn("inline-flex h-8 min-w-0 items-center justify-between gap-1.5 rounded-lg px-2.5 text-left text-sm outline-none transition-colors focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50",
          variant === "outline" ? "border border-slate-200 bg-white hover:border-slate-300" : "border border-transparent bg-transparent hover:border-slate-200 hover:bg-white data-[state=open]:border-slate-300 data-[state=open]:bg-white",
          className)}>
        <span className={cn("min-w-0 truncate", !selected && "text-slate-400")}>{renderValue ? renderValue(selected) : selected?.label ?? placeholder}</span>
        <ChevronDownIcon className="size-3.5 shrink-0 text-slate-400" />
      </button>
    </PopoverPrimitive.Trigger>
    <PopoverPrimitive.Portal>
      <PopoverPrimitive.Content align={align} sideOffset={4} onKeyDown={onKeyDown}
        onOpenAutoFocus={e => { if (!searchable) { e.preventDefault(); listRef.current?.focus(); } }}
        className={cn("z-50 w-(--radix-popover-trigger-width) min-w-60 max-w-[min(420px,calc(100vw-32px))] overflow-hidden rounded-lg bg-popover p-1 text-popover-foreground shadow-md ring-1 ring-foreground/10 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95", contentClassName)}>
        {searchable && <div className="relative mb-1 border-b border-slate-100 pb-1">
          <SearchIcon className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-slate-400" />
          <input autoFocus value={query} onChange={e => { setQuery(e.target.value); setActive(0); }} placeholder={searchPlaceholder}
            className="h-8 w-full rounded-md bg-transparent pl-7 pr-2 text-sm outline-none placeholder:text-slate-400" />
        </div>}
        <div ref={listRef} tabIndex={-1} role="listbox" className="max-h-64 overflow-y-auto outline-none">
          {shown.map((o, i) => <div key={o.value} data-index={i} role="option" aria-selected={o.value === value}
            onMouseEnter={() => setActive(i)} onClick={() => choose(i)}
            className={cn("flex cursor-default select-none items-center gap-2 rounded-md px-2 py-1.5 text-sm", i === active && "bg-accent text-accent-foreground")}>
            <span className="min-w-0 flex-1 truncate">{o.label}{o.hint && <span className="ml-1.5 text-xs text-slate-400">{o.hint}</span>}</span>
            {o.value === value && <CheckIcon className="size-3.5 shrink-0 text-[#0A58FF]" />}
          </div>)}
          {!shown.length && <p className="px-2 py-3 text-center text-xs text-slate-500">{emptyText}</p>}
          {matches.length > shown.length && <p className="px-2 py-1.5 text-[11px] text-slate-400">Se muestran {shown.length} de {matches.length}: escribe para afinar.</p>}
        </div>
        {actions.length > 0 && <div className="mt-1 border-t border-slate-100 pt-1">
          {actions.map((a, j) => { const i = shown.length + j; return <div key={a.label} data-index={i} role="option" aria-selected={false}
            onMouseEnter={() => setActive(i)} onClick={() => choose(i)}
            className={cn("flex cursor-default select-none items-center gap-2 rounded-md px-2 py-1.5 text-sm font-medium text-[#0A58FF]", i === active && "bg-accent")}>{a.icon}{a.label}</div>; })}
        </div>}
      </PopoverPrimitive.Content>
    </PopoverPrimitive.Portal>
  </PopoverPrimitive.Root>;
}
