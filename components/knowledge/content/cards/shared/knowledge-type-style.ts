// components/knowledge/content/cards/shared/knowledge-type-style.ts

import {
  BookOpen,
  CircleHelp,
  FileCog,
  FileSearch,
  Library,
  Network,
  ShieldCheck,
  Wrench,
  type LucideIcon,
} from "lucide-react";

export type KnowledgeTypeVisualStyle = {
  label: string;
  Icon: LucideIcon;
  iconClassName: string;
  iconBackgroundClassName: string;
  badgeClassName: string;
};

const PROCEDURE_STYLE: KnowledgeTypeVisualStyle = {
  label: "Procedimiento",
  Icon: Wrench,
  iconClassName: "text-[#00A86B]",
  iconBackgroundClassName: "bg-[#00A86B]/10",
  badgeClassName:
    "border-[#00A86B]/25 bg-[#00A86B]/10 text-[#008F5B]",
};

const MANUAL_STYLE: KnowledgeTypeVisualStyle = {
  label: "Manual",
  Icon: BookOpen,
  iconClassName: "text-[#FF4D4F]",
  iconBackgroundClassName: "bg-[#FFE7E5]",
  badgeClassName:
    "border-[#FF6B63] bg-[#FFF0EE] text-[#E23D3F]",
};

const DIAGRAM_STYLE: KnowledgeTypeVisualStyle = {
  label: "Diagrama",
  Icon: Network,
  iconClassName: "text-[#D946EF]",
  iconBackgroundClassName: "bg-[#D946EF]/10",
  badgeClassName:
    "border-[#D946EF]/25 bg-[#D946EF]/10 text-[#B82DCF]",
};

const POLICY_STYLE: KnowledgeTypeVisualStyle = {
  label: "Política",
  Icon: ShieldCheck,
  iconClassName: "text-[#F04444]",
  iconBackgroundClassName: "bg-[#F04444]/10",
  badgeClassName:
    "border-[#F04444]/25 bg-[#F04444]/10 text-[#D72F2F]",
};

const REFERENCE_STYLE: KnowledgeTypeVisualStyle = {
  label: "Referencia",
  Icon: Library,
  iconClassName: "text-[#F59E0B]",
  iconBackgroundClassName: "bg-[#F59E0B]/11",
  badgeClassName:
    "border-[#F59E0B]/30 bg-[#F59E0B]/11 text-[#C77C00]",
};

const TECHNICAL_STYLE: KnowledgeTypeVisualStyle = {
  label: "Técnico",
  Icon: FileCog,
  iconClassName: "text-[#00A7C4]",
  iconBackgroundClassName: "bg-[#00A7C4]/10",
  badgeClassName:
    "border-[#00A7C4]/25 bg-[#00A7C4]/10 text-[#00869D]",
};

const FUNCTIONAL_STYLE: KnowledgeTypeVisualStyle = {
  label: "Funcional",
  Icon: FileCog,
  iconClassName: "text-[#8B3DFF]",
  iconBackgroundClassName: "bg-[#8B3DFF]/10",
  badgeClassName:
    "border-[#8B3DFF]/25 bg-[#8B3DFF]/10 text-[#7428E0]",
};

const FAQ_STYLE: KnowledgeTypeVisualStyle = {
  label: "FAQ",
  Icon: CircleHelp,
  iconClassName: "text-[#EC2F87]",
  iconBackgroundClassName: "bg-[#EC2F87]/10",
  badgeClassName:
    "border-[#EC2F87]/25 bg-[#EC2F87]/10 text-[#CF176F]",
};

const STYLES: Record<
  string,
  KnowledgeTypeVisualStyle
> = {
  procedure: PROCEDURE_STYLE,
  procedimiento: PROCEDURE_STYLE,

  // Proceso desaparece como categoría visual.
  process: PROCEDURE_STYLE,
  proceso: PROCEDURE_STYLE,

  manual: MANUAL_STYLE,

  diagram: DIAGRAM_STYLE,
  diagrama: DIAGRAM_STYLE,

  policy: POLICY_STYLE,
  politica: POLICY_STYLE,
  política: POLICY_STYLE,
  security: POLICY_STYLE,
  seguridad: POLICY_STYLE,

  reference: REFERENCE_STYLE,
  referencia: REFERENCE_STYLE,
  referencias: REFERENCE_STYLE,

  technical: TECHNICAL_STYLE,
  tecnico: TECHNICAL_STYLE,
  técnico: TECHNICAL_STYLE,

  functional: FUNCTIONAL_STYLE,
  funcional: FUNCTIONAL_STYLE,

  faq: FAQ_STYLE,
};

const FALLBACK_STYLE: KnowledgeTypeVisualStyle = {
  label: "Documento",
  Icon: FileSearch,
  iconClassName: "text-[#64748B]",
  iconBackgroundClassName: "bg-slate-100",
  badgeClassName:
    "border-slate-300 bg-slate-100 text-slate-600",
};

export function getKnowledgeTypeVisualStyle(
  type?: string | null,
): KnowledgeTypeVisualStyle {
  const normalizedType = type
    ?.trim()
    .toLowerCase();

  if (!normalizedType) {
    return FALLBACK_STYLE;
  }

  return (
    STYLES[normalizedType] ?? {
      ...FALLBACK_STYLE,
      label: type,
    }
  );
}