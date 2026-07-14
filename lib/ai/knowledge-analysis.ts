// lib/ai/knowledge-analysis.ts
import { KnowledgeType } from "@/lib/knowledge/knowledge-types";

import { AI_MODELS } from "./models";
import { getOpenAI } from "./openai";
import {
  getKnowledgeAnalysisSystemPrompt,
  KNOWLEDGE_ANALYSIS_PROMPT_VERSION,
} from "./prompts/knowledge-analysis";

export async function analyzeKnowledgeText(
  text: string,
  knowledgeType: KnowledgeType,
) {
  const client = getOpenAI();
  const model = AI_MODELS.KNOWLEDGE_ANALYSIS;
  const startedAt = Date.now();

  const response = await client.responses.create({
    model,
    input: [
      {
        role: "system",
        content:
          getKnowledgeAnalysisSystemPrompt(knowledgeType),
      },
      {
        role: "user",
        content: text.slice(0, 180000),
      },
    ],
    text: {
      format: {
        type: "json_schema",
        name: "knowledge_analysis",
        strict: true,
        schema: {
          type: "object",
          additionalProperties: false,
          properties: {
            detected_type: {
              type: "string",
            },

            meta: {
              type: "object",
              additionalProperties: false,
              properties: {
                language: {
                  type: "string",
                },
                domain: {
                  type: "string",
                },
                level: {
                  type: "string",
                },
                confidence: {
                  type: "number",
                },
              },
              required: [
                "language",
                "domain",
                "level",
                "confidence",
              ],
            },

            summary: {
              type: "string",
            },

            objective: {
              type: "string",
            },

            scope: {
              type: "string",
            },

            tags: {
              type: "array",
              items: {
                type: "string",
              },
            },

            keywords: {
              type: "array",
              items: {
                type: "string",
              },
            },

            entities: {
              type: "array",
              items: {
                type: "object",
                additionalProperties: false,
                properties: {
                  name: {
                    type: "string",
                  },
                  type: {
                    type: "string",
                  },
                },
                required: ["name", "type"],
              },
            },

            important_dates: {
              type: "array",
              items: {
                type: "object",
                additionalProperties: false,
                properties: {
                  label: {
                    type: "string",
                  },
                  value: {
                    type: "string",
                  },
                },
                required: ["label", "value"],
              },
            },

            systems: {
              type: "array",
              items: {
                type: "object",
                additionalProperties: false,
                properties: {
                  name: {
                    type: "string",
                  },
                  description: {
                    type: "string",
                  },
                },
                required: ["name", "description"],
              },
            },

            actors: {
              type: "array",
              items: {
                type: "object",
                additionalProperties: false,
                properties: {
                  name: {
                    type: "string",
                  },
                  role: {
                    type: "string",
                  },
                },
                required: ["name", "role"],
              },
            },

            topics: {
              type: "array",
              items: {
                type: "string",
              },
            },

            concepts: {
              type: "array",
              items: {
                type: "object",
                additionalProperties: false,
                properties: {
                  name: {
                    type: "string",
                  },
                  definition: {
                    type: "string",
                  },
                },
                required: ["name", "definition"],
              },
            },

            prerequisites: {
              type: "array",
              items: {
                type: "string",
              },
            },

            triggers: {
              type: "array",
              items: {
                type: "string",
              },
            },

            business_rules: {
              type: "array",
              items: {
                type: "string",
              },
            },

            warnings: {
              type: "array",
              items: {
                type: "string",
              },
            },

            procedures: {
              type: "array",
              items: {
                type: "object",
                additionalProperties: false,
                properties: {
                  name: {
                    type: "string",
                  },
                  goal: {
                    type: "string",
                  },
                  steps: {
                    type: "array",
                    items: {
                      type: "object",
                      additionalProperties: false,
                      properties: {
                        order: {
                          type: "number",
                        },
                        title: {
                          type: "string",
                        },
                        instruction: {
                          type: "string",
                        },
                        expected_result: {
                          type: "string",
                        },
                      },
                      required: [
                        "order",
                        "title",
                        "instruction",
                        "expected_result",
                      ],
                    },
                  },
                },
                required: ["name", "goal", "steps"],
              },
            },

            outputs: {
              type: "array",
              items: {
                type: "string",
              },
            },

            glossary: {
              type: "array",
              items: {
                type: "object",
                additionalProperties: false,
                properties: {
                  term: {
                    type: "string",
                  },
                  definition: {
                    type: "string",
                  },
                },
                required: ["term", "definition"],
              },
            },

            common_questions: {
              type: "array",
              items: {
                type: "string",
              },
            },

            common_errors: {
              type: "array",
              items: {
                type: "string",
              },
            },

            applications: {
              type: "array",
              items: {
                type: "string",
              },
            },

            products: {
              type: "array",
              items: {
                type: "string",
              },
            },

            regulations: {
              type: "array",
              items: {
                type: "string",
              },
            },

            dependencies: {
              type: "array",
              items: {
                type: "string",
              },
            },

            related_documents: {
              type: "array",
              items: {
                type: "object",
                additionalProperties: false,
                properties: {
                  title: {
                    type: "string",
                  },
                  relationship: {
                    type: "string",
                    enum: [
                      "complements",
                      "prerequisite",
                      "extends",
                      "references",
                      "replaces",
                    ],
                  },
                  reason: {
                    type: "string",
                  },
                },
                required: [
                  "title",
                  "relationship",
                  "reason",
                ],
              },
            },

            source_references: {
              type: "array",
              items: {
                type: "object",
                additionalProperties: false,
                properties: {
                  section: {
                    type: "string",
                  },
                  claim: {
                    type: "string",
                  },
                  source_ids: {
                    type: "array",
                    items: {
                      type: "string",
                    },
                  },
                  source_files: {
                    type: "array",
                    items: {
                      type: "string",
                    },
                  },
                  pages: {
                    type: "array",
                    items: {
                      type: "number",
                    },
                  },
                },
                required: [
                  "section",
                  "claim",
                  "source_ids",
                  "source_files",
                  "pages",
                ],
              },
            },

            contradictions: {
              type: "array",
              items: {
                type: "object",
                additionalProperties: false,
                properties: {
                  topic: {
                    type: "string",
                  },
                  description: {
                    type: "string",
                  },
                  severity: {
                    type: "string",
                    enum: ["low", "medium", "high"],
                  },
                  sources: {
                    type: "array",
                    items: {
                      type: "object",
                      additionalProperties: false,
                      properties: {
                        source_id: {
                          type: "string",
                        },
                        file_name: {
                          type: "string",
                        },
                        statement: {
                          type: "string",
                        },
                      },
                      required: [
                        "source_id",
                        "file_name",
                        "statement",
                      ],
                    },
                  },
                  recommended_action: {
                    type: "string",
                  },
                },
                required: [
                  "topic",
                  "description",
                  "severity",
                  "sources",
                  "recommended_action",
                ],
              },
            },

            document_contributions: {
              type: "array",
              items: {
                type: "object",
                additionalProperties: false,
                properties: {
                  source_id: {
                    type: "string",
                  },
                  file_name: {
                    type: "string",
                  },
                  document_role: {
                    type: "string",
                    enum: [
                      "procedure",
                      "process",
                      "manual",
                      "policy",
                      "checklist",
                      "form",
                      "faq",
                      "technical",
                      "functional",
                      "catalog",
                      "reference",
                      "evidence",
                      "other",
                    ],
                  },
                  contribution_type: {
                    type: "string",
                    enum: [
                      "primary",
                      "complementary",
                      "policy",
                      "form",
                      "checklist",
                      "faq",
                      "reference",
                    ],
                  },
                  contribution_focus: {
                    type: "string",
                    enum: [
                      "procedure_steps",
                      "validation",
                      "governance",
                      "data_capture",
                      "answers",
                      "technical_detail",
                      "reference_context",
                      "evidence",
                      "mixed",
                    ],
                  },
                  summary: {
                    type: "string",
                  },
                  supported_sections: {
                    type: "array",
                    items: {
                      type: "string",
                    },
                  },
                },
                required: [
                  "source_id",
                  "file_name",
                  "document_role",
                  "contribution_type",
                  "contribution_focus",
                  "summary",
                  "supported_sections",
                ],
              },
            },

            quality_report: {
              type: "object",
              additionalProperties: false,
              properties: {
                document_count: {
                  type: "number",
                },
                source_coverage: {
                  type: "number",
                },
                contradiction_count: {
                  type: "number",
                },
                duplicate_topics: {
                  type: "array",
                  items: {
                    type: "string",
                  },
                },
                complementary_topics: {
                  type: "array",
                  items: {
                    type: "string",
                  },
                },
                unsupported_claims: {
                  type: "array",
                  items: {
                    type: "string",
                  },
                },
                confidence_notes: {
                  type: "array",
                  items: {
                    type: "string",
                  },
                },
              },
              required: [
                "document_count",
                "source_coverage",
                "contradiction_count",
                "duplicate_topics",
                "complementary_topics",
                "unsupported_claims",
                "confidence_notes",
              ],
            },
          },

          required: [
            "detected_type",
            "meta",
            "summary",
            "objective",
            "scope",
            "tags",
            "keywords",
            "entities",
            "important_dates",
            "systems",
            "actors",
            "topics",
            "concepts",
            "prerequisites",
            "triggers",
            "business_rules",
            "warnings",
            "procedures",
            "outputs",
            "glossary",
            "common_questions",
            "common_errors",
            "applications",
            "products",
            "regulations",
            "dependencies",
            "related_documents",
            "source_references",
            "contradictions",
            "document_contributions",
            "quality_report",
          ],
        },
      },
    },
  });

  return {
    analysisJson: JSON.parse(response.output_text),
    model,
    promptVersion:
      KNOWLEDGE_ANALYSIS_PROMPT_VERSION,
    tokensInput:
      response.usage?.input_tokens ?? null,
    tokensOutput:
      response.usage?.output_tokens ?? null,
    processingMs: Date.now() - startedAt,
  };
}
