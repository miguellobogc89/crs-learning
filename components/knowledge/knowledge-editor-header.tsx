// components/knowledge/knowledge-editor-header.tsx
import { Button } from "@/components/ui/button";
import { KNOWLEDGE_TYPE_LABELS } from "@/lib/knowledge/knowledge-types";

type Props = {
  title: string;
  description: string;
  visibility: string;
  knowledgeType: string;

  onTitleChange: (value: string) => void;
  onDescriptionChange: (value: string) => void;
  onVisibilityChange: (value: string) => void;
  onKnowledgeTypeChange: (value: string) => void;

  onCancel: () => void;
};

export function KnowledgeEditorHeader(props: Props) {
  return (
    <div className="mb-8 rounded-lg border border-border bg-panel p-6">
      <div className="grid gap-5">

        <div>
          <label className="mb-2 block text-sm font-medium">
            Título
          </label>

          <input
            className="w-full rounded-md border bg-background px-3 py-2"
            value={props.title}
            onChange={(e) => props.onTitleChange(e.target.value)}
          />
        </div>

        <div>
          <label className="mb-2 block text-sm font-medium">
            Descripción
          </label>

          <textarea
            rows={3}
            className="w-full rounded-md border bg-background px-3 py-2"
            value={props.description}
            onChange={(e) => props.onDescriptionChange(e.target.value)}
          />
        </div>

        <div className="grid grid-cols-2 gap-4">

          <div>
            <label className="mb-2 block text-sm font-medium">
              Tipo
            </label>

            <select
              className="w-full rounded-md border bg-background px-3 py-2"
              value={props.knowledgeType}
              onChange={(e) =>
                props.onKnowledgeTypeChange(e.target.value)
              }
            >
              {Object.entries(KNOWLEDGE_TYPE_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium">
              Visibilidad
            </label>

            <select
              className="w-full rounded-md border bg-background px-3 py-2"
              value={props.visibility}
              onChange={(e) =>
                props.onVisibilityChange(e.target.value)
              }
            >
              <option value="private">Privado</option>
              <option value="public">Público</option>
            </select>
          </div>

        </div>

        <div className="flex justify-end gap-3">

          <Button
            variant="ghost"
            type="button"
            onClick={props.onCancel}
          >
            Cancelar
          </Button>

          <Button type="submit">
            Guardar cambios
          </Button>

        </div>

      </div>
    </div>
  );
}