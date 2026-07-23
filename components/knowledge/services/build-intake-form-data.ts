// components/knowledge/services/build-intake-form-data.ts

import type { KnowledgeIntakeProposal } from "@/lib/knowledge/intake/types";

import type { KnowledgeIntakeContext } from "../intake/modal/knowledge-intake-modal.types";
import type { SelectedKnowledgeDocument } from "./create-selected-documents";

type BuildIntakeFormDataParams = {
  context: KnowledgeIntakeContext;
  documents: SelectedKnowledgeDocument[];
  proposal?: KnowledgeIntakeProposal | null;
};

export function buildIntakeFormData({
  context,
  documents,
  proposal,
}: BuildIntakeFormDataParams) {
  const formData = new FormData();

  formData.set(
    "libraryId",
    context.libraryId,
  );

  formData.set(
    "origin",
    context.origin,
  );

  if (context.origin === "article") {
    formData.set(
      "articleId",
      context.articleId,
    );
  }

  formData.set(
    "documentIds",
    JSON.stringify(
      documents.map(
        (document) => document.id,
      ),
    ),
  );

  for (const document of documents) {
    formData.append(
      "files",
      document.file,
    );
  }

  if (proposal) {
    formData.set(
      "proposal",
      JSON.stringify(proposal),
    );
  }

  return formData;
}