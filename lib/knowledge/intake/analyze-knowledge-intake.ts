// lib/knowledge/intake/analyze-knowledge-intake.ts

import { buildKnowledgeIntakeProposal } from "./proposal-builder";
import { loadKnowledgeImportDocuments } from "./load-import-documents";
import { resolveKnowledgeIntakeContext } from "./resolve-intake-context";
import type {
  AnalyzeStoredKnowledgeIntakeInput,
  AnalyzeStoredKnowledgeIntakeResult,
} from "./types";

export async function analyzeKnowledgeIntake(
  input: AnalyzeStoredKnowledgeIntakeInput,
): Promise<AnalyzeStoredKnowledgeIntakeResult> {
  const resolvedContext =
    await resolveKnowledgeIntakeContext(
      input.context,
    );

  const documents =
    await loadKnowledgeImportDocuments(
      input.importId,
    );

  const proposal =
    await buildKnowledgeIntakeProposal({
      context: resolvedContext,
      originalContext: input.context,
      documents,
    });

  return {
    importId: input.importId,
    proposal,
  };
}