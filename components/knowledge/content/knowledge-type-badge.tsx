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
      "bg-[#F1F5F9] text-[#64748B] border-[#E2E8F0]",
  },
  procedure: {
    label: "Procedimiento",
    icon: Wrench,
    className:
      "bg-[#EAF6F0] text-[#247A61] border-[#D2EBDD]",
  },
  process: {
    label: "Proceso",
    icon: FolderCog,
    className:
      "bg-[#EAF5F3] text-[#327D76] border-[#D1E9E4]",
  },
  manual: {
    label: "Manual",
    icon: BookOpen,
    className:
      "bg-[#EDF3FF] text-[#0A58FF] border-[#D8E5FF]",
  },
  policy: {
    label: "Política",
    icon: ShieldCheck,
    className:
      "bg-[#FFF5E5] text-[#9A681C] border-[#F3E4C8]",
  },
  reference: {
    label: "Referencia",
    icon: Library,
    className:
      "bg-[#F2EFFA] text-[#7562A8] border-[#E4DDF3]",
  },
  faq: {
    label: "FAQ",
    icon: CircleHelp,
    className:
      "bg-[#F8EEF4] text-[#A15F84] border-[#EFDAE6]",
  },
  technical: {
    label: "Técnico",
    icon: FileCog,
    className:
      "bg-[#F1F5F9] text-[#64748B] border-[#E2E8F0]",
  },
  functional: {
    label: "Funcional",
    icon: FileCog,
    className:
      "bg-[#F0F1FA] text-[#626EAB] border-[#DFE2F2]",
  },
  catalog: {
    label: "Catálogo",
    icon: BookOpen,
    className:
      "bg-[#FFF2EA] text-[#A66B46] border-[#F2E0D2]",
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

  let confidenceColor = "text-[#B64B55]";

  if ((confidence ?? 0) >= 0.9) {
    confidenceColor = "text-[#247A61]";
  } else if ((confidence ?? 0) >= 0.7) {
    confidenceColor = "text-[#9A681C]";
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