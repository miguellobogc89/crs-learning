// components/knowledge/intake/modal/knowledge-intake-proposal-step.tsx

import { KnowledgeIntakeProposal as KnowledgeIntakeProposalView } from "@/components/knowledge/intake/knowledge-intake-proposal";
import type { KnowledgeIntakeProposal } from "@/lib/knowledge/intake/types";

type Props = {
  proposal: KnowledgeIntakeProposal;
  isConfirming: boolean;
  error: string | null;
  onBack: () => void;
  onConfirm: () => void;
};

export function KnowledgeIntakeProposalStep({ proposal, isConfirming, error, onBack, onConfirm }: Props) {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {error ? <div className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div> : null}
      <KnowledgeIntakeProposalView proposal={proposal} isConfirming={isConfirming} onBack={onBack} onConfirm={onConfirm} />
    </div>
  );
}
