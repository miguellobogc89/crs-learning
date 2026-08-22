"use client";

import { useCallback, useMemo, useState } from "react";
import { Search, ChevronUp, ChevronDown, ChevronsUpDown } from "lucide-react";
import type {
  StorageFileWithDetails,
} from "@/lib/repositories/admin-storage.repository";
import { FileDetailModal } from "./file-detail-modal";

interface StorageTableProps {
  initialFiles: StorageFileWithDetails[];
  users: Array<{ id: string; email: string; name: string | null }>;
  fileTypes: string[];
  statuses: string[];
  workspaces: Array<{ id: string; name: string }>;
}

type SortField = "fileName" | "fileSize" | "createdAt";
type SortDirection = "asc" | "desc";

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
    return <ChevronsUpDown className="h-3.5 w-3.5" />;
  }

  return sortDirection === "asc"
    ? <ChevronUp className="h-3.5 w-3.5" />
    : <ChevronDown className="h-3.5 w-3.5" />;
}

export function StorageTable({
  initialFiles,
  users,
  fileTypes,
  statuses,
  workspaces,
}: StorageTableProps) {
  const [search, setSearch] = useState("");
  const [selectedUser, setSelectedUser] = useState("");
  const [selectedWorkspace, setSelectedWorkspace] = useState("");
  const [selectedFileType, setSelectedFileType] = useState("");
  const [selectedStatus, setSelectedStatus] = useState("");
  const [sortField, setSortField] = useState<SortField>("createdAt");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");
  const [selectedFile, setSelectedFile] = useState<StorageFileWithDetails | null>(null);

  const filteredAndSortedFiles = useMemo(() => {
    const filtered = initialFiles.filter((file) => {
      const matchesSearch = search === "" ||
        file.fileName.toLowerCase().includes(search.toLowerCase());

      const matchesUser = selectedUser === "" ||
        file.uploadedByUser?.id === selectedUser;

      const matchesWorkspace = selectedWorkspace === "" ||
        file.library.workspace?.id === selectedWorkspace;

      const matchesFileType = selectedFileType === "" ||
        file.fileType === selectedFileType;

      const matchesStatus = selectedStatus === "" ||
        file.status === selectedStatus;

      return (
        matchesSearch &&
        matchesUser &&
        matchesWorkspace &&
        matchesFileType &&
        matchesStatus
      );
    });

    filtered.sort((a, b) => {
      let comparison = 0;

      if (sortField === "fileName") {
        comparison = a.fileName.localeCompare(b.fileName);
      } else if (sortField === "fileSize") {
        comparison = (a.fileSize || 0) - (b.fileSize || 0);
      } else if (sortField === "createdAt") {
        comparison = a.createdAt.getTime() - b.createdAt.getTime();
      }

      return sortDirection === "asc" ? comparison : -comparison;
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

  const handleSort = useCallback((field: SortField) => {
    if (sortField === field) {
      setSortDirection((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDirection("desc");
    }
  }, [sortField]);

  const formatBytes = (bytes: number | null): string => {
    if (!bytes) return "—";
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return (bytes / Math.pow(k, i)).toFixed(2) + " " + sizes[i];
  };

  const formatDate = (date: Date): string => {
    return new Date(date).toLocaleDateString("es-ES", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const getStatusBadgeColor = (status: string): string => {
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
  };

  return (
    <div className="space-y-4">
      {/* Filtros */}
      <div className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-4 sm:flex-row sm:items-end sm:gap-2">
        <div className="flex-1">
          <label className="block text-xs font-medium text-muted-foreground mb-1">
            Buscar archivo
          </label>
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              placeholder="Nombre de archivo..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-8 pr-3 py-2 text-sm border border-border rounded-md bg-background hover:border-foreground/50 focus:outline-none focus:ring-2 focus:ring-brand focus:ring-offset-0"
            />
          </div>
        </div>

        <div className="min-w-max">
          <label className="block text-xs font-medium text-muted-foreground mb-1">
            Subido por
          </label>
          <select
            value={selectedUser}
            onChange={(e) => setSelectedUser(e.target.value)}
            className="px-3 py-2 text-sm border border-border rounded-md bg-background hover:border-foreground/50 focus:outline-none focus:ring-2 focus:ring-brand focus:ring-offset-0"
          >
            <option value="">Todos</option>
            {users.map((user) => (
              <option key={user.id} value={user.id}>
                {user.name || user.email}
              </option>
            ))}
          </select>
        </div>

        <div className="min-w-max">
          <label className="block text-xs font-medium text-muted-foreground mb-1">
            Workspace
          </label>
          <select
            value={selectedWorkspace}
            onChange={(e) => setSelectedWorkspace(e.target.value)}
            className="px-3 py-2 text-sm border border-border rounded-md bg-background hover:border-foreground/50 focus:outline-none focus:ring-2 focus:ring-brand focus:ring-offset-0"
          >
            <option value="">Todos</option>
            {workspaces.map((workspace) => (
              <option key={workspace.id} value={workspace.id}>
                {workspace.name}
              </option>
            ))}
          </select>
        </div>

        <div className="min-w-max">
          <label className="block text-xs font-medium text-muted-foreground mb-1">
            Tipo
          </label>
          <select
            value={selectedFileType}
            onChange={(e) => setSelectedFileType(e.target.value)}
            className="px-3 py-2 text-sm border border-border rounded-md bg-background hover:border-foreground/50 focus:outline-none focus:ring-2 focus:ring-brand focus:ring-offset-0"
          >
            <option value="">Todos</option>
            {fileTypes.map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </select>
        </div>

        <div className="min-w-max">
          <label className="block text-xs font-medium text-muted-foreground mb-1">
            Estado
          </label>
          <select
            value={selectedStatus}
            onChange={(e) => setSelectedStatus(e.target.value)}
            className="px-3 py-2 text-sm border border-border rounded-md bg-background hover:border-foreground/50 focus:outline-none focus:ring-2 focus:ring-brand focus:ring-offset-0"
          >
            <option value="">Todos</option>
            {statuses.map((status) => (
              <option key={status} value={status}>
                {status}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Tabla */}
      <div className="rounded-lg border border-border overflow-hidden bg-background">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-surface">
                <th className="px-4 py-3 text-left font-semibold text-foreground">
                  <button
                    onClick={() => handleSort("fileName")}
                    className="flex items-center gap-1.5 hover:text-brand transition"
                  >
                    Archivo
                    <SortIcon
                      field="fileName"
                      sortField={sortField}
                      sortDirection={sortDirection}
                    />
                  </button>
                </th>
                <th className="px-4 py-3 text-left font-semibold text-foreground">
                  <button
                    onClick={() => handleSort("fileSize")}
                    className="flex items-center gap-1.5 hover:text-brand transition"
                  >
                    Tamaño
                    <SortIcon
                      field="fileSize"
                      sortField={sortField}
                      sortDirection={sortDirection}
                    />
                  </button>
                </th>
                <th className="px-4 py-3 text-left font-semibold text-foreground">
                  Tipo
                </th>
                <th className="px-4 py-3 text-left font-semibold text-foreground">
                  Subido por
                </th>
                <th className="px-4 py-3 text-left font-semibold text-foreground">
                  Workspace
                </th>
                <th className="px-4 py-3 text-left font-semibold text-foreground">
                  Biblioteca
                </th>
                <th className="px-4 py-3 text-left font-semibold text-foreground">
                  Knowledge Source
                </th>
                <th className="px-4 py-3 text-left font-semibold text-foreground">
                  Estado
                </th>
                <th className="px-4 py-3 text-left font-semibold text-foreground">
                  <button
                    onClick={() => handleSort("createdAt")}
                    className="flex items-center gap-1.5 hover:text-brand transition"
                  >
                    Fecha
                    <SortIcon
                      field="createdAt"
                      sortField={sortField}
                      sortDirection={sortDirection}
                    />
                  </button>
                </th>
                <th className="px-4 py-3 text-left font-semibold text-foreground">
                  Acción
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filteredAndSortedFiles.length === 0 ? (
                <tr>
                  <td
                    colSpan={10}
                    className="px-4 py-8 text-center text-muted-foreground"
                  >
                    No hay archivos que coincidan con los filtros.
                  </td>
                </tr>
              ) : (
                filteredAndSortedFiles.map((file) => (
                  <tr
                    key={file.id}
                    className="hover:bg-surface transition"
                  >
                    <td className="px-4 py-3 text-foreground">
                      <span title={file.fileName} className="line-clamp-1">
                        {file.fileName}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-foreground">
                      {formatBytes(file.fileSize)}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {file.fileType ? (
                        <code className="text-xs bg-surface px-2 py-1 rounded">
                          {file.fileType}
                        </code>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="px-4 py-3 text-foreground">
                      <div>
                        <div>{file.uploadedByUser?.name || "—"}</div>
                        <div className="text-xs text-muted-foreground">
                          {file.uploadedByUser?.email}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-foreground">
                      {file.library.workspace?.name || "—"}
                    </td>
                    <td className="px-4 py-3 text-foreground">
                      <span title={file.library.name} className="line-clamp-1">
                        {file.library.name}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-foreground">
                      <span
                        title={file.knowledgeSource.title}
                        className="line-clamp-1"
                      >
                        {file.knowledgeSource.title}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-block px-2 py-1 rounded text-xs font-medium ${getStatusBadgeColor(
                          file.status,
                        )}`}
                      >
                        {file.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-muted-foreground">
                      {formatDate(file.createdAt)}
                    </td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => setSelectedFile(file)}
                        className="text-brand hover:underline font-medium text-sm"
                      >
                        Ver
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Total de archivos */}
      <div className="text-sm text-muted-foreground">
        Mostrando {filteredAndSortedFiles.length} de {initialFiles.length} archivos
      </div>

      {/* Modal de detalles */}
      {selectedFile && (
        <FileDetailModal
          file={selectedFile}
          onClose={() => setSelectedFile(null)}
        />
      )}
    </div>
  );
}
