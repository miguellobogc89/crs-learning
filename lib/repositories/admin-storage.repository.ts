import { prisma } from "@/lib/prisma";

export interface StorageFileWithDetails {
  id: string;
  fileName: string;
  fileSize: number | null;
  fileSizeGB: string;
  fileType: string | null;
  status: string;
  createdAt: Date;
  updatedAt: Date;
  uploadedByUser: {
    id: string;
    email: string;
    name: string | null;
  } | null;
  knowledgeSource: {
    id: string;
    title: string;
    status: string;
  };
  library: {
    id: string;
    name: string;
    workspace: {
      id: string;
      name: string;
    } | null;
  };
  analysis: {
    status: string;
    errorMessage: string | null;
    tokensInput: number | null;
    tokensOutput: number | null;
  } | null;
}

export interface StorageStats {
  totalStorageBytes: number;
  totalStorageGB: string;
  totalFiles: number;
  averageFileSizeBytes: number;
  averageFileSizeKB: string;
  topUserByStorage: {
    userId: string;
    userName: string | null;
    userEmail: string;
    storageBytes: number;
    fileCount: number;
  } | null;
  topWorkspaceByStorage: {
    workspaceId: string;
    workspaceName: string;
    storageBytes: number;
    fileCount: number;
  } | null;
}

export interface StorageFileFilter {
  search?: string;
  userId?: string;
  workspaceId?: string;
  fileType?: string;
  status?: string;
  orderBy?: "fileName" | "fileSize" | "createdAt";
  orderDirection?: "asc" | "desc";
}

/**
 * Get all storage files with optional filtering
 */
export async function getAllStorageFiles(
  filter: StorageFileFilter = {},
): Promise<StorageFileWithDetails[]> {
  const {
    search,
    userId,
    workspaceId,
    fileType,
    status,
    orderBy = "createdAt",
    orderDirection = "desc",
  } = filter;

  let orderByObj: Record<string, string> = {};

  if (orderBy === "fileName") {
    orderByObj = { file_name: orderDirection };
  } else if (orderBy === "fileSize") {
    orderByObj = { file_size: orderDirection };
  } else {
    orderByObj = { created_at: orderDirection };
  }

  const files = await prisma.knowledge_files.findMany({
    where: {
      ...(search && {
        file_name: {
          contains: search,
          mode: "insensitive",
        },
      }),
      ...(userId && {
        uploaded_by_user_id: userId,
      }),
      ...(fileType && {
        file_type: fileType,
      }),
      ...(status && {
        status: status,
      }),
      ...(workspaceId && {
        knowledge_sources: {
          knowledge_libraries: {
            workspace_id: workspaceId,
          },
        },
      }),
    },
    select: {
      id: true,
      file_name: true,
      file_size: true,
      file_type: true,
      status: true,
      created_at: true,
      updated_at: true,
      uploaded_by_user_id: true,
      knowledge_source_id: true,
      users: {
        select: {
          id: true,
          email: true,
          name: true,
        },
      },
      knowledge_sources: {
        select: {
          id: true,
          title: true,
          status: true,
          knowledge_libraries: {
            select: {
              id: true,
              name: true,
              workspace_id: true,
              workspaces: {
                select: {
                  id: true,
                  name: true,
                },
              },
            },
          },
        },
      },
      knowledge_file_analysis: {
        select: {
          status: true,
          error_message: true,
          tokens_input: true,
          tokens_output: true,
        },
      },
    },
    orderBy: orderByObj,
  });

  return files.map((file) => ({
    id: file.id,
    fileName: file.file_name,
    fileSize: file.file_size,
    fileSizeGB: ((file.file_size || 0) / (1024 ** 3)).toFixed(2),
    fileType: file.file_type,
    status: file.status,
    createdAt: file.created_at,
    updatedAt: file.updated_at,
    uploadedByUser: file.users ? {
      id: file.users.id,
      email: file.users.email,
      name: file.users.name,
    } : null,
    knowledgeSource: {
      id: file.knowledge_sources.id,
      title: file.knowledge_sources.title,
      status: file.knowledge_sources.status,
    },
    library: {
      id: file.knowledge_sources.knowledge_libraries!.id,
      name: file.knowledge_sources.knowledge_libraries!.name,
      workspace: file.knowledge_sources.knowledge_libraries!.workspaces,
    },
    analysis: file.knowledge_file_analysis ? {
      status: file.knowledge_file_analysis.status,
      errorMessage: file.knowledge_file_analysis.error_message,
      tokensInput: file.knowledge_file_analysis.tokens_input,
      tokensOutput: file.knowledge_file_analysis.tokens_output,
    } : null,
  }));
}

/**
 * Get storage statistics
 */
export async function getStorageStats(): Promise<StorageStats> {
  // Get all files for calculation
  const allFiles = await prisma.knowledge_files.findMany({
    select: {
      id: true,
      file_size: true,
      uploaded_by_user_id: true,
      users: {
        select: {
          id: true,
          email: true,
          name: true,
        },
      },
      knowledge_sources: {
        select: {
          knowledge_libraries: {
            select: {
              workspace_id: true,
              workspaces: {
                select: {
                  id: true,
                  name: true,
                },
              },
            },
          },
        },
      },
    },
  });

  // Calculate totals
  const totalStorageBytes = allFiles.reduce(
    (sum, file) => sum + (file.file_size || 0),
    0,
  );

  const totalFiles = allFiles.length;
  const averageFileSizeBytes = totalFiles > 0
    ? Math.round(totalStorageBytes / totalFiles)
    : 0;

  // Calculate top user by storage
  const userStorageMap = new Map<
    string,
    { email: string; name: string | null; bytes: number; count: number }
  >();

  for (const file of allFiles) {
    if (!file.uploaded_by_user_id || !file.users) {
      continue;
    }

    const key = file.users.id;

    const existing = userStorageMap.get(key) || {
      email: file.users.email,
      name: file.users.name,
      bytes: 0,
      count: 0,
    };

    userStorageMap.set(key, {
      ...existing,
      bytes: existing.bytes + (file.file_size || 0),
      count: existing.count + 1,
    });
  }

  let topUserByStorage: StorageStats["topUserByStorage"] = null;

  if (userStorageMap.size > 0) {
    const users = Array.from(userStorageMap.entries()).sort(
      (a, b) => b[1].bytes - a[1].bytes,
    );

    const [topUserId, topUserData] = users[0]!;

    topUserByStorage = {
      userId: topUserId,
      userName: topUserData.name,
      userEmail: topUserData.email,
      storageBytes: topUserData.bytes,
      fileCount: topUserData.count,
    };
  }

  // Calculate top workspace by storage
  const workspaceStorageMap = new Map<
    string,
    { name: string; bytes: number; count: number }
  >();

  for (const file of allFiles) {
    const workspace = file.knowledge_sources.knowledge_libraries?.workspaces;

    if (!workspace) {
      continue;
    }

    const key = workspace.id;

    const existing = workspaceStorageMap.get(key) || {
      name: workspace.name,
      bytes: 0,
      count: 0,
    };

    workspaceStorageMap.set(key, {
      ...existing,
      bytes: existing.bytes + (file.file_size || 0),
      count: existing.count + 1,
    });
  }

  let topWorkspaceByStorage: StorageStats["topWorkspaceByStorage"] = null;

  if (workspaceStorageMap.size > 0) {
    const workspaces = Array.from(workspaceStorageMap.entries()).sort(
      (a, b) => b[1].bytes - a[1].bytes,
    );

    const [topWorkspaceId, topWorkspaceData] = workspaces[0]!;

    topWorkspaceByStorage = {
      workspaceId: topWorkspaceId,
      workspaceName: topWorkspaceData.name,
      storageBytes: topWorkspaceData.bytes,
      fileCount: topWorkspaceData.count,
    };
  }

  return {
    totalStorageBytes,
    totalStorageGB: (totalStorageBytes / (1024 ** 3)).toFixed(2),
    totalFiles,
    averageFileSizeBytes,
    averageFileSizeKB: (averageFileSizeBytes / 1024).toFixed(2),
    topUserByStorage,
    topWorkspaceByStorage,
  };
}

/**
 * Get single file details
 */
export async function getStorageFileDetail(
  fileId: string,
): Promise<StorageFileWithDetails | null> {
  const file = await prisma.knowledge_files.findUnique({
    where: { id: fileId },
    select: {
      id: true,
      file_name: true,
      file_size: true,
      file_type: true,
      status: true,
      created_at: true,
      updated_at: true,
      uploaded_by_user_id: true,
      storage_path: true,
      users: {
        select: {
          id: true,
          email: true,
          name: true,
        },
      },
      knowledge_sources: {
        select: {
          id: true,
          title: true,
          status: true,
          knowledge_libraries: {
            select: {
              id: true,
              name: true,
              workspace_id: true,
              workspaces: {
                select: {
                  id: true,
                  name: true,
                },
              },
            },
          },
        },
      },
      knowledge_file_analysis: {
        select: {
          status: true,
          error_message: true,
          tokens_input: true,
          tokens_output: true,
          created_at: true,
        },
      },
    },
  });

  if (!file) {
    return null;
  }

  return {
    id: file.id,
    fileName: file.file_name,
    fileSize: file.file_size,
    fileSizeGB: ((file.file_size || 0) / (1024 ** 3)).toFixed(2),
    fileType: file.file_type,
    status: file.status,
    createdAt: file.created_at,
    updatedAt: file.updated_at,
    uploadedByUser: file.users ? {
      id: file.users.id,
      email: file.users.email,
      name: file.users.name,
    } : null,
    knowledgeSource: {
      id: file.knowledge_sources.id,
      title: file.knowledge_sources.title,
      status: file.knowledge_sources.status,
    },
    library: {
      id: file.knowledge_sources.knowledge_libraries!.id,
      name: file.knowledge_sources.knowledge_libraries!.name,
      workspace: file.knowledge_sources.knowledge_libraries!.workspaces,
    },
    analysis: file.knowledge_file_analysis ? {
      status: file.knowledge_file_analysis.status,
      errorMessage: file.knowledge_file_analysis.error_message,
      tokensInput: file.knowledge_file_analysis.tokens_input,
      tokensOutput: file.knowledge_file_analysis.tokens_output,
    } : null,
  };
}

/**
 * Get unique values for filtering
 */
export async function getStorageFilterOptions() {
  const [users, fileTypes, statuses] = await Promise.all([
    prisma.knowledge_files.findMany({
      where: {
        uploaded_by_user_id: {
          not: null,
        },
      },
      distinct: ["uploaded_by_user_id"],
      select: {
        users: {
          select: {
            id: true,
            email: true,
            name: true,
          },
        },
      },
    }),
    prisma.knowledge_files.findMany({
      distinct: ["file_type"],
      select: {
        file_type: true,
      },
      where: {
        file_type: {
          not: null,
        },
      },
    }),
    prisma.knowledge_files.findMany({
      distinct: ["status"],
      select: {
        status: true,
      },
    }),
  ]);

  const workspaces = await prisma.workspaces.findMany({
    select: {
      id: true,
      name: true,
    },
    where: {
      knowledge_libraries: {
        some: {
          knowledge_sources: {
            some: {
              knowledge_files: {
                some: {},
              },
            },
          },
        },
      },
    },
  });

  return {
    users: users
      .filter((u) => u.users)
      .map((u) => u.users!),
    fileTypes: fileTypes
      .map((t) => t.file_type)
      .filter(Boolean) as string[],
    statuses: statuses.map((s) => s.status),
    workspaces,
  };
}
