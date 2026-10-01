// lib/repositories/course.repository.ts
import type { Prisma, courses } from "@prisma/client";

import { prisma } from "@/lib/prisma";

const academyCourseSelect = {
  id: true,
  title: true,
  slug: true,
  description: true,
  level: true,
  category: true,
  thumbnail_url: true,
  company_id: true,
  sort_order: true,
  created_at: true,
  updated_at: true,
  sections: {
    select: {
      lessons: {
        select: {
          estimated_minutes: true,
        },
      },
    },
  },
} satisfies Prisma.coursesSelect;

const academyCourseWithProgressSelect = {
  ...academyCourseSelect,
  user_course_progress: {
    select: {
      status: true,
      progress_percent: true,
      started_at: true,
      completed_at: true,
      updated_at: true,
    },
  },
} satisfies Prisma.coursesSelect;

export type AcademyCourseRecord = Prisma.coursesGetPayload<{
  select: typeof academyCourseSelect;
}>;

export type AcademyCourseWithProgressRecord =
  Prisma.coursesGetPayload<{
    select: typeof academyCourseWithProgressSelect;
  }>;

export type AcademyAssignmentRecord =
  Prisma.course_assignmentsGetPayload<{
    include: {
      courses: {
        select: typeof academyCourseWithProgressSelect;
      };
    };
  }>;

export type AcademyCourseRequestRecord =
  Prisma.course_requestsGetPayload<{
    select: {
      id: true;
      title: true;
      description: true;
      status: true;
      created_at: true;
      requested_by_user_id: true;
      _count: {
        select: {
          course_request_votes: true;
        };
      };
    };
  }>;

export async function getCourses(): Promise<courses[]> {
  return prisma.courses.findMany({
    orderBy: {
      created_at: "desc",
    },
  });
}

function academyCompanyCourseWhere(
  companyId: string | null,
): Prisma.coursesWhereInput {
  return companyId
    ? {
        OR: [
          {
            company_id: companyId,
          },
          {
            company_id: null,
          },
        ],
      }
    : {
        company_id: null,
      };
}

export async function getAcademyUserScope(userId: string) {
  return prisma.users.findUnique({
    where: {
      id: userId,
    },
    select: {
      id: true,
      company_id: true,
    },
  });
}

export async function getPublishedCoursesForUserCompany(data: {
  companyId: string | null;
  userId: string;
  limit?: number;
}): Promise<AcademyCourseWithProgressRecord[]> {
  return prisma.courses.findMany({
    where: {
      is_published: true,
      ...academyCompanyCourseWhere(data.companyId),
    },
    orderBy: [
      {
        sort_order: "asc",
      },
      {
        updated_at: "desc",
      },
    ],
    take: data.limit,
    select: {
      ...academyCourseWithProgressSelect,
      user_course_progress: {
        where: {
          user_id: data.userId,
        },
        select: {
          status: true,
          progress_percent: true,
          started_at: true,
          completed_at: true,
          updated_at: true,
        },
        take: 1,
      },
    },
  });
}

export async function getUserCourseProgress(data: {
  userId: string;
  companyId: string | null;
}): Promise<AcademyCourseWithProgressRecord[]> {
  return prisma.courses.findMany({
    where: {
      is_published: true,
      ...academyCompanyCourseWhere(data.companyId),
      user_course_progress: {
        some: {
          user_id: data.userId,
        },
      },
    },
    orderBy: {
      updated_at: "desc",
    },
    select: {
      ...academyCourseWithProgressSelect,
      user_course_progress: {
        where: {
          user_id: data.userId,
        },
        select: {
          status: true,
          progress_percent: true,
          started_at: true,
          completed_at: true,
          updated_at: true,
        },
        take: 1,
      },
    },
  });
}

export async function getUserCourseAssignments(data: {
  userId: string;
  companyId: string | null;
  limit?: number;
}): Promise<AcademyAssignmentRecord[]> {
  return prisma.course_assignments.findMany({
    where: {
      user_id: data.userId,
      courses: {
        is_published: true,
        ...academyCompanyCourseWhere(data.companyId),
      },
    },
    orderBy: [
      {
        due_at: {
          sort: "asc",
          nulls: "last",
        },
      },
      {
        assigned_at: "desc",
      },
    ],
    take: data.limit,
    include: {
      courses: {
        select: {
          ...academyCourseWithProgressSelect,
          user_course_progress: {
            where: {
              user_id: data.userId,
            },
            select: {
              status: true,
              progress_percent: true,
              started_at: true,
              completed_at: true,
              updated_at: true,
            },
            take: 1,
          },
        },
      },
    },
  });
}

export async function getCompanyCourseRequests(data: {
  companyId: string | null;
  limit?: number;
}): Promise<AcademyCourseRequestRecord[]> {
  if (!data.companyId) {
    return [];
  }

  return prisma.course_requests.findMany({
    where: {
      company_id: data.companyId,
      status: "open",
    },
    orderBy: [
      {
        course_request_votes: {
          _count: "desc",
        },
      },
      {
        created_at: "desc",
      },
    ],
    take: data.limit,
    select: {
      id: true,
      title: true,
      description: true,
      status: true,
      created_at: true,
      requested_by_user_id: true,
      _count: {
        select: {
          course_request_votes: true,
        },
      },
    },
  });
}

export async function getUserVotedCourseRequestIds(data: {
  userId: string;
  requestIds: string[];
}) {
  if (data.requestIds.length === 0) {
    return new Set<string>();
  }

  const votes = await prisma.course_request_votes.findMany({
    where: {
      user_id: data.userId,
      request_id: {
        in: data.requestIds,
      },
    },
    select: {
      request_id: true,
    },
  });

  return new Set(votes.map((vote) => vote.request_id));
}

export async function createCourse(data: {
  title: string;
  description: string;
  level: string;
}) {
  return prisma.courses.create({
    data: {
      title: data.title,
      slug: crypto.randomUUID(),
      description: data.description,
      level: data.level,
      is_published: false,
    },
  });
}
