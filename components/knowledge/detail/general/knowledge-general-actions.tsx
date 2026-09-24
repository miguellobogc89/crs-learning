// components/knowledge/detail/general/knowledge-general-actions.tsx

"use client";

import { useEffect, useState } from "react";

import { KnowledgeActionBar } from
  "@/components/knowledge/shared/knowledge-action-bar";

import { parseKnowledgeAnalysis } from
  "@/lib/knowledge/parse-knowledge-analysis";

import { KnowledgeSummaryPanel } from
  "./knowledge-summary-panel";

type Props = {
  analysisJson: unknown;
  isRebuilding: boolean;
  onRebuild: () => void;
};

export function KnowledgeGeneralActions({
  analysisJson,
  isRebuilding,
  onRebuild,
}: Props) {
  const analysis = parseKnowledgeAnalysis(
    analysisJson as Parameters<
      typeof parseKnowledgeAnalysis
    >[0],
  );

  const summary = analysis?.executiveSummary;

  const [isEditing, setIsEditing] = useState(false);
  const [synthesis, setSynthesis] = useState("");
  const [keyPoints, setKeyPoints] = useState<string[]>([]);

  useEffect(() => {
    if (isEditing) return;

    setSynthesis(summary?.synthesis ?? "");
    setKeyPoints(summary?.keyPoints ?? []);
  }, [analysisJson, isEditing]);

  function startEditingSummary() {
    setSynthesis(summary?.synthesis ?? "");
    setKeyPoints(summary?.keyPoints ?? []);
    setIsEditing(true);
  }

  function cancelEditingSummary() {
    setIsEditing(false);
  }

  return (
    <div className="space-y-8">
      <KnowledgeActionBar
        isEditing={isEditing}
        isRebuilding={isRebuilding}
        canEdit={Boolean(summary)}
        canDownload={false}
        onEdit={startEditingSummary}
        onCancel={cancelEditingSummary}
        onRebuild={onRebuild}
        onSave={() => {
          // Pendiente: persistir en analysis_json.
        }}
        onDownload={() => {
          // Pendiente: generar y descargar el PDF.
        }}
      />

      {isEditing ? (
        <div className="mx-auto w-full max-w-4xl space-y-6">
          <div>
            <label
              htmlFor="knowledge-summary"
              className="mb-2 block text-sm font-medium"
            >
              Resumen
            </label>

            <textarea
              id="knowledge-summary"
              value={synthesis}
              onChange={(event) =>
                setSynthesis(event.target.value)
              }
              rows={8}
              className="w-full rounded-lg border border-border bg-background p-3 text-sm"
            />
          </div>

          <div className="space-y-3">
            <h3 className="text-sm font-medium">
              Puntos clave
            </h3>

            {keyPoints.map((point, index) => (
              <div
                key={index}
                className="flex items-start gap-2"
              >
                <textarea
                  aria-label={`Punto clave ${index + 1}`}
                  value={point}
                  onChange={(event) => {
                    const next = [...keyPoints];
                    next[index] = event.target.value;
                    setKeyPoints(next);
                  }}
                  rows={2}
                  className="w-full rounded-lg border border-border bg-background p-3 text-sm"
                />

                <button
                  type="button"
                  onClick={() =>
                    setKeyPoints((current) =>
                      current.filter((_, i) => i !== index),
                    )
                  }
                  className="rounded-lg border border-border px-3 py-2 text-sm"
                >
                  Quitar
                </button>
              </div>
            ))}

            {keyPoints.length < 5 && (
              <button
                type="button"
                onClick={() =>
                  setKeyPoints((current) => [...current, ""])
                }
                className="rounded-lg border border-border px-3 py-2 text-sm"
              >
                Añadir punto
              </button>
            )}
          </div>
        </div>
      ) : summary ? (
        <KnowledgeSummaryPanel summary={summary} />
      ) : null}
    </div>
  );
}