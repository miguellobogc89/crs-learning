// components/admin/users-table.tsx
"use client";

import { useState, useMemo } from "react";
import { ChevronDown, ChevronUp, Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { Input } from "@/components/ui/input";
import {
  Select,
} from "@/components/ui/select";
import type { UserAdminView } from "@/lib/repositories/admin-user.repository";

type SortField = "created_at" | "name" | "last_login_at";
type SortDirection = "asc" | "desc";

interface UsersTableProps {
  initialUsers: UserAdminView[];
  isLoading?: boolean;
}

export function UsersTable({
  initialUsers,
  isLoading = false,
}: UsersTableProps) {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [sortField, setSortField] = useState<SortField>("created_at");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");
  const router = useRouter();

  const filteredAndSortedUsers = useMemo(() => {
    let filtered = initialUsers;

    // Apply search filter
    if (search.trim()) {
      const term = search.toLowerCase();
      filtered = filtered.filter(
        (user) =>
          user.name?.toLowerCase().includes(term) ||
          user.email.toLowerCase().includes(term),
      );
    }

    // Apply status filter
    if (statusFilter) {
      filtered = filtered.filter((user) => user.status === statusFilter);
    }

    // Apply sorting
    filtered.sort((a, b) => {
      let aVal: any = a[sortField];
      let bVal: any = b[sortField];

      if (aVal === null) aVal = "";
      if (bVal === null) bVal = "";

      if (typeof aVal === "string") {
        aVal = aVal.toLowerCase();
        bVal = bVal.toLowerCase();
      }

      if (aVal < bVal) return sortDirection === "asc" ? -1 : 1;
      if (aVal > bVal) return sortDirection === "asc" ? 1 : -1;
      return 0;
    });

    return filtered;
  }, [initialUsers, search, statusFilter, sortField, sortDirection]);

  const toggleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortDirection("desc");
    }
  };

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) {
      return (
        <div className="h-4 w-4 opacity-30">
          <ChevronDown className="h-4 w-4" />
        </div>
      );
    }

    return (
      <div className="h-4 w-4">
        {sortDirection === "asc" ? (
          <ChevronUp className="h-4 w-4" />
        ) : (
          <ChevronDown className="h-4 w-4" />
        )}
      </div>
    );
  };

  return (
    <div className="space-y-4">
      {/* Controls */}
      <div className="flex flex-col gap-4 sm:flex-row">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Buscar por nombre o email..."
            className="pl-10"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <Select
          className="w-full sm:w-[180px]"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
        >
          <option value="">Todos los estados</option>
          <option value="active">Activo</option>
          <option value="inactive">Inactivo</option>
          <option value="suspended">Suspendido</option>
        </Select>
      </div>

      {/* Results count */}
      <div className="text-sm text-muted-foreground">
        {filteredAndSortedUsers.length} usuario
        {filteredAndSortedUsers.length !== 1 ? "s" : ""} encontrado
        {search.trim() || statusFilter ? "s" : "s"}
      </div>

        {/* Table */}
        <div className="overflow-x-auto rounded-lg border border-border">
        <table
            className="
            w-full
            text-[10px]

            sm:text-[11px]
            md:text-xs
            lg:text-[13px]
            xl:text-sm
            2xl:text-[15px]
            "
        >
            <thead>
            <tr className="border-b border-border bg-surface">
                <th
                className="
                    px-2 py-2
                    text-center font-semibold

                    sm:px-2.5
                    md:px-3 md:py-2.5
                    lg:px-3.5
                    xl:px-4 xl:py-3
                    2xl:px-5
                "
                >
                <button
                    type="button"
                    className="flex w-full items-center justify-center gap-1.5 hover:text-foreground"
                    onClick={() => toggleSort("name")}
                >
                    Nombre
                    <SortIcon field="name" />
                </button>
                </th>

                <th
                className="
                    px-2 py-2
                    text-center font-semibold

                    sm:px-2.5
                    md:px-3 md:py-2.5
                    lg:px-3.5
                    xl:px-4 xl:py-3
                    2xl:px-5
                "
                >
                Email
                </th>

                <th
                className="
                    px-2 py-2
                    text-center font-semibold

                    sm:px-2.5
                    md:px-3 md:py-2.5
                    lg:px-3.5
                    xl:px-4 xl:py-3
                    2xl:px-5
                "
                >
                Estado
                </th>

                <th
                className="
                    px-2 py-2
                    text-center font-semibold

                    sm:px-2.5
                    md:px-3 md:py-2.5
                    lg:px-3.5
                    xl:px-4 xl:py-3
                    2xl:px-5
                "
                >
                Rol
                </th>

                <th
                className="
                    px-2 py-2
                    text-center font-semibold

                    sm:px-2.5
                    md:px-3 md:py-2.5
                    lg:px-3.5
                    xl:px-4 xl:py-3
                    2xl:px-5
                "
                >
                Workspaces
                </th>

                <th
                className="
                    px-2 py-2
                    text-center font-semibold

                    sm:px-2.5
                    md:px-3 md:py-2.5
                    lg:px-3.5
                    xl:px-4 xl:py-3
                    2xl:px-5
                "
                >
                Archivos
                </th>

                <th
                className="
                    px-2 py-2
                    text-center font-semibold

                    sm:px-2.5
                    md:px-3 md:py-2.5
                    lg:px-3.5
                    xl:px-4 xl:py-3
                    2xl:px-5
                "
                >
                Conversaciones
                </th>

                <th
                className="
                    px-2 py-2
                    text-center font-semibold

                    sm:px-2.5
                    md:px-3 md:py-2.5
                    lg:px-3.5
                    xl:px-4 xl:py-3
                    2xl:px-5
                "
                >
                <button
                    type="button"
                    className="flex w-full items-center justify-center gap-1.5 hover:text-foreground"
                    onClick={() => toggleSort("created_at")}
                >
                    Fecha de alta
                    <SortIcon field="created_at" />
                </button>
                </th>

                <th
                className="
                    px-2 py-2
                    text-center font-semibold

                    sm:px-2.5
                    md:px-3 md:py-2.5
                    lg:px-3.5
                    xl:px-4 xl:py-3
                    2xl:px-5
                "
                >
                <button
                    type="button"
                    className="flex w-full items-center justify-center gap-1.5 hover:text-foreground"
                    onClick={() => toggleSort("last_login_at")}
                >
                    Último login
                    <SortIcon field="last_login_at" />
                </button>
                </th>
            </tr>
            </thead>

            <tbody>
            {filteredAndSortedUsers.length === 0 ? (
                <tr>
                <td
                    colSpan={9}
                    className="px-4 py-8 text-center text-muted-foreground"
                >
                    No se encontraron usuarios
                </td>
                </tr>
            ) : (
                filteredAndSortedUsers.map((user) => (
                <tr
                    key={user.id}
                    role="link"
                    tabIndex={0}
                    onClick={() => {
                    router.push(`/admin/users/${user.id}`);
                    }}
                    onKeyDown={(event) => {
                    if (event.key === "Enter") {
                        router.push(`/admin/users/${user.id}`);
                    }
                    }}
                    className="
                    cursor-pointer
                    border-b border-border
                    transition-colors duration-150

                    hover:bg-surface/60
                    focus:bg-surface/60
                    focus:outline-none
                    "
                >
                    <td
                    className="
                        px-2 py-2
                        font-medium
                        text-center

                        sm:px-2.5
                        md:px-3 md:py-2.5
                        lg:px-3.5
                        xl:px-4 xl:py-3
                        2xl:px-5
                    "
                    >
                    {user.name || "Sin nombre"}
                    </td>

                    <td
                    className="
                        px-2 py-2
                        text-muted-foreground
                        text-center

                        sm:px-2.5
                        md:px-3 md:py-2.5
                        lg:px-3.5
                        xl:px-4 xl:py-3
                        2xl:px-5
                    "
                    >
                    {user.email}
                    </td>

                    <td
                    className="
                        px-2 py-2
                        text-center

                        sm:px-2.5
                        md:px-3 md:py-2.5
                        lg:px-3.5
                        xl:px-4 xl:py-3
                        2xl:px-5
                    "
                    >
                    <span
                        className={[
                        "inline-flex rounded-full px-2 py-1 text-[0.9em] font-medium",
                        user.status === "active"
                            ? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400"
                            : user.status === "suspended"
                            ? "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400"
                            : "bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400",
                        ].join(" ")}
                    >
                        {user.status === "active"
                        ? "Activo"
                        : user.status === "suspended"
                            ? "Suspendido"
                            : "Inactivo"}
                    </span>
                    </td>

                    <td
                    className="
                        px-2 py-2
                        text-center

                        sm:px-2.5
                        md:px-3 md:py-2.5
                        lg:px-3.5
                        xl:px-4 xl:py-3
                        2xl:px-5
                    "
                    >
                    <span
                        className={[
                        "inline-flex rounded-full px-2 py-1 text-[0.9em] font-medium",
                        user.system_role === "system_super_admin"
                            ? "bg-brand-soft text-brand"
                            : user.system_role === "system_admin"
                            ? "bg-surface text-foreground"
                            : "bg-muted text-muted-foreground",
                        ].join(" ")}
                    >
                        {user.system_role === "system_super_admin"
                        ? "Super Admin"
                        : user.system_role === "system_admin"
                            ? "Admin"
                            : "Usuario"}
                    </span>
                    </td>

                    <td
                    className="
                        px-2 py-2
                        text-center
                        text-center

                        sm:px-2.5
                        md:px-3 md:py-2.5
                        lg:px-3.5
                        xl:px-4 xl:py-3
                        2xl:px-5
                    "
                    >
                    {user.workspaceCount}
                    </td>

                    <td
                    className="
                        px-2 py-2
                        text-center
                        text-center

                        sm:px-2.5
                        md:px-3 md:py-2.5
                        lg:px-3.5
                        xl:px-4 xl:py-3
                        2xl:px-5
                    "
                    >
                    {user.fileCount}
                    </td>

                    <td
                    className="
                        px-2 py-2
                        text-center
                        text-center

                        sm:px-2.5
                        md:px-3 md:py-2.5
                        lg:px-3.5
                        xl:px-4 xl:py-3
                        2xl:px-5
                    "
                    >
                    {user.conversationCount}
                    </td>

                    <td
                    className="
                        px-2 py-2
                        text-muted-foreground
                        text-center

                        sm:px-2.5
                        md:px-3 md:py-2.5
                        lg:px-3.5
                        xl:px-4 xl:py-3
                        2xl:px-5
                    "
                    >
                    {new Date(user.created_at).toLocaleDateString(
                        "es-ES",
                    )}
                    </td>

                    <td
                    className="
                        px-2 py-2
                        text-muted-foreground

                        sm:px-2.5
                        md:px-3 md:py-2.5
                        lg:px-3.5
                        xl:px-4 xl:py-3
                        2xl:px-5
                    "
                    >
                    {user.last_login_at
                        ? new Date(
                            user.last_login_at,
                        ).toLocaleDateString("es-ES")
                        : "Nunca"}
                    </td>
                </tr>
                ))
            )}
            </tbody>
        </table>
        </div>
    </div>
  );
}
