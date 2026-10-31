"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  MessageCircle,
  LayoutTemplate,
  Phone,
  UsersRound,
} from "lucide-react";
export const whatsappSections = [
  {
    title: null,
    items: [
      { key: "contacts", label: "Contactos", icon: UsersRound },
      { key: "chat", label: "Conversaciones", icon: MessageCircle },
    ],
  },
  {
    title: "Configuración",
    items: [
      { key: "settings", label: "Números", icon: Phone },
      { key: "templates", label: "Plantillas", icon: LayoutTemplate },
    ],
  },
];
export const whatsappTabKeys = whatsappSections.flatMap((s) =>
  s.items.map((i) => i.key),
);
export function WhatsAppNavigation() {
  const pathname = usePathname();
  return (
    <nav aria-label="WhatsApp" className="space-y-4 p-3">
      {whatsappSections.map((section) => (
        <div key={section.title || "main"} className="space-y-1">
          {section.title && (
            <p className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
              {section.title}
            </p>
          )}
          {section.items.map((t) => {
            const active = pathname === `/whatsapp/${t.key}`;
            return (
              <Link
                key={t.key}
                href={`/whatsapp/${t.key}`}
                aria-current={active ? "page" : undefined}
                className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm ${active ? "bg-blue-50 font-semibold text-blue-600" : "text-slate-600 hover:bg-slate-50"}`}
              >
                <t.icon className="h-4 w-4" />
                {t.label}
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );
}
