// components/knowledge/intake/knowledge-upload-trigger.tsx
"use client";

import { useRef, useState } from "react";
import { Upload } from "lucide-react";

import { Button } from "@/components/ui/button";
import { KnowledgeIntakeModal } from "@/components/knowledge/intake/modal";
import type { KnowledgeIntakeContext } from "@/components/knowledge/intake/modal/knowledge-intake-modal.types";

const ACCEPTED_FILE_TYPES = [".pdf", ".docx", ".xlsx", ".pptx", ".csv", ".txt"].join(",");

type Props = {
  context: KnowledgeIntakeContext;
  label?: string;
  variant?: "default" | "outline" | "ghost";
};

export function KnowledgeUploadTrigger({ context, label = "Subir", variant = "default" }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [files, setFiles] = useState<File[]>([]);

  function handlePick() {
    inputRef.current?.click();
  }

  function handleFilesSelected(event: React.ChangeEvent<HTMLInputElement>) {
    const picked = Array.from(event.target.files ?? []);
    event.target.value = ""; // permite volver a elegir el mismo archivo más adelante

    if (picked.length === 0) return;

    setFiles(picked);
    setOpen(true);
  }

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        multiple
        accept={ACCEPTED_FILE_TYPES}
        className="hidden"
        onChange={handleFilesSelected}
      />

      <Button type="button" variant={variant} onClick={handlePick}>
        <Upload className="mr-2 h-4 w-4" />
        {label}
      </Button>

      <KnowledgeIntakeModal
        open={open}
        context={context}
        selectedFiles={files}
        onOpenChange={setOpen}
        onCompleted={() => setFiles([])}
      />
    </>
  );
}