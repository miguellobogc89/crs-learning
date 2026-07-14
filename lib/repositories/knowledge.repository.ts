// lib/repositories/knowledge.repository.ts
import { prisma } from "@/lib/prisma";

export async function getVisibleKnowledgeSources(userId: string) {
  return prisma.knowledge_sources.findMany({
    where: {
      OR: [
        {
          owner_user_id: userId,
        },
        {
          visibility: "public",
        },
        {
          knowledge_libraries: {
            owner_user_id: userId,
          },
        },
        {
          knowledge_libraries: {
            knowledge_library_permissions: {
              some: {
                user_id: userId,
              },
            },
          },
        },
        {
          knowledge_libraries: {
            knowledge_library_team_permissions: {
              some: {
                knowledge_teams: {
                  knowledge_team_members: {
                    some: {
                      user_id: userId,
                    },
                  },
                },
              },
            },
          },
        },
      ],
    },
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
    include: {
      knowledge_files: {
        orderBy: {
          created_at: "desc",
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
    },
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
  updatedByUserId: string;
  title: string;
  description: string;
  visibility: string;
  knowledgeType: string;
  content: string;
}) {
  return prisma.knowledge_sources.updateMany({
    where: {
      id: data.id,
      owner_user_id: data.ownerUserId,
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