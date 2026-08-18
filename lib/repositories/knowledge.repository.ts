// lib/repositories/knowledge.repository.ts
import { prisma } from "@/lib/prisma";
import {
  knowledgeSourceReadWhere,
} from "@/lib/knowledge/access-control";

const knowledgeSourceDetailInclude = {
  knowledge_files: {
    orderBy: {
      created_at: "desc",
    },
    include: {
      users: {
        select: {
          id: true,
          name: true,
          image: true,
        },
      },
      knowledge_file_analysis: true,
    },
  },
  knowledge_analysis: true,
  knowledge_graph: true,
  users_knowledge_sources_updated_by_user_idTousers: {
    select: {
      id: true,
      name: true,
      email: true,
      image: true,
    },
  },
  knowledge_libraries: {
    include: {
      knowledge_library_permissions: true,
      knowledge_library_team_permissions: {
        include: {
          knowledge_teams: {
            include: {
              knowledge_team_members: true,
            },
          },
        },
      },
    },
  },
} as const;

export async function getVisibleKnowledgeSources(
  userId: string,
  workspaceId: string,
) {
  return prisma.knowledge_sources.findMany({
    where: knowledgeSourceReadWhere(userId, workspaceId),
    include: {
      knowledge_libraries: {
        include: {
          knowledge_library_team_permissions: {
            include: {
              knowledge_teams: true,
            },
          },
        },
      },
    },
    orderBy: {
      updated_at: "desc",
    },
  });
}

export async function getKnowledgeSourceById(id: string) {
  return prisma.knowledge_sources.findUnique({
    where: { id },
    include: knowledgeSourceDetailInclude,
  });
}

export async function getAccessibleKnowledgeSourceById(
  id: string,
  userId: string,
  workspaceId: string,
) {
  return prisma.knowledge_sources.findFirst({
    where: {
      id,
      AND: [knowledgeSourceReadWhere(userId, workspaceId)],
    },
    include: knowledgeSourceDetailInclude,
  });
}

export async function createKnowledgeSource(data: {
  ownerUserId: string;
  title: string;
  description: string;
  visibility: string;
  libraryId: string;
}) {
  return prisma.knowledge_sources.create({
data: {
  owner_user_id: data.ownerUserId,
  library_id: data.libraryId,
  title: data.title,
  description: data.description,
  visibility: data.visibility,
  content: "",
  status: "draft",
},
  });
}

export async function updateKnowledgeSource(data: {
  id: string;
  ownerUserId: string;
  workspaceId: string;
  updatedByUserId: string;
  title: string;
  description: string;
  visibility: string;
  knowledgeType: string;
  content: string;
}) {
  return prisma.knowledge_sources.updateMany({
    where: {
      AND: [
        {
          id: data.id,
          owner_user_id: data.ownerUserId,
        },
        knowledgeSourceReadWhere(
          data.ownerUserId,
          data.workspaceId,
        ),
      ],
    },
    data: {
      title: data.title,
      description: data.description,
      visibility: data.visibility,
      knowledge_type: data.knowledgeType,
      content: data.content,
      updated_by_user_id: data.updatedByUserId,
      updated_at: new Date(),
    },
  });
}

export async function createKnowledgeFile(data: {
  knowledgeSourceId: string;
  fileName: string;
  fileType: string;
  fileSize: number;
  storagePath: string;
  extractedText: string;
}) {
  return prisma.knowledge_files.create({
    data: {
      knowledge_source_id: data.knowledgeSourceId,
      file_name: data.fileName,
      file_type: data.fileType,
      file_size: data.fileSize,
      storage_path: data.storagePath,
      extracted_text: data.extractedText,
      status: "processed",
    },
  });
}

export async function getKnowledgeEvents(
  userId: string,
  workspaceId: string,
) {
  return prisma.knowledge_events.findMany({
    where: {
      user_id: userId,
      OR: [
        {
          library_id: null,
        },
        {
          knowledge_libraries: {
            workspace_id: workspaceId,
          },
        },
      ],
    },
    include: {
      users: {
        select: {
          id: true,
          name: true,
          image: true,
        },
      },
    },
    orderBy: {
      created_at: "desc",
    },
    take: 100,
  });
}
