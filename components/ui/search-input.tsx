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
        className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
        strokeWidth={2.25}
      />

      <input
        type="text"
        className={[
          "h-10 w-full rounded-xl border border-border bg-background pl-9 text-sm text-foreground outline-none transition",
          "placeholder:text-muted-foreground",
          "hover:border-border/80",
          "focus:border-primary/40 focus:ring-4 focus:ring-primary/10",
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
          className="absolute right-2 top-1/2 inline-flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-lg text-muted-foreground transition hover:bg-muted hover:text-foreground"
          title="Borrar búsqueda"
          aria-label="Borrar búsqueda"
        >
          <X className="h-4 w-4" strokeWidth={2.25} />
        </button>
      ) : null}
    </div>
  );
}