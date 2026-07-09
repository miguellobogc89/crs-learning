// lib/ai/knowledge-analysis.ts
import { getOpenAI } from "./openai";
import { AI_MODELS } from "./models";
import {
  KNOWLEDGE_ANALYSIS_PROMPT_VERSION,
  getKnowledgeAnalysisSystemPrompt,
} from "./prompts/knowledge-analysis";
import { KnowledgeType } from "@/lib/knowledge/knowledge-types";

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
        content: getKnowledgeAnalysisSystemPrompt(knowledgeType),
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
            detected_type: { type: "string" },
            meta: {
              type: "object",
              additionalProperties: false,
              properties: {
                language: { type: "string" },
                domain: { type: "string" },
                level: { type: "string" },
                confidence: { type: "number" },
              },
              required: ["language", "domain", "level", "confidence"],
            },
            summary: { type: "string" },
            objective: { type: "string" },
            scope: { type: "string" },
            tags: {
              type: "array",
              items: { type: "string" },
            },
            keywords: {
              type: "array",
              items: { type: "string" },
            },
            entities: {
              type: "array",
              items: {
                type: "object",
                additionalProperties: false,
                properties: {
                  name: { type: "string" },
                  type: { type: "string" },
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
                  label: { type: "string" },
                  value: { type: "string" },
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
                  name: { type: "string" },
                  description: { type: "string" },
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
                  name: { type: "string" },
                  role: { type: "string" },
                },
                required: ["name", "role"],
              },
            },
            topics: {
              type: "array",
              items: { type: "string" },
            },
            concepts: {
              type: "array",
              items: {
                type: "object",
                additionalProperties: false,
                properties: {
                  name: { type: "string" },
                  definition: { type: "string" },
                },
                required: ["name", "definition"],
              },
            },
            prerequisites: {
              type: "array",
              items: { type: "string" },
            },
            triggers: {
              type: "array",
              items: { type: "string" },
            },
            business_rules: {
              type: "array",
              items: { type: "string" },
            },
            warnings: {
              type: "array",
              items: { type: "string" },
            },
            procedures: {
              type: "array",
              items: {
                type: "object",
                additionalProperties: false,
                properties: {
                  name: { type: "string" },
                  goal: { type: "string" },
                  steps: {
                    type: "array",
                    items: {
                      type: "object",
                      additionalProperties: false,
                      properties: {
                        order: { type: "number" },
                        title: { type: "string" },
                        instruction: { type: "string" },
                        expected_result: { type: "string" },
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
              items: { type: "string" },
            },
            glossary: {
              type: "array",
              items: {
                type: "object",
                additionalProperties: false,
                properties: {
                  term: { type: "string" },
                  definition: { type: "string" },
                },
                required: ["term", "definition"],
              },
            },
            common_questions: {
              type: "array",
              items: { type: "string" },
            },
            common_errors: {
              type: "array",
              items: { type: "string" },
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
          ],
        },
      },
    },
  });

  return {
    analysisJson: JSON.parse(response.output_text),
    model,
    promptVersion: KNOWLEDGE_ANALYSIS_PROMPT_VERSION,
    tokensInput: response.usage?.input_tokens ?? null,
    tokensOutput: response.usage?.output_tokens ?? null,
    processingMs: Date.now() - startedAt,
  };
}