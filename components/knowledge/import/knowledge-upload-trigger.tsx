// components/knowledge/import/knowledge-upload-trigger.tsx

"use client";

import { useRef, useState } from "react";
import { Upload } from "lucide-react";

import { Button } from "@/components/ui/button";
import { KnowledgeImportModal } from "@/components/knowledge/import/modal";
import type { KnowledgeImportContext } from "@/components/knowledge/import/modal/knowledge-import-modal.types";
import {
  KNOWLEDGE_IMPORT_DOCUMENT_ACCEPT,
} from "@/lib/knowledge/import/supported-formats";

type Props = {
  context: KnowledgeImportContext;
  label?: string;
  variant?: "default" | "outline" | "ghost";
};

export function KnowledgeUploadTrigger({
  context,
  label = "Subir",
  variant = "default",
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);

  const [open, setOpen] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const [sessionId, setSessionId] = useState(0);

  function handlePick() {
    inputRef.current?.click();
  }

  function handleFilesSelected(
    event: React.ChangeEvent<HTMLInputElement>,
  ) {
    const picked = Array.from(event.target.files ?? []);

    event.target.value = "";

    if (picked.length === 0) {
      return;
    }

    setSessionId((current) => current + 1);
    setFiles(picked);
    setOpen(true);
  }

  function handleOpenChange(nextOpen: boolean) {
    setOpen(nextOpen);

    if (!nextOpen) {
      setFiles([]);
    }
  }

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        multiple
        accept={KNOWLEDGE_IMPORT_DOCUMENT_ACCEPT}
        className="hidden"
        onChange={handleFilesSelected}
      />

      <Button
        type="button"
        variant={variant}
        onClick={handlePick}
      >
        <Upload className="mr-2 h-4 w-4" />
        {label}
      </Button>

      <KnowledgeImportModal
        key={sessionId}
        open={open}
        context={context}
        selectedFiles={files}
        onOpenChange={handleOpenChange}
        onCompleted={() => setFiles([])}
      />
    </>
  );
}