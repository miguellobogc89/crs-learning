// lib/services/knowledge-team.service.ts
import {
  addKnowledgeTeamMember,
  createKnowledgeTeam,
  findUserByEmail,
  listKnowledgeTeamsForUser,
  shareLibraryWithTeam,
  listLibraryTeamShares,
removeLibraryTeamShare,
} from "@/lib/repositories/knowledge-team.repository";

export async function createTeam(data: {
  ownerUserId: string;
  name: string;
  description?: string;
}) {
  return createKnowledgeTeam(data);
}

export async function listTeams(userId: string) {
  return listKnowledgeTeamsForUser(userId);
}

export async function addMemberToTeam(data: {
  teamId: string;
  email: string;
  role?: string;
}) {
  const user = await findUserByEmail(data.email);

  if (!user) {
    throw new Error("User not found");
  }

  return addKnowledgeTeamMember({
    teamId: data.teamId,
    userId: user.id,
    role: data.role ?? "member",
  });
}

export async function shareLibraryWithKnowledgeTeam(data: {
  libraryId: string;
  teamId: string;
  ownerUserId: string;
  accessLevel: "read" | "edit" | "owner";
}) {
  return shareLibraryWithTeam(data);
}

export async function listTeamSharesForLibrary(data: {
  libraryId: string;
  ownerUserId: string;
}) {
  return listLibraryTeamShares(data);
}

export async function removeTeamShareFromLibrary(data: {
  libraryId: string;
  teamId: string;
  ownerUserId: string;
}) {
  return removeLibraryTeamShare(data);
}