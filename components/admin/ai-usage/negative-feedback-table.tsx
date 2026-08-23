// components/admin/ai-usage/ai-negative-feedback-table.tsx

"use client";

import {
  DataTable,
  type DataTableColumn,
} from "@/components/ui/data-table";

type NegativeFeedbackItem = {
  id: string;
  userName: string;
  userEmail: string;
  question: string;
  createdAt: Date;
};

type AiNegativeFeedbackTableProps = {
  feedback: NegativeFeedbackItem[];
};

export function AiNegativeFeedbackTable({
  feedback,
}: AiNegativeFeedbackTableProps) {
  const columns: DataTableColumn<NegativeFeedbackItem>[] = [
    {
      id: "user",
      header: "Usuario",
      align: "center",
      render: (item) => (
        <div>
          <div className="font-medium">
            {item.userName || "Sin nombre"}
          </div>

          <div className="text-[0.85em] text-muted-foreground">
            {item.userEmail}
          </div>
        </div>
      ),
    },
    {
      id: "question",
      header: "Pregunta",
      align: "left",
      render: (item) => (
        <span
          title={item.question}
          className="line-clamp-2"
        >
          {item.question}
        </span>
      ),
    },
    {
      id: "createdAt",
      header: "Fecha",
      align: "center",
      render: (item) =>
        new Date(
          item.createdAt,
        ).toLocaleDateString(
          "es-ES",
          {
            year: "numeric",
            month: "short",
            day: "numeric",
            hour: "2-digit",
            minute: "2-digit",
          },
        ),
    },
  ];

  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-base font-semibold text-foreground">
          Respuestas con feedback negativo
        </h2>

        <p className="mt-1 text-sm text-muted-foreground">
          Revisa las preguntas donde los usuarios indicaron que la respuesta no fue útil.
        </p>
      </div>

      <DataTable
        rows={feedback}
        columns={columns}
        getRowId={(item) => item.id}
        emptyMessage="Todavía no hay respuestas con feedback negativo."
      />
    </section>
  );
}