// components/admin/users-table.tsx
"use client";

import { useMemo, useState } from "react";
import { ChevronDown, ChevronUp, Search } from "lucide-react";
import { useRouter } from "next/navigation";

import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import {
  DataTable,
  type DataTableColumn,
} from "@/components/ui/data-table";

import type { UserAdminView } from "@/lib/repositories/admin-user.repository";

type SortField =
  | "created_at"
  | "name"
  | "last_login_at";

type SortDirection = "asc" | "desc";

interface UsersTableProps {
  initialUsers: UserAdminView[];
  isLoading?: boolean;
}

export function UsersTable({
  initialUsers,
  isLoading = false,
}: UsersTableProps) {
  const router = useRouter();

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] =
    useState("");

  const [sortField, setSortField] =
    useState<SortField>("created_at");

  const [sortDirection, setSortDirection] =
    useState<SortDirection>("desc");

  const filteredAndSortedUsers = useMemo(() => {
    let filtered = [...initialUsers];

    if (search.trim()) {
      const term = search
        .trim()
        .toLowerCase();

      filtered = filtered.filter((user) => {
        const nameMatches =
          user.name
            ?.toLowerCase()
            .includes(term) ?? false;

        const emailMatches =
          user.email
            .toLowerCase()
            .includes(term);

        return nameMatches || emailMatches;
      });
    }

    if (statusFilter) {
      filtered = filtered.filter(
        (user) =>
          user.status === statusFilter,
      );
    }

    filtered.sort((a, b) => {
      let aValue = a[sortField];
      let bValue = b[sortField];

      if (aValue === null) {
        aValue = "";
      }

      if (bValue === null) {
        bValue = "";
      }

      if (
        typeof aValue === "string" &&
        typeof bValue === "string"
      ) {
        aValue = aValue.toLowerCase();
        bValue = bValue.toLowerCase();
      }

      if (aValue < bValue) {
        if (sortDirection === "asc") {
          return -1;
        }

        return 1;
      }

      if (aValue > bValue) {
        if (sortDirection === "asc") {
          return 1;
        }

        return -1;
      }

      return 0;
    });

    return filtered;
  }, [
    initialUsers,
    search,
    statusFilter,
    sortField,
    sortDirection,
  ]);

  function toggleSort(
    field: SortField,
  ) {
    if (sortField === field) {
      setSortDirection((current) => {
        if (current === "asc") {
          return "desc";
        }

        return "asc";
      });

      return;
    }

    setSortField(field);
    setSortDirection("desc");
  }

  function SortIcon({
    field,
  }: {
    field: SortField;
  }) {
    if (sortField !== field) {
      return (
        <ChevronDown className="h-4 w-4 opacity-30" />
      );
    }

    if (sortDirection === "asc") {
      return (
        <ChevronUp className="h-4 w-4" />
      );
    }

    return (
      <ChevronDown className="h-4 w-4" />
    );
  }

  const columns: DataTableColumn<UserAdminView>[] =
    [
      {
        id: "name",
        header: (
          <button
            type="button"
            className="flex w-full items-center justify-center gap-1.5 hover:text-foreground"
            onClick={() =>
              toggleSort("name")
            }
          >
            Nombre
            <SortIcon field="name" />
          </button>
        ),
        align: "center",
        render: (user) => (
          <span className="font-medium">
            {user.name || "Sin nombre"}
          </span>
        ),
      },

      {
        id: "email",
        header: "Email",
        align: "center",
        render: (user) => (
          <span className="text-muted-foreground">
            {user.email}
          </span>
        ),
      },

      {
        id: "status",
        header: "Estado",
        align: "center",
        render: (user) => (
          <span
            className={[
              "inline-flex rounded-full px-2 py-1 text-[0.9em] font-medium",
              user.status === "active"
                ? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400"
                : "",
              user.status === "suspended"
                ? "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400"
                : "",
              user.status !== "active" &&
              user.status !== "suspended"
                ? "bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400"
                : "",
            ].join(" ")}
          >
            {user.status === "active"
              ? "Activo"
              : user.status === "suspended"
                ? "Suspendido"
                : "Inactivo"}
          </span>
        ),
      },

      {
        id: "system_role",
        header: "Rol",
        align: "center",
        render: (user) => (
          <span
            className={[
              "inline-flex rounded-full px-2 py-1 text-[0.9em] font-medium",
              user.system_role ===
              "system_super_admin"
                ? "bg-brand-soft text-brand"
                : "",
              user.system_role ===
              "system_admin"
                ? "bg-surface text-foreground"
                : "",
              user.system_role === "user"
                ? "bg-muted text-muted-foreground"
                : "",
            ].join(" ")}
          >
            {user.system_role ===
            "system_super_admin"
              ? "Super Admin"
              : user.system_role ===
                  "system_admin"
                ? "Admin"
                : "Usuario"}
          </span>
        ),
      },

      {
        id: "workspaces",
        header: "Workspaces",
        align: "center",
        render: (user) =>
          user.workspaceCount,
      },

      {
        id: "files",
        header: "Archivos",
        align: "center",
        render: (user) =>
          user.fileCount,
      },

      {
        id: "conversations",
        header: "Conversaciones",
        align: "center",
        render: (user) =>
          user.conversationCount,
      },

      {
        id: "created_at",
        header: (
          <button
            type="button"
            className="flex w-full items-center justify-center gap-1.5 hover:text-foreground"
            onClick={() =>
              toggleSort("created_at")
            }
          >
            Fecha de alta
            <SortIcon field="created_at" />
          </button>
        ),
        align: "center",
        render: (user) => (
          <span className="text-muted-foreground">
            {new Date(
              user.created_at,
            ).toLocaleDateString(
              "es-ES",
            )}
          </span>
        ),
      },

      {
        id: "last_login_at",
        header: (
          <button
            type="button"
            className="flex w-full items-center justify-center gap-1.5 hover:text-foreground"
            onClick={() =>
              toggleSort(
                "last_login_at",
              )
            }
          >
            Último login
            <SortIcon field="last_login_at" />
          </button>
        ),
        align: "center",
        render: (user) => (
          <span className="text-muted-foreground">
            {user.last_login_at
              ? new Date(
                  user.last_login_at,
                ).toLocaleDateString(
                  "es-ES",
                )
              : "Nunca"}
          </span>
        ),
      },
    ];

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-4 sm:flex-row">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />

          <Input
            placeholder="Buscar por nombre o email..."
            className="pl-10"
            value={search}
            onChange={(event) => {
              setSearch(
                event.target.value,
              );
            }}
          />
        </div>

        <Select
          className="w-full sm:w-[180px]"
          value={statusFilter}
          onChange={(event) => {
            setStatusFilter(
              event.target.value,
            );
          }}
        >
          <option value="">
            Todos los estados
          </option>

          <option value="active">
            Activo
          </option>

          <option value="inactive">
            Inactivo
          </option>

          <option value="suspended">
            Suspendido
          </option>
        </Select>
      </div>

      <div className="text-sm text-muted-foreground">
        {filteredAndSortedUsers.length}{" "}
        {filteredAndSortedUsers.length === 1
          ? "usuario encontrado"
          : "usuarios encontrados"}
      </div>

      <DataTable
        rows={filteredAndSortedUsers}
        columns={columns}
        getRowId={(user) =>
          user.id
        }
        emptyMessage="No se encontraron usuarios."
        onRowClick={(user) => {
          router.push(
            `/admin/users/${user.id}`,
          );
        }}
      />
    </div>
  );
}