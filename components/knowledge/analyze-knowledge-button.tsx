// components/knowledge/analyze-knowledge-button.tsx
"use client";

import { useState } from "react";
import { Loader2, Sparkles } from "lucide-react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";

export function AnalyzeKnowledgeButton({
  knowledgeSourceId,
}: {
  knowledgeSourceId: string;
}) {
  const router = useRouter();
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  async function handleAnalyze() {
    setIsAnalyzing(true);

    const response = await fetch(`/api/knowledge/${knowledgeSourceId}/analyze`, {
      method: "POST",
    });

    setIsAnalyzing(false);

    if (!response.ok) {
      alert("No se pudo analizar el Knowledge.");
      router.refresh();
      return;
    }

    router.refresh();
  }

  return (
    <div className="space-y-2">
      <Button
        type="button"
        onClick={handleAnalyze}
        disabled={isAnalyzing}
        className="bg-brand text-primary-foreground hover:bg-brand-hover"
      >
        {isAnalyzing ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Sparkles className="h-4 w-4" />
        )}
        {isAnalyzing ? "Analizando..." : "Analizar Knowledge"}
      </Button>

      {isAnalyzing && (
        <div className="space-y-1">
          <div className="h-1.5 overflow-hidden rounded-full bg-surface">
            <div className="h-full w-2/3 animate-pulse rounded-full bg-brand" />
          </div>
          <p className="text-xs text-muted-foreground">
            La IA está comprendiendo el contenido para reutilizarlo después.
          </p>
        </div>
      )}
    </div>
  );
}