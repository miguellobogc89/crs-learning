// lib/services/knowledge-team.service.ts
import {
  addKnowledgeTeamMember,
  createKnowledgeTeam,
  findUserByEmail,
  listKnowledgeTeamsForWorkspace,
  shareLibraryWithTeam,
  listLibraryTeamShares,
removeLibraryTeamShare,
} from "@/lib/repositories/knowledge-team.repository";
import {
  assertPlanAllows,
  canCreateGroup,
} from "@/lib/services/entitlements.service";

export async function createTeam(data: {
  ownerUserId: string;
  workspaceId: string;
  name: string;
  description?: string;
}) {
  assertPlanAllows(
    await canCreateGroup(data.ownerUserId, data.workspaceId),
  );

  return createKnowledgeTeam(data);
}

export async function listTeams(data: {
  userId: string;
  workspaceId: string;
}) {
  return listKnowledgeTeamsForWorkspace(data);
}

export async function addMemberToTeam(data: {
  teamId: string;
  workspaceId: string;
  email: string;
  role?: string;
}) {
  const user = await findUserByEmail(data.email);

  if (!user) {
    throw new Error("User not found");
  }

  return addKnowledgeTeamMember({
    teamId: data.teamId,
    workspaceId: data.workspaceId,
    userId: user.id,
    role: data.role ?? "member",
  });
}

export async function shareLibraryWithKnowledgeTeam(data: {
  libraryId: string;
  teamId: string;
  ownerUserId: string;
  workspaceId: string;
  accessLevel: "read" | "edit" | "owner";
}) {
  return shareLibraryWithTeam(data);
}

export async function listTeamSharesForLibrary(data: {
  libraryId: string;
  ownerUserId: string;
  workspaceId: string;
}) {
  return listLibraryTeamShares(data);
}

export async function removeTeamShareFromLibrary(data: {
  libraryId: string;
  teamId: string;
  ownerUserId: string;
  workspaceId: string;
}) {
  return removeLibraryTeamShare(data);
}
