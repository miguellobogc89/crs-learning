"use client";

import { useMemo, useState } from "react";
import { Check, ChevronDown, Search, X } from "lucide-react";

import { Combobox, type ComboOption } from "@/components/ui/combobox";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";

type AdaptiveSelectProps = {
  label: string;
  value: string | null;
  options: ComboOption[];
  onChange: (value: string) => void;
  placeholder?: string;
  searchable?: boolean;
  disabled?: boolean;
};

const normalize = (value: string) =>
  value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

/** Lista flotante en escritorio y panel inferior en móvil. */
export function AdaptiveSelect({
  label,
  value,
  options,
  onChange,
  placeholder = "Seleccionar…",
  searchable = false,
  disabled = false,
}: AdaptiveSelectProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const selected = options.find((option) => option.value === value);

  const filtered = useMemo(() => {
    const search = normalize(query.trim());
    return search
      ? options.filter((option) => normalize(`${option.label} ${option.hint ?? ""}`).includes(search))
      : options;
  }, [options, query]);

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (!next) setQuery("");
  }

  function select(next: string) {
    onChange(next);
    handleOpenChange(false);
  }

  return (
    <>
      <div className="hidden md:block">
        <Combobox
          value={value}
          options={options}
          onChange={onChange}
          placeholder={placeholder}
          searchable={searchable}
          disabled={disabled}
          ariaLabel={label}
          className="h-11 w-full rounded-xl px-3"
          contentClassName="rounded-xl"
        />
      </div>

      <button
        type="button"
        disabled={disabled}
        onClick={() => handleOpenChange(true)}
        aria-label={label}
        className="flex h-11 w-full items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-3 text-left text-sm text-slate-900 outline-none transition-colors active:bg-slate-50 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-400 md:hidden"
      >
        <span className={`truncate ${selected ? "" : "text-slate-400"}`}>
          {selected?.label ?? placeholder}
        </span>
        <ChevronDown className="size-4 shrink-0 text-slate-400" />
      </button>

      <Sheet open={open} onOpenChange={handleOpenChange}>
        <SheetContent
          side="bottom"
          showCloseButton={false}
          className="h-[min(78dvh,640px)] gap-0 rounded-t-3xl border-slate-200 bg-white p-0 md:hidden"
        >
          <div className="mx-auto mt-2.5 h-1 w-10 shrink-0 rounded-full bg-slate-200" />
          <div className="flex h-16 shrink-0 items-center justify-between border-b border-slate-100 px-5">
            <SheetTitle className="text-lg font-semibold text-slate-900">{label}</SheetTitle>
            <button
              type="button"
              onClick={() => handleOpenChange(false)}
              aria-label="Cerrar selección"
              className="flex size-10 items-center justify-center rounded-xl text-slate-500 active:bg-slate-100"
            >
              <X className="size-5" />
            </button>
          </div>

          {searchable && (
            <div className="relative shrink-0 px-5 py-3">
              <Search className="pointer-events-none absolute left-8 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
              <input
                autoFocus
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Buscar…"
                className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50 pl-10 pr-3 text-sm outline-none focus:border-blue-500"
              />
            </div>
          )}

          <div role="listbox" aria-label={label} className="min-h-0 flex-1 overflow-y-auto px-3 pb-[calc(1rem+env(safe-area-inset-bottom))]">
            {filtered.map((option) => (
              <button
                type="button"
                role="option"
                aria-selected={option.value === value}
                key={option.value}
                onClick={() => select(option.value)}
                className="flex min-h-12 w-full items-center justify-between gap-3 rounded-xl px-3 py-2 text-left text-[15px] text-slate-800 active:bg-blue-50"
              >
                <span className="min-w-0">
                  <span className="block truncate">{option.label}</span>
                  {option.hint && <span className="block text-xs text-slate-400">{option.hint}</span>}
                </span>
                {option.value === value && <Check className="size-5 shrink-0 text-[#0A58FF]" />}
              </button>
            ))}
            {filtered.length === 0 && (
              <p className="px-3 py-8 text-center text-sm text-slate-400">No hay resultados</p>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
