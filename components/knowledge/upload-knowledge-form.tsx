// components/knowledge/upload-knowledge-form.tsx
"use client";

import { useTransition } from "react";

import { uploadKnowledgeFileAction } from "@/app/actions/knowledge";
import { Button } from "@/components/ui/button";
import { UploadZone } from "@/components/knowledge/upload-zone";

type Props = {
  knowledgeId: string;
};

export function UploadKnowledgeForm({ knowledgeId }: Props) {
  const [isPending, startTransition] = useTransition();

  function handleSubmit(formData: FormData) {
    startTransition(async () => {
      await uploadKnowledgeFileAction(formData);
    });
  }

  return (
    <form action={handleSubmit}>
      <input type="hidden" name="knowledgeId" value={knowledgeId} />

      <UploadZone accept=".pdf,.txt,.md,.csv,.docx,.xlsx,.pptx" />

      {isPending && (
        <div className="mt-4 space-y-2">
          <div className="h-2 overflow-hidden rounded-full bg-muted">
            <div className="h-full w-2/3 animate-pulse rounded-full bg-primary" />
          </div>

          <p className="text-xs text-muted-foreground">
            Subiendo y analizando documentos...
          </p>
        </div>
      )}

      <div className="mt-4 flex justify-end">
        <Button type="submit" disabled={isPending}>
          {isPending ? "Procesando..." : "Subir documentos"}
        </Button>
      </div>
    </form>
  );
}