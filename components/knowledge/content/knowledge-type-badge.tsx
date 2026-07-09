// components/knowledge/content/knowledge-type-badge.tsx
import {
  BookOpen,
  CircleHelp,
  FileCog,
  FileSearch,
  FolderCog,
  Library,
  ShieldCheck,
  Wrench,
} from "lucide-react";

type Props = {
  type?: string | null;
  confidence?: number | null;
};

const TYPES = {
  unknown: {
    label: "Documento",
    icon: FileSearch,
    className:
      "bg-slate-100 text-slate-700 border-slate-200",
  },
  procedure: {
    label: "Procedimiento",
    icon: Wrench,
    className:
      "bg-emerald-100 text-emerald-700 border-emerald-200",
  },
  process: {
    label: "Proceso",
    icon: FolderCog,
    className:
      "bg-teal-100 text-teal-700 border-teal-200",
  },
  manual: {
    label: "Manual",
    icon: BookOpen,
    className:
      "bg-sky-100 text-sky-700 border-sky-200",
  },
  policy: {
    label: "Política",
    icon: ShieldCheck,
    className:
      "bg-amber-100 text-amber-700 border-amber-200",
  },
  reference: {
    label: "Referencia",
    icon: Library,
    className:
      "bg-violet-100 text-violet-700 border-violet-200",
  },
  faq: {
    label: "FAQ",
    icon: CircleHelp,
    className:
      "bg-fuchsia-100 text-fuchsia-700 border-fuchsia-200",
  },
  technical: {
    label: "Técnico",
    icon: FileCog,
    className:
      "bg-zinc-100 text-zinc-700 border-zinc-200",
  },
  functional: {
    label: "Funcional",
    icon: FileCog,
    className:
      "bg-indigo-100 text-indigo-700 border-indigo-200",
  },
  catalog: {
    label: "Catálogo",
    icon: BookOpen,
    className:
      "bg-orange-100 text-orange-700 border-orange-200",
  },
} as const;

export function KnowledgeTypeBadge({
  type,
  confidence,
}: Props) {
  const item =
    TYPES[(type ?? "unknown") as keyof typeof TYPES] ??
    TYPES.unknown;

  const Icon = item.icon;

  let confidenceColor = "text-red-600";

  if ((confidence ?? 0) >= 0.9) {
    confidenceColor = "text-emerald-600";
  } else if ((confidence ?? 0) >= 0.7) {
    confidenceColor = "text-amber-600";
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span
        className={`inline-flex items-center gap-1 rounded-full border px-2 py-1 text-[11px] font-medium ${item.className}`}
      >
        <Icon className="h-3.5 w-3.5" strokeWidth={2.25} />
        {item.label}
      </span>

      {confidence != null && (
        <span
          className={`text-[11px] font-semibold ${confidenceColor}`}
        >
          IA {Math.round(confidence * 100)}%
        </span>
      )}
    </div>
  );
}