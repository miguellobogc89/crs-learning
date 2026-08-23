// components/admin/storage-table.tsx

"use client";

import {
  useCallback,
  useMemo,
  useState,
} from "react";
import {
  Search,
  ChevronUp,
  ChevronDown,
  ChevronsUpDown,
} from "lucide-react";

import {
  DataTable,
  type DataTableColumn,
} from "@/components/ui/data-table";

import type {
  StorageFileWithDetails,
} from "@/lib/repositories/admin-storage.repository";

import { FileDetailModal } from "./file-detail-modal";

interface StorageTableProps {
  initialFiles: StorageFileWithDetails[];

  users: Array<{
    id: string;
    email: string;
    name: string | null;
  }>;

  fileTypes: string[];
  statuses: string[];

  workspaces: Array<{
    id: string;
    name: string;
  }>;
}

type SortField =
  | "fileName"
  | "fileSize"
  | "createdAt";

type SortDirection =
  | "asc"
  | "desc";

function SortIcon({
  field,
  sortField,
  sortDirection,
}: {
  field: SortField;
  sortField: SortField;
  sortDirection: SortDirection;
}) {
  if (sortField !== field) {
    return (
      <ChevronsUpDown className="h-3.5 w-3.5 opacity-40" />
    );
  }

  if (sortDirection === "asc") {
    return (
      <ChevronUp className="h-3.5 w-3.5" />
    );
  }

  return (
    <ChevronDown className="h-3.5 w-3.5" />
  );
}

function formatFileType(
  mimeType: string | null,
): string {
  if (!mimeType) {
    return "—";
  }

  const mimeMap: Record<string, string> = {
    "application/pdf": ".pdf",

    "application/msword": ".doc",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
      ".docx",

    "application/vnd.ms-excel": ".xls",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet":
      ".xlsx",

    "application/vnd.ms-powerpoint": ".ppt",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation":
      ".pptx",

    "text/plain": ".txt",
    "text/csv": ".csv",

    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
    "image/gif": ".gif",
  };

  const mappedType = mimeMap[mimeType];

  if (mappedType) {
    return mappedType;
  }

  return mimeType;
}

export function StorageTable({
  initialFiles,
  users,
  fileTypes,
  statuses,
  workspaces,
}: StorageTableProps) {
  const [search, setSearch] =
    useState("");

  const [selectedUser, setSelectedUser] =
    useState("");

  const [
    selectedWorkspace,
    setSelectedWorkspace,
  ] = useState("");

  const [
    selectedFileType,
    setSelectedFileType,
  ] = useState("");

  const [
    selectedStatus,
    setSelectedStatus,
  ] = useState("");

  const [sortField, setSortField] =
    useState<SortField>("createdAt");

  const [
    sortDirection,
    setSortDirection,
  ] =
    useState<SortDirection>("desc");

  const [
    selectedFile,
    setSelectedFile,
  ] =
    useState<StorageFileWithDetails | null>(
      null,
    );

  const filteredAndSortedFiles =
    useMemo(() => {
      const filtered =
        initialFiles.filter(
          (file) => {
            const matchesSearch =
              search === "" ||
              file.fileName
                .toLowerCase()
                .includes(
                  search.toLowerCase(),
                );

            const matchesUser =
              selectedUser === "" ||
              file.uploadedByUser?.id ===
                selectedUser;

            const matchesWorkspace =
              selectedWorkspace === "" ||
              file.library?.workspace?.id ===
                selectedWorkspace;

            const matchesFileType =
              selectedFileType === "" ||
              file.fileType ===
                selectedFileType;

            const matchesStatus =
              selectedStatus === "" ||
              file.status ===
                selectedStatus;

            return (
              matchesSearch &&
              matchesUser &&
              matchesWorkspace &&
              matchesFileType &&
              matchesStatus
            );
          },
        );

      filtered.sort((a, b) => {
        let comparison = 0;

        if (
          sortField === "fileName"
        ) {
          comparison =
            a.fileName.localeCompare(
              b.fileName,
            );
        }

        if (
          sortField === "fileSize"
        ) {
          comparison =
            (a.fileSize || 0) -
            (b.fileSize || 0);
        }

        if (
          sortField === "createdAt"
        ) {
          comparison =
            a.createdAt.getTime() -
            b.createdAt.getTime();
        }

        if (
          sortDirection === "asc"
        ) {
          return comparison;
        }

        return -comparison;
      });

      return filtered;
    }, [
      initialFiles,
      search,
      selectedUser,
      selectedWorkspace,
      selectedFileType,
      selectedStatus,
      sortField,
      sortDirection,
    ]);

  const handleSort =
    useCallback(
      (field: SortField) => {
        if (
          sortField === field
        ) {
          setSortDirection(
            (current) => {
              if (
                current === "asc"
              ) {
                return "desc";
              }

              return "asc";
            },
          );

          return;
        }

        setSortField(field);
        setSortDirection("desc");
      },
      [sortField],
    );

  function formatBytes(
    bytes: number | null,
  ): string {
    if (bytes === null) {
      return "—";
    }

    if (bytes === 0) {
      return "0 B";
    }

    const k = 1024;
    const sizes = [
      "B",
      "KB",
      "MB",
      "GB",
    ];

    const index = Math.floor(
      Math.log(bytes) /
        Math.log(k),
    );

    return `${(
      bytes /
      Math.pow(k, index)
    ).toFixed(2)} ${sizes[index]}`;
  }

  function formatDate(
    date: Date,
  ): string {
    return new Date(
      date,
    ).toLocaleDateString(
      "es-ES",
      {
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      },
    );
  }

  function getStatusBadgeColor(
    status: string,
  ): string {
    switch (status) {
      case "uploaded":
        return "bg-blue-100 text-blue-900";

      case "processing":
        return "bg-yellow-100 text-yellow-900";

      case "completed":
        return "bg-green-100 text-green-900";

      case "failed":
        return "bg-red-100 text-red-900";

      default:
        return "bg-gray-100 text-gray-900";
    }
  }

  const columns: DataTableColumn<StorageFileWithDetails>[] =
    [
      {
        id: "fileName",
        header: (
          <button
            type="button"
            className="flex w-full items-center justify-center gap-1.5 hover:text-foreground"
            onClick={() => {
              handleSort("fileName");
            }}
          >
            Archivo

            <SortIcon
              field="fileName"
              sortField={sortField}
              sortDirection={
                sortDirection
              }
            />
          </button>
        ),
        align: "center",
        render: (file) => (
          <span
            title={file.fileName}
            className="line-clamp-1"
          >
            {file.fileName}
          </span>
        ),
      },

      {
        id: "fileSize",
        header: (
          <button
            type="button"
            className="flex w-full items-center justify-center gap-1.5 hover:text-foreground"
            onClick={() => {
              handleSort("fileSize");
            }}
          >
            Tamaño

            <SortIcon
              field="fileSize"
              sortField={sortField}
              sortDirection={
                sortDirection
              }
            />
          </button>
        ),
        align: "center",
        render: (file) =>
          formatBytes(
            file.fileSize,
          ),
      },

      {
        id: "fileType",
        header: "Tipo",
        align: "center",
            render: (file) => (
            <span className="text-muted-foreground">
                {formatFileType(file.fileType)}
            </span>
            ),
      },

      {
        id: "uploadedBy",
        header: "Subido por",
        align: "center",
        render: (file) => (
          <div>
            <div>
              {file.uploadedByUser
                ?.name || "—"}
            </div>

            <div className="text-[0.85em] text-muted-foreground">
              {
                file.uploadedByUser
                  ?.email
              }
            </div>
          </div>
        ),
      },

      {
        id: "workspace",
        header: "Workspace",
        align: "center",
        render: (file) =>
          file.library
            ?.workspace?.name ||
          "—",
      },

      {
        id: "library",
        header: "Biblioteca",
        align: "center",
        render: (file) => (
          <span
            title={
              file.library?.name ||
              undefined
            }
            className="line-clamp-1"
          >
            {file.library?.name ||
              "—"}
          </span>
        ),
      },

      {
        id: "knowledgeSource",
        header:
          "Knowledge Source",
        align: "center",
        render: (file) => (
          <span
            title={
              file.knowledgeSource
                .title
            }
            className="line-clamp-1"
          >
            {
              file.knowledgeSource
                .title
            }
          </span>
        ),
      },

      {
        id: "status",
        header: "Estado",
        align: "center",
        render: (file) => (
          <span
            className={[
              "inline-block rounded px-2 py-1 text-[0.9em] font-medium",
              getStatusBadgeColor(
                file.status,
              ),
            ].join(" ")}
          >
            {file.status}
          </span>
        ),
      },

      {
        id: "createdAt",
        header: (
          <button
            type="button"
            className="flex w-full items-center justify-center gap-1.5 hover:text-foreground"
            onClick={() => {
              handleSort(
                "createdAt",
              );
            }}
          >
            Fecha

            <SortIcon
              field="createdAt"
              sortField={sortField}
              sortDirection={
                sortDirection
              }
            />
          </button>
        ),
        align: "center",
        render: (file) => (
          <span className="text-muted-foreground">
            {formatDate(
              file.createdAt,
            )}
          </span>
        ),
      },
    ];

  return (
    <div className="space-y-4">
      {/* Filtros */}
      <div className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-4 sm:flex-row sm:items-end sm:gap-2">
        <div className="flex-1">
          <label className="mb-1 block text-xs font-medium text-muted-foreground">
            Buscar archivo
          </label>

          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />

            <input
              type="text"
              placeholder="Nombre de archivo..."
              value={search}
              onChange={(
                event,
              ) => {
                setSearch(
                  event.target
                    .value,
                );
              }}
              className="w-full rounded-md border border-border bg-background py-2 pl-8 pr-3 text-sm hover:border-foreground/50 focus:outline-none focus:ring-2 focus:ring-brand focus:ring-offset-0"
            />
          </div>
        </div>

        <div className="min-w-max">
          <label className="mb-1 block text-xs font-medium text-muted-foreground">
            Subido por
          </label>

          <select
            value={selectedUser}
            onChange={(
              event,
            ) => {
              setSelectedUser(
                event.target
                  .value,
              );
            }}
            className="rounded-md border border-border bg-background px-3 py-2 text-sm hover:border-foreground/50 focus:outline-none focus:ring-2 focus:ring-brand focus:ring-offset-0"
          >
            <option value="">
              Todos
            </option>

            {users.map(
              (user) => (
                <option
                  key={user.id}
                  value={user.id}
                >
                  {user.name ||
                    user.email}
                </option>
              ),
            )}
          </select>
        </div>

        <div className="min-w-max">
          <label className="mb-1 block text-xs font-medium text-muted-foreground">
            Workspace
          </label>

          <select
            value={
              selectedWorkspace
            }
            onChange={(
              event,
            ) => {
              setSelectedWorkspace(
                event.target
                  .value,
              );
            }}
            className="rounded-md border border-border bg-background px-3 py-2 text-sm hover:border-foreground/50 focus:outline-none focus:ring-2 focus:ring-brand focus:ring-offset-0"
          >
            <option value="">
              Todos
            </option>

            {workspaces.map(
              (workspace) => (
                <option
                  key={
                    workspace.id
                  }
                  value={
                    workspace.id
                  }
                >
                  {
                    workspace.name
                  }
                </option>
              ),
            )}
          </select>
        </div>

        <div className="min-w-max">
          <label className="mb-1 block text-xs font-medium text-muted-foreground">
            Tipo
          </label>

          <select
            value={
              selectedFileType
            }
            onChange={(
              event,
            ) => {
              setSelectedFileType(
                event.target
                  .value,
              );
            }}
            className="rounded-md border border-border bg-background px-3 py-2 text-sm hover:border-foreground/50 focus:outline-none focus:ring-2 focus:ring-brand focus:ring-offset-0"
          >
            <option value="">
              Todos
            </option>

            {fileTypes.map(
              (type) => (
                <option
                  key={type}
                  value={type}
                >
                  {type}
                </option>
              ),
            )}
          </select>
        </div>

        <div className="min-w-max">
          <label className="mb-1 block text-xs font-medium text-muted-foreground">
            Estado
          </label>

          <select
            value={
              selectedStatus
            }
            onChange={(
              event,
            ) => {
              setSelectedStatus(
                event.target
                  .value,
              );
            }}
            className="rounded-md border border-border bg-background px-3 py-2 text-sm hover:border-foreground/50 focus:outline-none focus:ring-2 focus:ring-brand focus:ring-offset-0"
          >
            <option value="">
              Todos
            </option>

            {statuses.map(
              (status) => (
                <option
                  key={status}
                  value={status}
                >
                  {status}
                </option>
              ),
            )}
          </select>
        </div>
      </div>

      <DataTable
        rows={
          filteredAndSortedFiles
        }
        columns={columns}
        getRowId={(file) =>
          file.id
        }
        emptyMessage="No hay archivos que coincidan con los filtros."
        onRowClick={(file) => {
          setSelectedFile(
            file,
          );
        }}
      />

      <div className="text-sm text-muted-foreground">
        Mostrando{" "}
        {
          filteredAndSortedFiles.length
        }{" "}
        de {initialFiles.length}{" "}
        archivos
      </div>

      {selectedFile && (
        <FileDetailModal
          file={selectedFile}
          onClose={() => {
            setSelectedFile(
              null,
            );
          }}
        />
      )}
    </div>
  );
}