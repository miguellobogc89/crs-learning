// components/knowledge/editor/mermaid/mermaid-node-view.tsx

"use client";

import {
  useEffect,
  useId,
  useState,
} from "react";
import {
  AlertTriangle,
  Braces,
  Trash2,
} from "lucide-react";
import {
  NodeViewWrapper,
  type NodeViewProps,
} from "@tiptap/react";

import { Button } from "@/components/ui/button";

export function MermaidNodeView({
  node,
  editor,
  updateAttributes,
  deleteNode,
  selected,
}: NodeViewProps) {
  const reactId = useId();

  const [svg, setSvg] = useState("");
  const [renderError, setRenderError] =
    useState<string | null>(null);

  const code =
    typeof node.attrs.code === "string"
      ? node.attrs.code
      : "";

  const editable = editor.isEditable;

  useEffect(() => {
    let cancelled = false;

    async function renderDiagram() {
      if (!code.trim()) {
        setSvg("");
        setRenderError(null);
        return;
      }

      try {
        const mermaidModule = await import("mermaid");
        const mermaid = mermaidModule.default;

        mermaid.initialize({
          startOnLoad: false,
          securityLevel: "strict",
          theme: "default",
        });

        const diagramId = `mermaid-${reactId.replace(
          /[^a-zA-Z0-9-_]/g,
          "",
        )}-${Date.now()}`;

        const result = await mermaid.render(
          diagramId,
          code,
        );

        if (cancelled) {
          return;
        }

        setSvg(result.svg);
        setRenderError(null);
      } catch (error) {
        if (cancelled) {
          return;
        }

        console.error(
          "No se pudo renderizar Mermaid:",
          error,
        );

        setSvg("");
        setRenderError(
          error instanceof Error
            ? error.message
            : "El diagrama contiene un error.",
        );
      }
    }

    const timeout = window.setTimeout(
      renderDiagram,
      250,
    );

    return () => {
      cancelled = true;
      window.clearTimeout(timeout);
    };
  }, [code, reactId]);

  return (
    <NodeViewWrapper
      className="my-6"
      data-drag-handle
    >
      <div
        className={[
          "overflow-hidden rounded-xl border bg-card",
          selected
            ? "border-primary ring-2 ring-primary/15"
            : "border-border",
        ].join(" ")}
      >
        <div className="flex items-center justify-between border-b border-border bg-muted/30 px-4 py-2">
          <div className="flex items-center gap-2 text-sm font-medium text-foreground">
            <Braces className="h-4 w-4 text-muted-foreground" />
            Diagrama Mermaid
          </div>

          {editable ? (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-muted-foreground hover:text-destructive"
              aria-label="Eliminar diagrama"
              title="Eliminar diagrama"
              onClick={deleteNode}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          ) : null}
        </div>

        {editable ? (
          <div className="border-b border-border p-4">
            <label className="mb-2 block text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Código del diagrama
            </label>

            <textarea
              value={code}
              rows={8}
              spellCheck={false}
              className="w-full resize-y rounded-lg border border-border bg-background px-3 py-3 font-mono text-sm leading-6 text-foreground outline-none transition focus:border-ring focus:ring-2 focus:ring-ring/20"
              onChange={(event) => {
                updateAttributes({
                  code: event.target.value,
                });
              }}
              onKeyDown={(event) => {
                event.stopPropagation();
              }}
            />
          </div>
        ) : null}

        <div className="min-h-[180px] overflow-x-auto bg-background p-6">
          {renderError ? (
            <div className="flex min-h-[130px] flex-col items-center justify-center text-center">
              <AlertTriangle className="h-6 w-6 text-destructive" />

              <p className="mt-3 text-sm font-medium text-foreground">
                No se puede mostrar el diagrama
              </p>

              <p className="mt-1 max-w-xl text-xs leading-5 text-muted-foreground">
                {renderError}
              </p>
            </div>
          ) : svg ? (
            <div
              className="flex justify-center [&_svg]:h-auto [&_svg]:max-w-full"
              dangerouslySetInnerHTML={{
                __html: svg,
              }}
            />
          ) : (
            <div className="flex min-h-[130px] items-center justify-center text-sm text-muted-foreground">
              Introduce código Mermaid para generar el
              diagrama.
            </div>
          )}
        </div>
      </div>
    </NodeViewWrapper>
  );
}