// components/app-sidebar.tsx
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { logout } from "@/app/actions/auth";

type Props = {
  user: {
    id: string;
    name?: string | null;
    email?: string |null;
    image?: string | null;
    xp?: number;
    level?: number;
  };
};

export function AppSidebar({ user }: Props) {
  const pathname = usePathname();

  const items = [
    {
      href: "/dashboard",
      title: "Dashboard",
    },
    {
      href: "/courses",
      title: "Cursos",
    },
    {
      href: "/achievements",
      title: "Logros",
    },
  ];

  return (
    <aside className="flex w-72 flex-col border-r border-slate-800 bg-slate-950 text-white">

      <div className="border-b border-slate-800 p-6">

        <h1 className="text-2xl font-bold">
          CRS Learning
        </h1>

        <p className="mt-1 text-sm text-slate-400">
          Plataforma de aprendizaje
        </p>

      </div>

      <div className="border-b border-slate-800 p-6">

        <div className="text-lg font-semibold">
          {user.name}
        </div>

        <div className="text-sm text-slate-400">
          {user.email}
        </div>

        <div className="mt-6 flex gap-4">

          <div className="rounded-xl bg-slate-900 px-4 py-3">

            <div className="text-xs text-slate-400">
              Nivel
            </div>

            <div className="text-xl font-bold">
              {user.level ?? 1}
            </div>

          </div>

          <div className="rounded-xl bg-slate-900 px-4 py-3">

            <div className="text-xs text-slate-400">
              XP
            </div>

            <div className="text-xl font-bold">
              {user.xp ?? 0}
            </div>

          </div>

        </div>

      </div>

      <nav className="flex-1 space-y-2 p-4">

        {items.map((item) => (

          <Link
            key={item.href}
            href={item.href}
            className={`block rounded-xl px-4 py-3 transition ${
              pathname === item.href
                ? "bg-cyan-500 text-black font-semibold"
                : "text-slate-300 hover:bg-slate-900"
            }`}
          >
            {item.title}
          </Link>

        ))}

      </nav>

      <div className="border-t border-slate-800 p-4">

        <form action={logout}>

          <button
            className="w-full rounded-xl border border-slate-700 px-4 py-3 hover:bg-slate-900"
          >
            Cerrar sesión
          </button>

        </form>

      </div>

    </aside>
  );
}