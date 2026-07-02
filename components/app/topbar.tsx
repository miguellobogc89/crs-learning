"use client";

import Image from "next/image";
import { Bell, UserCircle } from "lucide-react";
import { logout } from "@/app/actions/auth";

type Props = {
  user: {
    name?: string | null;
    email?: string | null;
    image?: string | null;
  };
};

export function AppTopbar({ user }: Props) {
  const userLabel = user.name ?? user.email ?? "Usuario";

  return (
    <header className="flex h-12 shrink-0 items-center justify-end border-b border-border bg-white px-4">
      <div className="flex items-center gap-2">
        <button className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-surface hover:text-foreground">
          <Bell className="h-4 w-4" />
        </button>

        <form action={logout}>
          <button className="flex h-8 items-center gap-2 rounded-md px-2 text-sm text-muted-foreground hover:bg-surface hover:text-foreground">
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

            <span className="max-w-[180px] truncate">{userLabel}</span>
          </button>
        </form>
      </div>
    </header>
  );
}