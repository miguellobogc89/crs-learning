// components/ui/search-input.tsx

import { Search, X } from "lucide-react";

type SearchInputProps = {
  placeholder?: string;
  className?: string;
  value?: string;
  onChange?: (value: string) => void;
};

export function SearchInput({
  placeholder = "Buscar...",
  className = "",
  value = "",
  onChange,
}: SearchInputProps) {
  const hasValue = value.length > 0;

  return (
    <div className={`relative ${className}`}>
      <Search
        className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
        strokeWidth={2.25}
      />

      <input
        type="text"
        className={[
          "h-10 w-full rounded-xl border border-slate-200 bg-white pl-9 text-sm text-slate-950 outline-none",
          "transition-colors duration-150",
          "placeholder:text-slate-400",
          "hover:border-slate-300",
          "focus:border-slate-700 focus:outline-none focus:ring-0",
          "focus-visible:border-slate-700 focus-visible:outline-none focus-visible:ring-0",
          hasValue ? "pr-10" : "pr-3",
          "[&::-webkit-search-cancel-button]:hidden",
        ].join(" ")}
        placeholder={placeholder}
        value={value}
        onChange={(event) => {
          onChange?.(event.target.value);
        }}
      />

      {hasValue ? (
        <button
          type="button"
          onClick={() => onChange?.("")}
          className="absolute right-2 top-1/2 inline-flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-lg border-0 bg-white text-slate-400 shadow-none transition-colors duration-150 hover:bg-slate-50 hover:text-slate-700 focus:outline-none focus:ring-0 focus-visible:outline-none focus-visible:ring-0"
          title="Borrar búsqueda"
          aria-label="Borrar búsqueda"
        >
          <X
            className="h-4 w-4"
            strokeWidth={2.25}
          />
        </button>
      ) : null}
    </div>
  );
}