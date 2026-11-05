// lib/tenders/service.ts
import "server-only";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  CONTRACT_TYPE_LABELS,
  PROCEDURE_LABELS,
  type TenderKind,
} from "./placsp";

export const REVIEW_STATUSES = ["Nueva", "Interesa", "Preparando", "Presentada", "Descartada"] as const;
export type ReviewStatus = (typeof REVIEW_STATUSES)[number];

export const PAGE_SIZE = 50;

export type TenderFilters = {
  q?: string;
  kind?: TenderKind | "todos";
  scope?: "software" | "todo";
  province?: string;
  review?: ReviewStatus | "todas" | "pendientes";
  sort?: "plazo" | "importe" | "recientes";
  page?: number;
};

export type TenderRow = {
  id: string;
  title: string;
  url: string | null;
  kind: string;
  kindLabel: string;
  isSoftware: boolean;
  contractingBody: string | null;
  contractType: string | null;
  procedure: string | null;
  amount: number | null;
  amountWithTax: number | null;
  cpvCodes: string[];
  province: string | null;
  city: string | null;
  deadline: string | null;
  folderId: string | null;
  review: { status: ReviewStatus; notes: string | null; updatedAt: string } | null;
};

const KIND_LABELS: Record<string, string> = {
  menor: "Contrato menor",
  abreviado: "Simplificado abreviado (< 60.000 €)",
  simplificado: "Simplificado (hasta 140.000 €)",
};

function num(v: Prisma.Decimal | null) {
  return v === null ? null : Number(v);
}

export function normalizeFilters(params: URLSearchParams): TenderFilters {
  const pick = <T extends string>(value: string | null, allowed: readonly T[], fallback: T): T =>
    value && (allowed as readonly string[]).includes(value) ? (value as T) : fallback;
  return {
    q: (params.get("q") || "").trim().slice(0, 120) || undefined,
    kind: pick(params.get("kind"), ["todos", "menor", "abreviado", "simplificado"] as const, "todos"),
    scope: pick(params.get("scope"), ["software", "todo"] as const, "software"),
    province: (params.get("province") || "").trim().slice(0, 80) || undefined,
    review: pick(
      params.get("review"),
      ["todas", "pendientes", ...REVIEW_STATUSES] as const,
      "pendientes",
    ),
    sort: pick(params.get("sort"), ["plazo", "importe", "recientes"] as const, "plazo"),
    page: Math.max(1, Math.min(200, Number(params.get("page")) || 1)),
  };
}

export async function listTenders(workspaceId: string, f: TenderFilters, now = new Date()) {
  const where: Prisma.public_tendersWhereInput = {
    status: "PUB",
    OR: [{ deadline: null }, { deadline: { gt: now } }],
    kind: f.kind && f.kind !== "todos" ? f.kind : { in: ["menor", "abreviado", "simplificado"] },
    ...(f.scope !== "todo" ? { is_software: true } : {}),
    ...(f.province ? { province: { equals: f.province, mode: "insensitive" } } : {}),
  };
  const and: Prisma.public_tendersWhereInput[] = [];
  if (f.q)
    and.push({
      OR: [
        { title: { contains: f.q, mode: "insensitive" } },
        { contracting_body: { contains: f.q, mode: "insensitive" } },
        { folder_id: { contains: f.q, mode: "insensitive" } },
        { cpv_codes: { has: f.q } },
      ],
    });
  if (f.review === "pendientes")
    and.push({
      NOT: {
        reviews: { some: { workspace_id: workspaceId, status: { in: ["Descartada", "Presentada"] } } },
      },
    });
  else if (f.review && f.review !== "todas") {
    if (f.review === "Nueva")
      and.push({
        NOT: { reviews: { some: { workspace_id: workspaceId, status: { not: "Nueva" } } } },
      });
    else and.push({ reviews: { some: { workspace_id: workspaceId, status: f.review } } });
  }
  if (and.length) where.AND = and;

  const orderBy: Prisma.public_tendersOrderByWithRelationInput[] =
    f.sort === "importe"
      ? [{ estimated_amount: { sort: "desc", nulls: "last" } }, { deadline: "asc" }]
      : f.sort === "recientes"
        ? [{ source_updated_at: { sort: "desc", nulls: "last" } }]
        : [{ deadline: { sort: "asc", nulls: "last" } }];

  const page = f.page ?? 1;
  const [total, rows, provinces] = await Promise.all([
    prisma.public_tenders.count({ where }),
    prisma.public_tenders.findMany({
      where,
      orderBy,
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: { reviews: { where: { workspace_id: workspaceId }, take: 1 } },
    }),
    prisma.public_tenders.findMany({
      where: { status: "PUB", OR: [{ deadline: null }, { deadline: { gt: now } }], province: { not: null } },
      distinct: ["province"],
      select: { province: true },
      orderBy: { province: "asc" },
    }),
  ]);

  const items: TenderRow[] = rows.map((r) => {
    const review = r.reviews[0];
    return {
      id: r.id,
      title: r.title,
      url: r.url,
      kind: r.kind,
      kindLabel: KIND_LABELS[r.kind] ?? r.kind,
      isSoftware: r.is_software,
      contractingBody: r.contracting_body,
      contractType: r.contract_type ? CONTRACT_TYPE_LABELS[r.contract_type] ?? r.contract_type : null,
      procedure: r.procedure_code ? PROCEDURE_LABELS[r.procedure_code] ?? r.procedure_code : null,
      amount: num(r.estimated_amount) ?? num(r.budget_without_tax),
      amountWithTax: num(r.budget_with_tax),
      cpvCodes: r.cpv_codes,
      province: r.province,
      city: r.city,
      deadline: r.deadline?.toISOString() ?? null,
      folderId: r.folder_id,
      review: review
        ? {
            status: (REVIEW_STATUSES as readonly string[]).includes(review.status)
              ? (review.status as ReviewStatus)
              : "Nueva",
            notes: review.notes,
            updatedAt: review.updated_at.toISOString(),
          }
        : null,
    };
  });

  return {
    items,
    total,
    page,
    pageSize: PAGE_SIZE,
    provinces: provinces.map((p) => p.province).filter((p): p is string => !!p),
  };
}

export async function saveReview(
  workspaceId: string,
  userId: string,
  input: { tenderId: unknown; status: unknown; notes: unknown },
) {
  const tenderId = typeof input.tenderId === "string" ? input.tenderId : "";
  if (!/^[0-9a-f-]{36}$/i.test(tenderId)) throw new Error("Licitación no válida");
  const status = typeof input.status === "string" ? input.status : "Nueva";
  if (!(REVIEW_STATUSES as readonly string[]).includes(status)) throw new Error("Estado no válido");
  const notes =
    typeof input.notes === "string" ? input.notes.trim().slice(0, 4000) || null : null;
  const exists = await prisma.public_tenders.count({ where: { id: tenderId } });
  if (!exists) throw new Error("La licitación ya no existe");
  const data = { status, notes, updated_by: userId, updated_at: new Date() };
  const saved = await prisma.tender_reviews.upsert({
    where: { workspace_id_tender_id: { workspace_id: workspaceId, tender_id: tenderId } },
    create: { workspace_id: workspaceId, tender_id: tenderId, ...data },
    update: data,
  });
  return { status: saved.status, notes: saved.notes, updatedAt: saved.updated_at.toISOString() };
}
