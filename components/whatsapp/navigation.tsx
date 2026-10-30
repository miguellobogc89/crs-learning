"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  MessageCircle,
  LayoutTemplate,
  Settings,
  UsersRound,
} from "lucide-react";
export const whatsappTabs = [
  { key: "chat", label: "Chat", icon: MessageCircle },
  { key: "templates", label: "Plantillas", icon: LayoutTemplate },
  { key: "settings", label: "Configuración", icon: Settings },
  { key: "leads", label: "Leads", icon: UsersRound },
];
export function WhatsAppNavigation({ compact = false }: { compact?: boolean }) {
  const pathname = usePathname();
  return (
    <nav
      aria-label="WhatsApp"
      className={
        compact
          ? "flex gap-1 overflow-x-auto border-b border-slate-200 pb-2"
          : "space-y-1 p-3"
      }
    >
      {whatsappTabs.map((t) => (
        <Link
          key={t.key}
          href={`/whatsapp/${t.key}`}
          aria-current={pathname === `/whatsapp/${t.key}` ? "page" : undefined}
          className={`flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-sm ${pathname === `/whatsapp/${t.key}` ? "bg-blue-50 font-semibold text-blue-600" : "text-slate-600 hover:bg-slate-50"}`}
        >
          <t.icon className="h-4 w-4" />
          {t.label}
        </Link>
      ))}
    </nav>
  );
}
