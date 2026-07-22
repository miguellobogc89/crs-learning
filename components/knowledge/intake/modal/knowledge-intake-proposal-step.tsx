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

export function KnowledgeIntakeProposalStep({
  proposal,
  isConfirming,
  error,
}: Props) {
  return (
    <div className="flex h-full min-h-0 flex-col">
      {error ? (
        <div className="mb-3 shrink-0 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      <div className="min-h-0 flex-1 overflow-y-auto pr-2">
        <KnowledgeIntakeProposalView
          proposal={proposal}
          isConfirming={isConfirming}
        />
      </div>
    </div>
  );
}