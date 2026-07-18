// components/knowledge/import/knowledge-import-flow.tsx
"use client";

import { useState } from "react";

import type { KnowledgeImportProposal } from "@/lib/knowledge/import/types";

import {
  runKnowledgeImportPipeline,
  type KnowledgeImportPipelineResult,
} from "./knowledge-import-api";
import { KnowledgeImportProposalView } from "./knowledge-import-proposal";
import { KnowledgeImportZone } from "./knowledge-import-zone";

type Props = {
  libraryId: string;
  libraryName: string;
  disabled?: boolean;
  onCreateArticle?: () => void;
};

type ImportStep =
  | "upload"
  | "proposal";

export function KnowledgeImportFlow({
  libraryId,
  libraryName,
  disabled = false,
  onCreateArticle,
}: Props) {
  const [step, setStep] =
    useState<ImportStep>("upload");

  const [importId, setImportId] =
    useState<string | null>(null);

  const [pipelineResult, setPipelineResult] =
    useState<KnowledgeImportPipelineResult | null>(
      null,
    );

  async function handleAnalyze({
    importId: nextImportId,
  }: {
    importId: string;
  }) {
    setImportId(nextImportId);

    const result =
      await runKnowledgeImportPipeline(
        nextImportId,
      );

    setPipelineResult(result);
    setStep("proposal");
  }

  function handleBack() {
    setStep("upload");
    setImportId(null);
    setPipelineResult(null);
  }

  if (
    step === "proposal" &&
    pipelineResult
  ) {
    return (
      <KnowledgeImportProposalView
        proposal={
          pipelineResult.proposal
        }
        onBack={handleBack}
      />
    );
  }

  return (
    <KnowledgeImportZone
      libraryId={libraryId}
      libraryName={libraryName}
      disabled={disabled}
      onCreateArticle={
        onCreateArticle
      }
      onAnalyze={handleAnalyze}
    />
  );
}