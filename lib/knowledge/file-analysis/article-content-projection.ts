// lib/knowledge/file-analysis/article-content-projection.ts

import {
  KNOWLEDGE_FILE_ANALYSIS_SCHEMA_VERSION,
  type KnowledgeFileCanonicalAnalysis,
  type KnowledgeFileAnalysisElement,
  type KnowledgeFileSemanticModel,
  type KnowledgeSemanticEdge,
  type KnowledgeSemanticEntity,
  type KnowledgeSemanticEvidence,
} from "./types";

type RecordValue = Record<string, unknown>;

export type CompactCanonicalArticleModel = {
  source: {
    knowledgeFileId: string;
    fileName: string;
    fileType: string | null;
    fileSize: number | null;
    extractor: string;
    analyzedAt: string;
    promptVersion: string;
  };
  visualModel: {
    pageCount: number;
    pages: CompactCanonicalPage[];
  };
  semanticModel: CompactSemanticModel;
  metadata: {
    warnings: string[];
    limitations: string[];
  };
};

type CompactCanonicalPage = {
  pageNumber: number;
  notes: string | null;
  comments: string[];
  elements: CompactCanonicalElement[];
  connections: {
    id: string;
    startElementId: string | null;
    endElementId: string | null;
    text: string | null;
    arrowStart: string | null;
    arrowEnd: string | null;
  }[];
  groups: {
    id: string;
    name: string | null;
    childElementIds: string[];
  }[];
};

type CompactCanonicalElement = {
  id: string;
  type: KnowledgeFileAnalysisElement["type"];
  name: string | null;
  shapeType: string | null;
  text: string | null;
  placeholderType: string | null;
  groupId: string | null;
  zIndex: number | null;
  table: {
    rows: {
      cells: (string | null)[];
    }[];
  } | null;
  embeddedObject: {
    name: string | null;
    progId: string | null;
    target: string | null;
  } | null;
};

type CompactSemanticModel = {
  nodes: KnowledgeSemanticEntity[];
  edges: KnowledgeSemanticEdge[];
  lanes: KnowledgeSemanticEntity[];
  owners: KnowledgeSemanticEntity[];
  systems: KnowledgeSemanticEntity[];
  processes: KnowledgeSemanticEntity[];
  steps: KnowledgeSemanticEntity[];
  decisions: KnowledgeSemanticEntity[];
  inputs: KnowledgeSemanticEntity[];
  outputs: KnowledgeSemanticEntity[];
  conditions: KnowledgeSemanticEntity[];
  exceptions: KnowledgeSemanticEntity[];
  annotations: KnowledgeSemanticEntity[];
  evidence: KnowledgeSemanticEvidence[];
};

const MAX_ELEMENTS_PER_PAGE = 80;
const MAX_CONNECTIONS_PER_PAGE = 80;
const MAX_GROUPS_PER_PAGE = 40;
const MAX_SEMANTIC_ITEMS = 80;
const MAX_EVIDENCE_ITEMS = 120;
const MAX_TEXT_LENGTH = 1_200;
const MAX_CELL_TEXT_LENGTH = 500;

function isRecord(value: unknown): value is RecordValue {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value)
  );
}

function isCanonicalAnalysis(
  value: unknown,
): value is KnowledgeFileCanonicalAnalysis {
  if (!isRecord(value)) {
    return false;
  }

  return (
    value.schemaVersion ===
      KNOWLEDGE_FILE_ANALYSIS_SCHEMA_VERSION &&
    isRecord(value.source) &&
    isRecord(value.visualModel) &&
    Array.isArray(value.visualModel.pages) &&
    isRecord(value.semanticModel) &&
    isRecord(value.metadata)
  );
}

function truncate(value: string | null, max = MAX_TEXT_LENGTH) {
  if (!value) {
    return null;
  }

  const normalized = value.trim();

  if (normalized.length <= max) {
    return normalized;
  }

  return `${normalized.slice(0, max)} [truncado]`;
}

function compactElements(
  elements: KnowledgeFileAnalysisElement[],
): CompactCanonicalElement[] {
  return elements
    .filter(
      (element) =>
        element.text ||
        element.table ||
        element.embeddedObject ||
        element.type === "smartArt" ||
        element.type === "chart" ||
        element.type === "unknownReference",
    )
    .slice(0, MAX_ELEMENTS_PER_PAGE)
    .map((element) => ({
      id: element.id,
      type: element.type,
      name: element.name,
      shapeType: element.shapeType,
      text: truncate(element.text),
      placeholderType:
        element.placeholder?.type ?? null,
      groupId: element.groupId,
      zIndex: element.zIndex,
      table: element.table
        ? {
            rows: element.table.rows.map((row) => ({
              cells: row.cells.map((cell) =>
                truncate(
                  cell.text,
                  MAX_CELL_TEXT_LENGTH,
                ),
              ),
            })),
          }
        : null,
      embeddedObject: element.embeddedObject
        ? {
            name: element.embeddedObject.name,
            progId: element.embeddedObject.progId,
            target: element.embeddedObject.target,
          }
        : null,
    }));
}

function compactSemanticEntities(
  entities: KnowledgeSemanticEntity[],
) {
  return [...entities]
    .sort(
      (left, right) =>
        right.confidence - left.confidence,
    )
    .slice(0, MAX_SEMANTIC_ITEMS)
    .map((entity) => ({
      ...entity,
      evidence:
        truncate(entity.evidence) ?? "",
    }));
}

function compactSemanticEdges(edges: KnowledgeSemanticEdge[]) {
  return [...edges]
    .sort(
      (left, right) =>
        right.confidence - left.confidence,
    )
    .slice(0, MAX_SEMANTIC_ITEMS)
    .map((edge) => ({
      ...edge,
      evidence:
        truncate(edge.evidence) ?? "",
    }));
}

function compactEvidence(
  evidence: KnowledgeSemanticEvidence[],
) {
  return evidence
    .slice(0, MAX_EVIDENCE_ITEMS)
    .map((item) => ({
      ...item,
      text: truncate(item.text) ?? "",
    }));
}

function compactSemanticModel(
  semanticModel: KnowledgeFileSemanticModel,
): CompactSemanticModel {
  return {
    nodes: compactSemanticEntities(semanticModel.nodes),
    edges: compactSemanticEdges(semanticModel.edges),
    lanes: compactSemanticEntities(semanticModel.lanes),
    owners: compactSemanticEntities(semanticModel.owners),
    systems: compactSemanticEntities(semanticModel.systems),
    processes: compactSemanticEntities(
      semanticModel.processes,
    ),
    steps: compactSemanticEntities(semanticModel.steps),
    decisions: compactSemanticEntities(
      semanticModel.decisions,
    ),
    inputs: compactSemanticEntities(semanticModel.inputs),
    outputs: compactSemanticEntities(semanticModel.outputs),
    conditions: compactSemanticEntities(
      semanticModel.conditions,
    ),
    exceptions: compactSemanticEntities(
      semanticModel.exceptions,
    ),
    annotations: compactSemanticEntities(
      semanticModel.annotations,
    ),
    evidence: compactEvidence(semanticModel.evidence),
  };
}

export function getValidCanonicalAnalysis(
  value: unknown,
) {
  return isCanonicalAnalysis(value) ? value : null;
}

export function buildCompactCanonicalArticleModel(
  analysis: KnowledgeFileCanonicalAnalysis,
): CompactCanonicalArticleModel {
  return {
    source: {
      knowledgeFileId: analysis.source.knowledgeFileId,
      fileName: analysis.source.fileName,
      fileType: analysis.source.fileType,
      fileSize: analysis.source.fileSize,
      extractor: analysis.source.extractor,
      analyzedAt: analysis.source.analyzedAt,
      promptVersion: analysis.source.promptVersion,
    },
    visualModel: {
      pageCount: analysis.visualModel.pages.length,
      pages: analysis.visualModel.pages.map((page) => ({
        pageNumber: page.pageNumber,
        notes: truncate(page.notes),
        comments: page.comments
          .map((comment) => truncate(comment))
          .filter(
            (comment): comment is string =>
              comment !== null,
          ),
        elements: compactElements(page.elements),
        connections: page.connections
          .slice(0, MAX_CONNECTIONS_PER_PAGE)
          .map((connection) => ({
            id: connection.id,
            startElementId:
              connection.startElementId,
            endElementId:
              connection.endElementId,
            text: truncate(connection.text),
            arrowStart: connection.arrowStart,
            arrowEnd: connection.arrowEnd,
          })),
        groups: page.groups
          .slice(0, MAX_GROUPS_PER_PAGE)
          .map((group) => ({
            id: group.id,
            name: group.name,
            childElementIds: group.childElementIds,
          })),
      })),
    },
    semanticModel: compactSemanticModel(
      analysis.semanticModel,
    ),
    metadata: {
      warnings: analysis.metadata.warnings,
      limitations: analysis.metadata.limitations,
    },
  };
}
