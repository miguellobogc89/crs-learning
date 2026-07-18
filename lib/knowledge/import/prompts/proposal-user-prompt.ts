// lib/knowledge/import/prompts/proposal-user-prompt.ts
export function buildProposalPrompt(
  documents: Array<{
    id: string;
    name: string;
    path: string;
    text: string;
  }>,
) {
  return `
Estos son los documentos disponibles.

${JSON.stringify(documents)}

Genera una propuesta completa utilizando este formato:

{
  "summary": {},
  "folders": [],
  "rootArticles": [],
  "warnings": []
}

No añadas texto adicional.
`;
}