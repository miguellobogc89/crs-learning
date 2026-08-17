// lib/knowledge/file-analysis/pptx-extractor.ts

import JSZip from "jszip";
import { XMLParser } from "fast-xml-parser";

import type {
  KnowledgeFileAnalysisCanvas,
  KnowledgeFileAnalysisConnection,
  KnowledgeFileAnalysisElement,
  KnowledgeFileAnalysisGroup,
  KnowledgeFileAnalysisPage,
  KnowledgeFileAnalysisRelationship,
  KnowledgeFileAnalysisTable,
  KnowledgeFileVisualModel,
} from "./types";

interface XmlNode {
  [key: string]: XmlValue;
}

type XmlValue =
  | string
  | number
  | boolean
  | null
  | XmlNode
  | XmlValue[];

type SlideRelationship = {
  id: string;
  target: string;
  type: string | null;
  targetMode: string | null;
};

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "",
  textNodeName: "#text",
  parseAttributeValue: false,
  parseTagValue: false,
});

function isNode(value: XmlValue | undefined): value is XmlNode {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value)
  );
}

function asArray(value: XmlValue | undefined): XmlNode[] {
  if (Array.isArray(value)) {
    return value.filter(isNode);
  }

  return isNode(value) ? [value] : [];
}

function getNode(
  node: XmlNode | undefined,
  key: string,
) {
  const value = node?.[key];
  return isNode(value) ? value : undefined;
}

function getString(
  node: XmlNode | undefined,
  key: string,
) {
  const value = node?.[key];

  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return String(value);
  }

  return null;
}

function getNumber(
  node: XmlNode | undefined,
  key: string,
) {
  const value = getString(node, key);

  if (value === null) {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function getBoolean(
  node: XmlNode | undefined,
  key: string,
) {
  const value = getString(node, key);

  if (value === null) {
    return null;
  }

  return value === "1" || value === "true";
}

function firstNode(
  node: XmlNode | undefined,
  keys: string[],
) {
  for (const key of keys) {
    const found = getNode(node, key);

    if (found) {
      return found;
    }
  }

  return undefined;
}

function parseXml(xml: string): XmlNode {
  return parser.parse(xml) as XmlNode;
}

function getRelationship(
  relationships: Map<string, SlideRelationship>,
  relationshipId: string | null,
) {
  return relationshipId
    ? relationships.get(relationshipId) ?? null
    : null;
}

function getTextFromNode(node: XmlNode | undefined): string {
  if (!node) {
    return "";
  }

  const parts: string[] = [];

  function visit(value: XmlValue | undefined) {
    if (value === undefined || value === null) {
      return;
    }

    if (
      typeof value === "string" ||
      typeof value === "number"
    ) {
      return;
    }

    if (Array.isArray(value)) {
      for (const item of value) {
        visit(item);
      }

      return;
    }

    if (!isNode(value)) {
      return;
    }

    const text = getString(value, "a:t");

    if (text) {
      parts.push(text);
    }

    for (const child of Object.values(value)) {
      visit(child);
    }
  }

  visit(node);

  return parts.join(" ").replace(/\s+/g, " ").trim();
}

function getTextRuns(node: XmlNode | undefined) {
  const runs: KnowledgeFileAnalysisElement["textRuns"] =
    [];

  function visit(value: XmlValue | undefined) {
    if (Array.isArray(value)) {
      for (const item of value) {
        visit(item);
      }

      return;
    }

    if (!isNode(value)) {
      return;
    }

    for (const run of asArray(value["a:r"])) {
      const runProperties = getNode(run, "a:rPr");
      const latin = getNode(runProperties, "a:latin");
      const text = getString(run, "a:t");

      if (!text) {
        continue;
      }

      const size = getNumber(runProperties, "sz");
      const color = getColorInfo(
        getNode(runProperties, "a:solidFill"),
      );

      runs.push({
        text,
        fontFamily:
          getString(latin, "typeface") ?? null,
        fontSize:
          size !== null ? size / 100 : null,
        bold: getBoolean(runProperties, "b"),
        italic: getBoolean(runProperties, "i"),
        underline: getString(runProperties, "u"),
        color: color.color,
        themeColor: color.themeColor,
        language: getString(runProperties, "lang"),
        baseline: getNumber(runProperties, "baseline"),
      });
    }

    for (const child of Object.values(value)) {
      visit(child);
    }
  }

  visit(node);

  return runs;
}

function getTransform(shapeProperties: XmlNode | undefined) {
  const transform =
    firstNode(shapeProperties, [
      "a:xfrm",
      "p:xfrm",
    ]) ?? shapeProperties;
  const offset = getNode(transform, "a:off");
  const extent = getNode(transform, "a:ext");

  return {
    x: getNumber(offset, "x"),
    y: getNumber(offset, "y"),
    width: getNumber(extent, "cx"),
    height: getNumber(extent, "cy"),
    rotation: getNumber(transform, "rot"),
    flipHorizontal: getBoolean(transform, "flipH"),
    flipVertical: getBoolean(transform, "flipV"),
  };
}

function getAlpha(node: XmlNode | undefined) {
  const alpha = getNumber(
    getNode(node, "a:alpha"),
    "val",
  );

  return alpha !== null ? alpha : null;
}

function getColorInfo(node: XmlNode | undefined) {
  const srgb = getNode(node, "a:srgbClr");
  const scheme = getNode(node, "a:schemeClr");
  const srgbValue = getString(srgb, "val");
  const themeColor = getString(scheme, "val");
  const alpha = getAlpha(srgb) ?? getAlpha(scheme);

  return {
    color: srgbValue
      ? `#${srgbValue.toUpperCase()}`
      : null,
    themeColor,
    transparency:
      alpha !== null ? 100000 - alpha : null,
  };
}

function getFillColor(shapeProperties: XmlNode | undefined) {
  return getColorInfo(
    getNode(shapeProperties, "a:solidFill"),
  ).color;
}

function getFillInfo(shapeProperties: XmlNode | undefined) {
  return getColorInfo(
    getNode(shapeProperties, "a:solidFill"),
  );
}

function getLineInfo(shapeProperties: XmlNode | undefined) {
  const line = getNode(shapeProperties, "a:ln");
  const color = getColorInfo(getNode(line, "a:solidFill"));

  return {
    color: color.color,
    themeColor: color.themeColor,
    transparency: color.transparency,
    width: getNumber(line, "w"),
    dash: getString(getNode(line, "a:prstDash"), "val"),
    cap: getString(line, "cap"),
    compound: getString(line, "cmpd"),
  };
}

function getLineWidth(shapeProperties: XmlNode | undefined) {
  return getNumber(
    getNode(shapeProperties, "a:ln"),
    "w",
  );
}

function getShapeType(shapeProperties: XmlNode | undefined) {
  return getString(
    getNode(shapeProperties, "a:prstGeom"),
    "prst",
  );
}

function getPlaceholder(nonVisual: XmlNode | undefined) {
  const placeholder = getNode(
    getNode(nonVisual, "p:nvPr"),
    "p:ph",
  );

  if (!placeholder) {
    return null;
  }

  return {
    type: getString(placeholder, "type"),
    index: getString(placeholder, "idx"),
    size: getString(placeholder, "sz"),
    orientation: getString(placeholder, "orient"),
  };
}

function getHyperlinks(
  node: XmlNode | undefined,
  relationships: Map<string, SlideRelationship>,
) {
  const hyperlinks: KnowledgeFileAnalysisElement["hyperlinks"] =
    [];

  function visit(value: XmlValue | undefined) {
    if (Array.isArray(value)) {
      for (const item of value) {
        visit(item);
      }

      return;
    }

    if (!isNode(value)) {
      return;
    }

    for (const key of ["a:hlinkClick", "a:hlinkMouseOver"]) {
      const hyperlink = getNode(value, key);

      if (!hyperlink) {
        continue;
      }

      const relationshipId = getString(hyperlink, "r:id");
      const relationship = getRelationship(
        relationships,
        relationshipId,
      );

      hyperlinks.push({
        id: relationshipId,
        action: getString(hyperlink, "action"),
        tooltip: getString(hyperlink, "tooltip"),
        target: relationship?.target ?? null,
        targetMode: relationship?.targetMode ?? null,
      });
    }

    for (const child of Object.values(value)) {
      visit(child);
    }
  }

  visit(node);

  return hyperlinks;
}

function getTextMargins(textBody: XmlNode | undefined) {
  const bodyProperties = getNode(textBody, "a:bodyPr");

  if (!bodyProperties) {
    return null;
  }

  return {
    left: getNumber(bodyProperties, "lIns"),
    right: getNumber(bodyProperties, "rIns"),
    top: getNumber(bodyProperties, "tIns"),
    bottom: getNumber(bodyProperties, "bIns"),
  };
}

function getVerticalAlignment(textBody: XmlNode | undefined) {
  return getString(getNode(textBody, "a:bodyPr"), "anchor");
}

function getAlignment(textBody: XmlNode | undefined) {
  for (const paragraph of asArray(textBody?.["a:p"])) {
    const alignment = getString(
      getNode(paragraph, "a:pPr"),
      "algn",
    );

    if (alignment) {
      return alignment;
    }
  }

  return null;
}

function getElementBase(
  node: XmlNode,
  nonVisualKey: string,
  shapePropertiesKey: string,
) {
  const nonVisual = getNode(node, nonVisualKey);
  const commonProperties = firstNode(nonVisual, [
    "p:cNvPr",
  ]);
  const shapeProperties = getNode(
    node,
    shapePropertiesKey,
  );
  const transform = getTransform(shapeProperties);

  return {
    id: getString(commonProperties, "id"),
    name: getString(commonProperties, "name"),
    nonVisual,
    commonProperties,
    shapeProperties,
    ...transform,
  };
}

function getCommonElementFields(params: {
  base: ReturnType<typeof getElementBase>;
  pageNumber: number;
  groupId: string | null;
  zIndex: number;
  textBody: XmlNode | undefined;
  relationships: Map<string, SlideRelationship>;
}) {
  const fill = getFillInfo(params.base.shapeProperties);
  const line = getLineInfo(params.base.shapeProperties);
  const textRuns = getTextRuns(params.textBody);
  const fontRun = textRuns.find(
    (run) => run.fontFamily || run.fontSize !== null,
  );

  return {
    pageNumber: params.pageNumber,
    x: params.base.x,
    y: params.base.y,
    width: params.base.width,
    height: params.base.height,
    rotation: params.base.rotation,
    flipHorizontal: params.base.flipHorizontal,
    flipVertical: params.base.flipVertical,
    fillColor: fill.color,
    fillThemeColor: fill.themeColor,
    fillTransparency: fill.transparency,
    borderColor: line.color,
    borderThemeColor: line.themeColor,
    borderWidth: line.width,
    borderTransparency: line.transparency,
    lineDash: line.dash,
    lineCap: line.cap,
    lineCompound: line.compound,
    fontFamily: fontRun?.fontFamily ?? null,
    fontSize: fontRun?.fontSize ?? null,
    alignment: getAlignment(params.textBody),
    verticalAlignment: getVerticalAlignment(
      params.textBody,
    ),
    textMargins: getTextMargins(params.textBody),
    text: getTextFromNode(params.textBody) || null,
    textRuns,
    placeholder: getPlaceholder(params.base.nonVisual),
    hyperlinks: getHyperlinks(
      params.base.commonProperties,
      params.relationships,
    ),
    groupId: params.groupId,
    zIndex: params.zIndex,
  };
}

function parseShape(
  node: XmlNode,
  pageNumber: number,
  groupId: string | null,
  zIndex: number,
  relationships: Map<string, SlideRelationship>,
): KnowledgeFileAnalysisElement {
  const base = getElementBase(
    node,
    "p:nvSpPr",
    "p:spPr",
  );
  const textBody = getNode(node, "p:txBody");
  const commonFields = getCommonElementFields({
    base,
    pageNumber,
    groupId,
    zIndex,
    textBody,
    relationships,
  });

  return {
    id:
      base.id ??
      `slide-${pageNumber}-shape-${zIndex}`,
    type: getTextFromNode(textBody) ? "text" : "shape",
    name: base.name,
    shapeType: getShapeType(base.shapeProperties),
    imageTarget: null,
    table: null,
    embeddedObject: null,
    graphicUri: null,
    relationshipIds: [],
    ...commonFields,
  };
}

function parsePicture(
  node: XmlNode,
  pageNumber: number,
  groupId: string | null,
  zIndex: number,
  relationships: Map<string, SlideRelationship>,
): KnowledgeFileAnalysisElement {
  const base = getElementBase(
    node,
    "p:nvPicPr",
    "p:spPr",
  );
  const embedId = getString(
    getNode(
      getNode(node, "p:blipFill"),
      "a:blip",
    ),
    "r:embed",
  );
  const relationship =
    embedId !== null ? relationships.get(embedId) : null;
  const commonFields = getCommonElementFields({
    base,
    pageNumber,
    groupId,
    zIndex,
    textBody: undefined,
    relationships,
  });

  return {
    id:
      base.id ??
      `slide-${pageNumber}-image-${zIndex}`,
    type: "image",
    name: base.name,
    shapeType: null,
    imageTarget: relationship?.target ?? null,
    table: null,
    embeddedObject: null,
    graphicUri: null,
    relationshipIds: embedId ? [embedId] : [],
    ...commonFields,
    fillColor: null,
    fillThemeColor: null,
    fillTransparency: null,
  };
}

function parseConnector(
  node: XmlNode,
  pageNumber: number,
  zIndex: number,
  relationships: Map<string, SlideRelationship>,
): KnowledgeFileAnalysisConnection {
  const base = getElementBase(
    node,
    "p:nvCxnSpPr",
    "p:spPr",
  );
  const connectorProperties = getNode(
    getNode(node, "p:nvCxnSpPr"),
    "p:cNvCxnSpPr",
  );
  const start = getNode(
    connectorProperties,
    "a:stCxn",
  );
  const end = getNode(
    connectorProperties,
    "a:endCxn",
  );
  const line = getNode(base.shapeProperties, "a:ln");
  const lineInfo = getLineInfo(base.shapeProperties);

  return {
    id:
      base.id ??
      `slide-${pageNumber}-connection-${zIndex}`,
    pageNumber,
    name: base.name,
    x: base.x,
    y: base.y,
    width: base.width,
    height: base.height,
    lineColor: lineInfo.color,
    lineThemeColor: lineInfo.themeColor,
    lineWidth: lineInfo.width,
    lineTransparency: lineInfo.transparency,
    lineDash: lineInfo.dash,
    lineCap: lineInfo.cap,
    lineCompound: lineInfo.compound,
    startElementId: getString(start, "id"),
    endElementId: getString(end, "id"),
    arrowStart: getString(
      getNode(line, "a:headEnd"),
      "type",
    ),
    arrowEnd: getString(
      getNode(line, "a:tailEnd"),
      "type",
    ),
    hyperlinks: getHyperlinks(
      base.commonProperties,
      relationships,
    ),
    text: getTextFromNode(getNode(node, "p:txBody")) || null,
    zIndex,
  };
}

function parseGroup(
  node: XmlNode,
  pageNumber: number,
  zIndex: number,
  relationships: Map<string, SlideRelationship>,
) {
  const nonVisual = getNode(node, "p:nvGrpSpPr");
  const commonProperties = getNode(nonVisual, "p:cNvPr");
  const groupProperties = getNode(node, "p:grpSpPr");
  const transform = getTransform(groupProperties);
  const id =
    getString(commonProperties, "id") ??
    `slide-${pageNumber}-group-${zIndex}`;
  const elements: KnowledgeFileAnalysisElement[] = [];
  const connections: KnowledgeFileAnalysisConnection[] =
    [];
  const childElementIds: string[] = [];
  let childIndex = 0;

  for (const child of asArray(node["p:sp"])) {
    childIndex += 1;
    const element = parseShape(
      child,
      pageNumber,
      id,
      childIndex,
      relationships,
    );
    elements.push(element);
    childElementIds.push(element.id);
  }

  for (const child of asArray(node["p:pic"])) {
    childIndex += 1;
    const element = parsePicture(
      child,
      pageNumber,
      id,
      childIndex,
      relationships,
    );
    elements.push(element);
    childElementIds.push(element.id);
  }

  for (const child of asArray(node["p:graphicFrame"])) {
    childIndex += 1;
    const element = parseGraphicFrame(
      child,
      pageNumber,
      id,
      childIndex,
      relationships,
    );
    elements.push(element);
    childElementIds.push(element.id);
  }

  for (const child of asArray(node["p:cxnSp"])) {
    childIndex += 1;
    connections.push(
      parseConnector(
        child,
        pageNumber,
        childIndex,
        relationships,
      ),
    );
  }

  const group: KnowledgeFileAnalysisGroup = {
    id,
    pageNumber,
    name: getString(commonProperties, "name"),
    childElementIds,
    x: transform.x,
    y: transform.y,
    width: transform.width,
    height: transform.height,
    rotation: transform.rotation,
    flipHorizontal: transform.flipHorizontal,
    flipVertical: transform.flipVertical,
    zIndex,
  };
  const groupElement: KnowledgeFileAnalysisElement = {
    id,
    pageNumber,
    type: "group",
    name: getString(commonProperties, "name"),
    shapeType: null,
    x: transform.x,
    y: transform.y,
    width: transform.width,
    height: transform.height,
    rotation: transform.rotation,
    flipHorizontal: transform.flipHorizontal,
    flipVertical: transform.flipVertical,
    fillColor: null,
    fillThemeColor: null,
    fillTransparency: null,
    borderColor: null,
    borderThemeColor: null,
    borderWidth: null,
    borderTransparency: null,
    lineDash: null,
    lineCap: null,
    lineCompound: null,
    fontFamily: null,
    fontSize: null,
    alignment: null,
    verticalAlignment: null,
    textMargins: null,
    text: null,
    textRuns: [],
    imageTarget: null,
    placeholder: getPlaceholder(nonVisual),
    hyperlinks: getHyperlinks(commonProperties, relationships),
    table: null,
    embeddedObject: null,
    graphicUri: null,
    relationshipIds: [],
    groupId: null,
    zIndex,
  };

  return {
    group,
    elements: [groupElement, ...elements],
    connections,
  };
}

function collectRelationshipIds(
  node: XmlNode | undefined,
) {
  const ids = new Set<string>();

  function visit(value: XmlValue | undefined) {
    if (Array.isArray(value)) {
      for (const item of value) {
        visit(item);
      }

      return;
    }

    if (!isNode(value)) {
      return;
    }

    for (const [key, child] of Object.entries(value)) {
      if (
        (key === "r:id" || key === "r:embed" || key === "r:link") &&
        typeof child === "string"
      ) {
        ids.add(child);
      }

      visit(child);
    }
  }

  visit(node);

  return Array.from(ids);
}

function findFirstDescendant(
  node: XmlNode | undefined,
  key: string,
): XmlNode | undefined {
  if (!node) {
    return undefined;
  }

  const direct = getNode(node, key);

  if (direct) {
    return direct;
  }

  for (const child of Object.values(node)) {
    if (Array.isArray(child)) {
      for (const item of child) {
        if (!isNode(item)) {
          continue;
        }

        const found = findFirstDescendant(item, key);

        if (found) {
          return found;
        }
      }
    } else if (isNode(child)) {
      const found = findFirstDescendant(child, key);

      if (found) {
        return found;
      }
    }
  }

  return undefined;
}

function parseTable(
  tableNode: XmlNode | undefined,
): KnowledgeFileAnalysisTable | null {
  if (!tableNode) {
    return null;
  }

  const columns = asArray(
    getNode(tableNode, "a:tblGrid")?.["a:gridCol"],
  ).map((column, index) => ({
    index,
    width: getNumber(column, "w"),
  }));
  const rows = asArray(tableNode["a:tr"]).map(
    (row, rowIndex) => ({
      index: rowIndex,
      height: getNumber(row, "h"),
      cells: asArray(row["a:tc"]).map(
        (cell, columnIndex) => {
          const cellProperties = getNode(cell, "a:tcPr");
          const fill = getColorInfo(
            getNode(cellProperties, "a:solidFill"),
          );

          return {
            rowIndex,
            columnIndex,
            text:
              getTextFromNode(
                getNode(cell, "a:txBody"),
              ) || null,
            rowSpan: getNumber(cell, "rowSpan"),
            gridSpan: getNumber(cell, "gridSpan"),
            fillColor: fill.color,
            fillThemeColor: fill.themeColor,
            marginLeft: getNumber(cellProperties, "marL"),
            marginRight: getNumber(cellProperties, "marR"),
            marginTop: getNumber(cellProperties, "marT"),
            marginBottom: getNumber(cellProperties, "marB"),
          };
        },
      ),
    }),
  );

  return {
    rows,
    columns,
  };
}

function parseEmbeddedObject(
  graphicFrame: XmlNode,
  relationships: Map<string, SlideRelationship>,
) {
  const oleObject =
    findFirstDescendant(graphicFrame, "p:oleObj") ??
    findFirstDescendant(graphicFrame, "p:embed");

  if (!oleObject) {
    return null;
  }

  const relationshipId =
    getString(oleObject, "r:id") ??
    getString(oleObject, "r:embed");
  const relationship = getRelationship(
    relationships,
    relationshipId,
  );

  return {
    relationshipId,
    target: relationship?.target ?? null,
    targetMode: relationship?.targetMode ?? null,
    progId: getString(oleObject, "progId"),
    name: getString(oleObject, "name"),
    showAsIcon: getBoolean(oleObject, "showAsIcon"),
  };
}

function getGraphicFrameType(uri: string | null) {
  if (!uri) {
    return "graphicFrame" as const;
  }

  if (uri.includes("/table")) {
    return "table" as const;
  }

  if (uri.includes("/diagram")) {
    return "smartArt" as const;
  }

  if (uri.includes("/chart")) {
    return "chart" as const;
  }

  return "graphicFrame" as const;
}

function parseGraphicFrame(
  node: XmlNode,
  pageNumber: number,
  groupId: string | null,
  zIndex: number,
  relationships: Map<string, SlideRelationship>,
): KnowledgeFileAnalysisElement {
  const nonVisual = getNode(node, "p:nvGraphicFramePr");
  const commonProperties = getNode(nonVisual, "p:cNvPr");
  const transform = getTransform(getNode(node, "p:xfrm"));
  const graphicData = getNode(
    getNode(node, "a:graphic"),
    "a:graphicData",
  );
  const graphicUri = getString(graphicData, "uri");
  const table = parseTable(getNode(graphicData, "a:tbl"));
  const embeddedObject = parseEmbeddedObject(
    node,
    relationships,
  );
  const relationshipIds = collectRelationshipIds(node);
  const type = embeddedObject
    ? "embeddedObject"
    : getGraphicFrameType(graphicUri);
  const tableText =
    table?.rows
      .flatMap((row) => row.cells)
      .map((cell) => cell.text)
      .filter(
        (text): text is string =>
          typeof text === "string" &&
          text.trim().length > 0,
      )
      .join(" ") ?? null;

  return {
    id:
      getString(commonProperties, "id") ??
      `slide-${pageNumber}-graphic-${zIndex}`,
    pageNumber,
    type,
    name: getString(commonProperties, "name"),
    shapeType: null,
    x: transform.x,
    y: transform.y,
    width: transform.width,
    height: transform.height,
    rotation: transform.rotation,
    flipHorizontal: transform.flipHorizontal,
    flipVertical: transform.flipVertical,
    fillColor: null,
    fillThemeColor: null,
    fillTransparency: null,
    borderColor: null,
    borderThemeColor: null,
    borderWidth: null,
    borderTransparency: null,
    lineDash: null,
    lineCap: null,
    lineCompound: null,
    fontFamily: null,
    fontSize: null,
    alignment: null,
    verticalAlignment: null,
    textMargins: null,
    text: tableText || null,
    textRuns: [],
    imageTarget: null,
    placeholder: getPlaceholder(nonVisual),
    hyperlinks: getHyperlinks(commonProperties, relationships),
    table,
    embeddedObject,
    graphicUri,
    relationshipIds,
    groupId,
    zIndex,
  };
}

async function readZipText(
  zip: JSZip,
  path: string,
) {
  return zip.file(path)?.async("text") ?? null;
}

function parseRelationships(xml: string | null) {
  const relationships = new Map<
    string,
    SlideRelationship
  >();

  if (!xml) {
    return relationships;
  }

  const root = parseXml(xml);
  const relationshipRoot = getNode(root, "Relationships");

  for (const rel of asArray(
    relationshipRoot?.Relationship,
  )) {
    const id = getString(rel, "Id");

    if (!id) {
      continue;
    }

    relationships.set(id, {
      id,
      target: getString(rel, "Target") ?? "",
      type: getString(rel, "Type"),
      targetMode: getString(rel, "TargetMode"),
    });
  }

  return relationships;
}

function serializeRelationships(
  relationships: Map<string, SlideRelationship>,
): KnowledgeFileAnalysisRelationship[] {
  return Array.from(relationships.values()).map(
    (relationship) => ({
      id: relationship.id,
      type: relationship.type,
      target: relationship.target,
      targetMode: relationship.targetMode,
    }),
  );
}

function getSlideNumber(path: string) {
  const match = path.match(/slide(\d+)\.xml$/);
  return match ? Number(match[1]) : 0;
}

function getCanvas(
  presentationXml: string | null,
): KnowledgeFileAnalysisCanvas {
  if (!presentationXml) {
    return {
      width: null,
      height: null,
      unit: null,
    };
  }

  const root = parseXml(presentationXml);
  const size = getNode(
    getNode(root, "p:presentation"),
    "p:sldSz",
  );
  const width = getNumber(size, "cx");
  const height = getNumber(size, "cy");

  return {
    width,
    height,
    unit:
      width !== null || height !== null ? "emu" : null,
  };
}

async function parseSlideNotes(
  zip: JSZip,
  pageNumber: number,
) {
  const xml = await readZipText(
    zip,
    `ppt/notesSlides/notesSlide${pageNumber}.xml`,
  );

  if (!xml) {
    return null;
  }

  const text = getTextFromNode(parseXml(xml));
  return text || null;
}

function resolvePptRelationshipTarget(
  sourcePath: string,
  target: string,
) {
  if (/^[a-z]+:/i.test(target)) {
    return target;
  }

  const sourceDirectory = sourcePath
    .split("/")
    .slice(0, -1)
    .join("/");
  const parts = `${sourceDirectory}/${target}`.split("/");
  const normalized: string[] = [];

  for (const part of parts) {
    if (!part || part === ".") {
      continue;
    }

    if (part === "..") {
      normalized.pop();
      continue;
    }

    normalized.push(part);
  }

  return normalized.join("/");
}

async function parseSlideComments(
  zip: JSZip,
  slidePath: string,
  relationships: Map<string, SlideRelationship>,
) {
  const comments: string[] = [];

  for (const relationship of relationships.values()) {
    if (
      !relationship.type?.includes("/comments") &&
      !relationship.target.includes("comments")
    ) {
      continue;
    }

    const targetPath = resolvePptRelationshipTarget(
      slidePath,
      relationship.target,
    );

    if (
      !targetPath.startsWith("ppt/comments/") &&
      !targetPath.startsWith("ppt/threadedComments/")
    ) {
      continue;
    }

    const xml = await readZipText(zip, targetPath);

    if (!xml) {
      continue;
    }

    const text = getTextFromNode(parseXml(xml));

    if (text) {
      comments.push(text);
    }
  }

  return comments;
}

function createUnknownReferenceElements(params: {
  pageNumber: number;
  elements: KnowledgeFileAnalysisElement[];
  groups: KnowledgeFileAnalysisGroup[];
  connections: KnowledgeFileAnalysisConnection[];
}) {
  const knownIds = new Set([
    ...params.elements.map((element) => element.id),
    ...params.groups.map((group) => group.id),
  ]);
  const missingIds = new Set<string>();

  for (const connection of params.connections) {
    for (const id of [
      connection.startElementId,
      connection.endElementId,
    ]) {
      if (id && !knownIds.has(id)) {
        missingIds.add(id);
      }
    }
  }

  return Array.from(missingIds).map(
    (id, index): KnowledgeFileAnalysisElement => ({
      id,
      pageNumber: params.pageNumber,
      type: "unknownReference",
      name: null,
      shapeType: null,
      x: null,
      y: null,
      width: null,
      height: null,
      rotation: null,
      flipHorizontal: null,
      flipVertical: null,
      fillColor: null,
      fillThemeColor: null,
      fillTransparency: null,
      borderColor: null,
      borderThemeColor: null,
      borderWidth: null,
      borderTransparency: null,
      lineDash: null,
      lineCap: null,
      lineCompound: null,
      fontFamily: null,
      fontSize: null,
      alignment: null,
      verticalAlignment: null,
      textMargins: null,
      text: null,
      textRuns: [],
      imageTarget: null,
      placeholder: null,
      hyperlinks: [],
      table: null,
      embeddedObject: null,
      graphicUri: null,
      relationshipIds: [],
      groupId: null,
      zIndex: params.elements.length + index + 1,
    }),
  );
}

export async function extractPptxVisualModel(
  buffer: Buffer,
): Promise<KnowledgeFileVisualModel> {
  const zip = await JSZip.loadAsync(buffer);
  const presentationXml = await readZipText(
    zip,
    "ppt/presentation.xml",
  );
  const canvas = getCanvas(presentationXml);
  const slidePaths = Object.keys(zip.files)
    .filter((path) =>
      /^ppt\/slides\/slide\d+\.xml$/.test(path),
    )
    .sort(
      (left, right) =>
        getSlideNumber(left) - getSlideNumber(right),
    );
  const pages: KnowledgeFileAnalysisPage[] = [];

  for (const slidePath of slidePaths) {
    const pageNumber = getSlideNumber(slidePath);
    const slideXml = await readZipText(zip, slidePath);

    if (!slideXml) {
      continue;
    }

    const relationshipPath = slidePath.replace(
      "ppt/slides/",
      "ppt/slides/_rels/",
    );
    const relationships = parseRelationships(
      await readZipText(
        zip,
        `${relationshipPath}.rels`,
      ),
    );
    const root = parseXml(slideXml);
    const tree = getNode(
      getNode(
        getNode(root, "p:sld"),
        "p:cSld",
      ),
      "p:spTree",
    );
    const elements: KnowledgeFileAnalysisElement[] =
      [];
    const connections: KnowledgeFileAnalysisConnection[] =
      [];
    const groups: KnowledgeFileAnalysisGroup[] = [];
    let zIndex = 0;

    for (const shape of asArray(tree?.["p:sp"])) {
      zIndex += 1;
      elements.push(
        parseShape(
          shape,
          pageNumber,
          null,
          zIndex,
          relationships,
        ),
      );
    }

    for (const picture of asArray(tree?.["p:pic"])) {
      zIndex += 1;
      elements.push(
        parsePicture(
          picture,
          pageNumber,
          null,
          zIndex,
          relationships,
        ),
      );
    }

    for (const connector of asArray(tree?.["p:cxnSp"])) {
      zIndex += 1;
      connections.push(
        parseConnector(
          connector,
          pageNumber,
          zIndex,
          relationships,
        ),
      );
    }

    for (const graphicFrame of asArray(
      tree?.["p:graphicFrame"],
    )) {
      zIndex += 1;
      elements.push(
        parseGraphicFrame(
          graphicFrame,
          pageNumber,
          null,
          zIndex,
          relationships,
        ),
      );
    }

    for (const groupNode of asArray(tree?.["p:grpSp"])) {
      zIndex += 1;
      const parsedGroup = parseGroup(
        groupNode,
        pageNumber,
        zIndex,
        relationships,
      );

      groups.push(parsedGroup.group);
      elements.push(...parsedGroup.elements);
      connections.push(...parsedGroup.connections);
    }

    elements.push(
      ...createUnknownReferenceElements({
        pageNumber,
        elements,
        groups,
        connections,
      }),
    );

    pages.push({
      pageNumber,
      canvas,
      elements,
      connections,
      groups,
      notes: await parseSlideNotes(zip, pageNumber),
      comments: await parseSlideComments(
        zip,
        slidePath,
        relationships,
      ),
      relationships: serializeRelationships(
        relationships,
      ),
    });
  }

  return { pages };
}

export function extractTextFromVisualModel(
  visualModel: KnowledgeFileVisualModel,
) {
  return visualModel.pages
    .flatMap((page) => [
      ...page.elements
        .map((element) => element.text)
        .filter(
          (text): text is string =>
            typeof text === "string" &&
            text.trim().length > 0,
        ),
      page.notes,
      ...page.comments,
    ])
    .filter(
      (text): text is string =>
        typeof text === "string" &&
        text.trim().length > 0,
    )
    .join("\n");
}
