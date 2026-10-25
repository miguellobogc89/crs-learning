/** Client-safe shapes of the Knowledge → Engine preview. No server imports. */
import type { DocumentIssue, ExtractedLink, ExtractedRecord } from "./extraction";
import type { IdentityCluster, LabelIssue, SchemaSupport } from "./reconcile";
import type { PreviewSchema, SchemaIssue } from "./schema";

export type EnginePreviewCallStatus = "ok" | "timeout" | "incomplete" | "invalid_json" | "error" | "aborted";
export type EnginePreviewCall = {
  id: string;
  stage: "schema" | "extract";
  segmentId: string | null;
  model: string;
  startedAt: string;
  durationMs: number;
  inputChars: number;
  inputTokens: number | null;
  outputTokens: number | null;
  reasoningTokens: number | null;
  status: EnginePreviewCallStatus;
  error: string | null;
  /** Full model answer; kept server-side for replay fixtures, stripped from the UI payload. */
  rawOutput?: string | null;
};

export type EnginePreviewDocumentStatus = "pending" | "verified" | "needs_review" | "failed";
export type EnginePreviewDocument = {
  segmentId: string;
  fileId: string;
  fileName: string;
  title: string;
  type: string;
  startLine: number;
  endLine: number;
  status: EnginePreviewDocumentStatus;
  records: ExtractedRecord[];
  links: ExtractedLink[];
  issues: DocumentIssue[];
  warnings: string[];
  /** Failure that prevented a verifiable answer (timeout, invalid JSON…). */
  error: string | null;
  callId: string | null;
  /** Schema hash this result was verified against. */
  schemaHash: string | null;
};

export type EnginePreviewStatus =
  | "not_applicable"   // no structured documents in the reviewed batch
  | "idle"             // nothing analysed yet
  | "running"
  | "schema_failed"    // discovery answer rejected: retry or restart
  | "incomplete"       // some documents still pending (e.g. time window used up)
  | "needs_review"     // finished, some documents have issues
  | "ready";           // every document verified

export type KnowledgeEnginePreview = {
  version: 2;
  status: EnginePreviewStatus;
  /** This phase never writes Engine schemas or records. */
  savedToEngine: false;
  startedAt: string | null;
  updatedAt: string | null;
  schema: PreviewSchema | null;
  schemaIssues: SchemaIssue[];
  schemaError: string | null;
  discoveryScope: { segmentIds: string[]; reason: string | null } | null;
  support: SchemaSupport | null;
  labelIssues: LabelIssue[];
  documents: EnginePreviewDocument[];
  clusters: IdentityCluster[];
  calls: EnginePreviewCall[];
  totals: { calls: number; durationMs: number; inputTokens: number; outputTokens: number };
};

export type EnginePreviewRunMode = "continue" | "retry_document" | "restart";

export type EnginePreviewEvent =
  | { type: "progress"; message: string }
  | { type: "state"; preview: KnowledgeEnginePreview }
  | { type: "completed"; preview: KnowledgeEnginePreview }
  | { type: "error"; error: string; preview: KnowledgeEnginePreview | null };
