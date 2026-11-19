"use client";

import * as React from "react";
import { Popover as PopoverPrimitive } from "radix-ui";
import { CheckIcon, ChevronDownIcon, SearchIcon, XIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Sheet, SheetClose, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";

/**
 * A shared selector: anchored popover on desktop, bottom sheet on mobile.
 * Long mobile lists expose search and can scroll without covering the entire app.
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
  const [mobile, setMobile] = React.useState(false);
  const listRef = React.useRef<HTMLDivElement>(null);
  const selected = options.find(o => o.value === value);
  const showSearch = searchable || (mobile && options.length >= 8);

  React.useEffect(() => {
    const mq = window.matchMedia("(max-width: 767px)");
    const update = () => setMobile(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

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
    if (e.target instanceof HTMLButtonElement) return;
    if (e.key === "ArrowDown") { e.preventDefault(); setActive(a => Math.min(entries - 1, a + 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive(a => Math.max(0, a - 1)); }
    else if (e.key === "Enter" && entries) { e.preventDefault(); choose(active); }
  }

  const trigger = <button type="button" disabled={disabled} aria-label={ariaLabel} title={selected?.label}
    className={cn("inline-flex h-8 max-md:h-11 min-w-0 items-center justify-between gap-1.5 rounded-lg px-2.5 text-left text-sm outline-none transition-colors focus:border-ring focus:ring-3 focus:ring-ring/20 focus:shadow-[0_0_18px_rgba(59,130,246,0.18)] focus:outline-none focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50",
      variant === "outline" ? "border border-slate-200 bg-white hover:border-slate-300" : "border border-transparent bg-transparent hover:border-slate-200 hover:bg-white data-[state=open]:border-slate-300 data-[state=open]:bg-white",
      className)}>
    <span className={cn("min-w-0 truncate", !selected && "text-slate-400")}>{renderValue ? renderValue(selected) : selected?.label ?? placeholder}</span>
    <ChevronDownIcon className="size-3.5 shrink-0 text-slate-400" />
  </button>;

  const list = <>
        {showSearch && <div className={cn("relative mb-1 border-b border-slate-100 pb-1", mobile && "mx-4 mb-2")}>
          <SearchIcon className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-slate-400" />
          <input autoFocus={!mobile} value={query} onChange={e => { setQuery(e.target.value); setActive(0); }} placeholder={searchPlaceholder}
            className={cn("h-8 w-full rounded-md bg-transparent pl-7 pr-2 text-sm outline-none placeholder:text-slate-400 focus:ring-3 focus:ring-ring/20 focus:shadow-[0_0_18px_rgba(59,130,246,0.18)] focus:outline-none", mobile && "h-11 text-base")} />
        </div>}
        <div ref={listRef} tabIndex={-1} role="listbox" aria-label={ariaLabel ?? placeholder}
          className={cn("max-h-64 overflow-y-auto outline-none", mobile && "min-h-0 max-h-none flex-1 overscroll-contain px-3")}>
          {shown.map((o, i) => <div key={o.value} data-index={i} role="option" aria-selected={o.value === value}
            onMouseEnter={() => setActive(i)} onClick={() => choose(i)}
            className={cn("flex cursor-pointer select-none items-center gap-2 rounded-md px-2 py-1.5 text-sm", mobile && "min-h-12 px-3 py-3 text-base", i === active && "bg-accent text-accent-foreground")}>
            <span className="min-w-0 flex-1 truncate">{o.label}{o.hint && <span className="ml-1.5 text-xs text-slate-400">{o.hint}</span>}</span>
            {o.value === value && <CheckIcon className="size-3.5 shrink-0 text-[#0A58FF]" />}
          </div>)}
          {!shown.length && <p className="px-2 py-3 text-center text-xs text-slate-500">{emptyText}</p>}
          {matches.length > shown.length && <p className="px-2 py-1.5 text-[11px] text-slate-400">Se muestran {shown.length} de {matches.length}: escribe para afinar.</p>}
        </div>
        {actions.length > 0 && <div className={cn("mt-1 border-t border-slate-100 pt-1", mobile && "px-3")}>
          {actions.map((a, j) => { const i = shown.length + j; return <div key={a.label} data-index={i} role="option" aria-selected={false}
            onMouseEnter={() => setActive(i)} onClick={() => choose(i)}
            className={cn("flex cursor-pointer select-none items-center gap-2 rounded-md px-2 py-1.5 text-sm font-medium text-[#0A58FF]", mobile && "min-h-12 px-3 py-3 text-base", i === active && "bg-accent")}>{a.icon}{a.label}</div>; })}
        </div>}
  </>;

  if (mobile) return <Sheet open={open} onOpenChange={setOpen}>
    <SheetTrigger asChild>{trigger}</SheetTrigger>
    <SheetContent side="bottom" showCloseButton={false} onKeyDown={onKeyDown}
      onOpenAutoFocus={e => { e.preventDefault(); listRef.current?.focus(); }}
      className="max-h-[min(75dvh,640px)] min-h-0 gap-0 overflow-hidden rounded-t-3xl border-slate-200 pb-[env(safe-area-inset-bottom)]">
      <div className="mx-auto mt-2.5 h-1 w-10 shrink-0 rounded-full bg-slate-300" aria-hidden="true" />
      <div className="flex min-h-14 shrink-0 items-center justify-between gap-3 px-5">
        <SheetTitle className="truncate text-base font-semibold">{ariaLabel ?? placeholder}</SheetTitle>
        <SheetClose asChild><button type="button" aria-label="Cerrar selección" className="flex size-9 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-600"><XIcon className="size-4" /></button></SheetClose>
      </div>
      {list}
    </SheetContent>
  </Sheet>;

  return <PopoverPrimitive.Root open={open} onOpenChange={setOpen}>
    <PopoverPrimitive.Trigger asChild>{trigger}</PopoverPrimitive.Trigger>
    <PopoverPrimitive.Portal>
      <PopoverPrimitive.Content align={align} sideOffset={4} onKeyDown={onKeyDown}
        onOpenAutoFocus={e => { if (!showSearch) { e.preventDefault(); listRef.current?.focus(); } }}
        className={cn("z-50 w-(--radix-popover-trigger-width) min-w-60 max-w-[min(420px,calc(100vw-32px))] overflow-hidden rounded-lg bg-popover p-1 text-popover-foreground shadow-md ring-1 ring-foreground/10 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95", contentClassName)}>
        {list}
      </PopoverPrimitive.Content>
    </PopoverPrimitive.Portal>
  </PopoverPrimitive.Root>;
}
