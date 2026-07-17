// components/app/topbar.tsx
"use client";

import type { ReactNode } from "react";
import Image from "next/image";
import { Bell, UserCircle } from "lucide-react";

import { logout } from "@/app/actions/auth";
import { GlobalSearch } from "@/components/search/global-search";

type Props = {
  user: {
    name?: string | null;
    email?: string | null;
    image?: string | null;
  };
  breadcrumb: ReactNode;
};

export function AppTopbar({
  user,
  breadcrumb,
}: Props) {
  const userLabel = user.name ?? user.email ?? "Usuario";

  return (
    <header className="flex h-12 shrink-0 items-center justify-between gap-4 border-b border-border bg-white px-4">
      <div className="min-w-0 flex-shrink">
        {breadcrumb}
      </div>

      <div className="flex-1 min-w-0 flex justify-center px-4">
        <div className="w-full max-w-2xl">
          <GlobalSearch />
        </div>
      </div>

      <div className="ml-4 flex shrink-0 items-center gap-2">
        <button
          type="button"
          className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-surface hover:text-foreground"
          aria-label="Notificaciones"
        >
          <Bell className="h-4 w-4" />
        </button>

        <form action={logout}>
          <button
            type="submit"
            className="flex h-8 items-center gap-2 rounded-md px-2 text-sm text-muted-foreground hover:bg-surface hover:text-foreground"
          >
            {user.image ? (
              <Image
                src={user.image}
                alt={userLabel}
                width={24}
                height={24}
                className="rounded-full"
              />
            ) : (
              <UserCircle className="h-5 w-5" />
            )}

            <span className="max-w-[180px] truncate">
              {userLabel}
            </span>
          </button>
        </form>
      </div>
    </header>
  );
}