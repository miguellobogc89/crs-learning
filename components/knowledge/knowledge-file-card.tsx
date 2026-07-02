// components/knowledge/knowledge-file-card.tsx
import {
  formatFileSize,
  getKnowledgeFileIcon,
  getKnowledgeFileType,
  getKnowledgeStatus,
} from "@/lib/knowledge/file-utils";

type KnowledgeFileCardProps = {
  file: {
    id: string;
    file_name: string;
    file_size: number | null;
    status: string;
  };
};

export function KnowledgeFileCard({ file }: KnowledgeFileCardProps) {
  const extension = getKnowledgeFileType(file.file_name);
  const icon = getKnowledgeFileIcon(file.file_name);
  const status = getKnowledgeStatus(file.status);

  return (
    <div className="flex max-w-[260px] items-center gap-3 rounded-lg border border-border bg-background px-3 py-2 shadow-sm transition hover:border-primary/40">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-surface text-lg">
        {icon}
      </span>

      <div className="min-w-0 flex-1">
        <p className="truncate text-xs font-medium text-foreground">
          {file.file_name}
        </p>

        <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
          {extension.toUpperCase()}
          {file.file_size !== null && ` · ${formatFileSize(file.file_size)}`}
        </p>
      </div>

      <span
        title={status}
        className="h-2 w-2 shrink-0 rounded-full bg-emerald-500"
      />
    </div>
  );
}