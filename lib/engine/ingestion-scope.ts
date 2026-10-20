/**
 * Pure scope consistency check. This does NOT authorize a user:
 * callers must separately verify active workspace membership and write access.
 */
export type EngineIngestionScope = {
  sourceWorkspaceId: string;
  targetWorkspaceId: string;
};

export type EngineIngestionScopeDecision =
  | { allowed: true }
  | { allowed: false; reason: "WORKSPACE_MISMATCH" | "MISSING_WORKSPACE" };

export function checkEngineIngestionScope(scope: EngineIngestionScope): EngineIngestionScopeDecision {
  if (!scope.sourceWorkspaceId || !scope.targetWorkspaceId) {
    return { allowed: false, reason: "MISSING_WORKSPACE" };
  }
  if (scope.sourceWorkspaceId !== scope.targetWorkspaceId) {
    return { allowed: false, reason: "WORKSPACE_MISMATCH" };
  }
  return { allowed: true };
}
