// lib/knowledge/file-analysis/types.ts

export const KNOWLEDGE_FILE_ANALYSIS_SCHEMA_VERSION = 1;
export const KNOWLEDGE_FILE_ANALYSIS_PROMPT_VERSION =
  "knowledge-file-analysis-v1";

export type KnowledgeFileAnalysisStatus =
  | "pending"
  | "processing"
  | "ready"
  | "error";

export type KnowledgeFileAnalysisSource = {
  knowledgeFileId: string;
  fileName: string;
  fileType: string | null;
  fileSize: number | null;
  fileHash: string;
  analyzedAt: string;
  extractor: string;
  model: string;
  promptVersion: typeof KNOWLEDGE_FILE_ANALYSIS_PROMPT_VERSION;
};

export type KnowledgeFileAnalysisCanvas = {
  width: number | null;
  height: number | null;
  unit: "emu" | null;
};

export type KnowledgeFileAnalysisTextRun = {
  text: string;
  fontFamily: string | null;
  fontSize: number | null;
  bold: boolean | null;
  italic: boolean | null;
  underline: string | null;
  color: string | null;
  themeColor: string | null;
  language: string | null;
  baseline: number | null;
};

export type KnowledgeFileAnalysisHyperlink = {
  id: string | null;
  action: string | null;
  tooltip: string | null;
  target: string | null;
  targetMode: string | null;
};

export type KnowledgeFileAnalysisPlaceholder = {
  type: string | null;
  index: string | null;
  size: string | null;
  orientation: string | null;
};

export type KnowledgeFileAnalysisTextMargins = {
  left: number | null;
  right: number | null;
  top: number | null;
  bottom: number | null;
};

export type KnowledgeFileAnalysisTableCell = {
  rowIndex: number;
  columnIndex: number;
  text: string | null;
  rowSpan: number | null;
  gridSpan: number | null;
  fillColor: string | null;
  fillThemeColor: string | null;
  marginLeft: number | null;
  marginRight: number | null;
  marginTop: number | null;
  marginBottom: number | null;
};

export type KnowledgeFileAnalysisTable = {
  rows: {
    index: number;
    height: number | null;
    cells: KnowledgeFileAnalysisTableCell[];
  }[];
  columns: {
    index: number;
    width: number | null;
  }[];
};

export type KnowledgeFileAnalysisEmbeddedObject = {
  relationshipId: string | null;
  target: string | null;
  targetMode: string | null;
  progId: string | null;
  name: string | null;
  showAsIcon: boolean | null;
};

export type KnowledgeFileAnalysisRelationship = {
  id: string;
  type: string | null;
  target: string;
  targetMode: string | null;
};

export type KnowledgeFileAnalysisElement = {
  id: string;
  pageNumber: number;
  type:
    | "shape"
    | "text"
    | "image"
    | "connector"
    | "group"
    | "table"
    | "graphicFrame"
    | "embeddedObject"
    | "smartArt"
    | "chart"
    | "unknownReference";
  name: string | null;
  shapeType: string | null;
  x: number | null;
  y: number | null;
  width: number | null;
  height: number | null;
  rotation: number | null;
  flipHorizontal: boolean | null;
  flipVertical: boolean | null;
  fillColor: string | null;
  fillThemeColor: string | null;
  fillTransparency: number | null;
  borderColor: string | null;
  borderThemeColor: string | null;
  borderWidth: number | null;
  borderTransparency: number | null;
  lineDash: string | null;
  lineCap: string | null;
  lineCompound: string | null;
  fontFamily: string | null;
  fontSize: number | null;
  alignment: string | null;
  verticalAlignment: string | null;
  textMargins: KnowledgeFileAnalysisTextMargins | null;
  text: string | null;
  textRuns: KnowledgeFileAnalysisTextRun[];
  imageTarget: string | null;
  placeholder: KnowledgeFileAnalysisPlaceholder | null;
  hyperlinks: KnowledgeFileAnalysisHyperlink[];
  table: KnowledgeFileAnalysisTable | null;
  embeddedObject: KnowledgeFileAnalysisEmbeddedObject | null;
  graphicUri: string | null;
  relationshipIds: string[];
  groupId: string | null;
  zIndex: number | null;
};

export type KnowledgeFileAnalysisConnection = {
  id: string;
  pageNumber: number;
  name: string | null;
  x: number | null;
  y: number | null;
  width: number | null;
  height: number | null;
  lineColor: string | null;
  lineThemeColor: string | null;
  lineWidth: number | null;
  lineTransparency: number | null;
  lineDash: string | null;
  lineCap: string | null;
  lineCompound: string | null;
  startElementId: string | null;
  endElementId: string | null;
  arrowStart: string | null;
  arrowEnd: string | null;
  hyperlinks: KnowledgeFileAnalysisHyperlink[];
  text: string | null;
  zIndex: number | null;
};

export type KnowledgeFileAnalysisGroup = {
  id: string;
  pageNumber: number;
  name: string | null;
  childElementIds: string[];
  x: number | null;
  y: number | null;
  width: number | null;
  height: number | null;
  rotation: number | null;
  flipHorizontal: boolean | null;
  flipVertical: boolean | null;
  zIndex: number | null;
};

export type KnowledgeFileAnalysisPage = {
  pageNumber: number;
  canvas: KnowledgeFileAnalysisCanvas;
  elements: KnowledgeFileAnalysisElement[];
  connections: KnowledgeFileAnalysisConnection[];
  groups: KnowledgeFileAnalysisGroup[];
  notes: string | null;
  comments: string[];
  relationships: KnowledgeFileAnalysisRelationship[];
};

export type KnowledgeFileVisualModel = {
  pages: KnowledgeFileAnalysisPage[];
};

export type KnowledgeSemanticEvidence = {
  id: string;
  text: string;
  pageNumber: number | null;
  sourceElementIds: string[];
};

export type KnowledgeSemanticEntity = {
  id: string;
  label: string;
  type: string;
  confidence: number;
  evidence: string;
  sourceElementIds: string[];
  inferred: boolean;
};

export type KnowledgeSemanticEdge = {
  id: string;
  from: string;
  to: string;
  label: string;
  confidence: number;
  evidence: string;
  sourceElementIds: string[];
  inferred: boolean;
};

export type KnowledgeFileSemanticModel = {
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

export type KnowledgeFileAnalysisMetadata = {
  warnings: string[];
  limitations: string[];
};

export type KnowledgeFileCanonicalAnalysis = {
  schemaVersion: typeof KNOWLEDGE_FILE_ANALYSIS_SCHEMA_VERSION;
  source: KnowledgeFileAnalysisSource;
  visualModel: KnowledgeFileVisualModel;
  semanticModel: KnowledgeFileSemanticModel;
  metadata: KnowledgeFileAnalysisMetadata;
};

export type KnowledgeFileAnalysisResult = {
  analysis: KnowledgeFileCanonicalAnalysis;
  tokensInput: number | null;
  tokensOutput: number | null;
  processingMs: number;
};
