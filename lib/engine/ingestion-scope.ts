/**
 * The knowledge importer is workspace-scoped; the initial Data Engine schema
 * is organization-scoped. Never infer a workspace from a user's primary org.
 *
 * This guard intentionally disables automatic writes until engine records
 * have a durable workspace scope and the permission model is migrated.
 */
export type EngineIngestionScope = {
  workspaceId: string;
  workspaceOrganizationId: string | null;
  engineOrganizationId: string;
};

export type EngineIngestionScopeDecision =
  | { allowed: false; reason: "PERSONAL_WORKSPACE" | "ORGANIZATION_MISMATCH" | "WORKSPACE_SCOPE_UNSUPPORTED" };

export function checkEngineIngestionScope(
  scope: EngineIngestionScope,
): EngineIngestionScopeDecision {
  if (!scope.workspaceOrganizationId) {
    return { allowed: false, reason: "PERSONAL_WORKSPACE" };
  }
  if (scope.workspaceOrganizationId !== scope.engineOrganizationId) {
    return { allowed: false, reason: "ORGANIZATION_MISMATCH" };
  }
  // Even matching organization IDs do not isolate sibling workspaces.
  return { allowed: false, reason: "WORKSPACE_SCOPE_UNSUPPORTED" };
}
