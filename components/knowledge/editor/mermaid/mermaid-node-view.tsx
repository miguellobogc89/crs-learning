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
  Maximize2,
  Minimize2,
  Trash2,
  ZoomIn,
  ZoomOut,
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
  const [zoom, setZoom] = useState(1);
  const [expanded, setExpanded] =
    useState(false);

  const code =
    typeof node.attrs.code === "string"
      ? node.attrs.code
      : "";

  const editable = editor.isEditable;
  const isReady =
    !code.trim() ||
    svg.length > 0 ||
    renderError !== null;

  function zoomIn() {
    setZoom((current) =>
      Math.min(1.8, Number((current + 0.15).toFixed(2))),
    );
  }

  function zoomOut() {
    setZoom((current) =>
      Math.max(0.75, Number((current - 0.15).toFixed(2))),
    );
  }

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

  const diagramBody = (
    <div
      className="min-h-[460px] overflow-auto bg-background p-6"
      data-knowledge-mermaid-body
    >
      {renderError ? (
        <div className="flex min-h-[360px] flex-col items-center justify-center text-center">
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
          className="flex min-h-[400px] min-w-[760px] items-start justify-center [&_svg]:h-auto [&_svg]:max-w-none"
          data-knowledge-mermaid-svg
          style={{
            transform: `scale(${zoom})`,
            transformOrigin: "top center",
          }}
          dangerouslySetInnerHTML={{
            __html: svg,
          }}
        />
      ) : (
        <div className="flex min-h-[360px] items-center justify-center text-sm text-muted-foreground">
          <span data-knowledge-mermaid-loading>
            Introduce codigo Mermaid para generar el
            diagrama.
          </span>
        </div>
      )}
    </div>
  );

  return (
    <NodeViewWrapper
      className="my-6"
      data-drag-handle
      data-knowledge-mermaid-block
      data-knowledge-mermaid-ready={
        isReady ? "true" : "false"
      }
    >
      <div
        className={[
          "overflow-hidden rounded-xl border bg-card",
          selected
            ? "border-primary ring-2 ring-primary/15"
            : "border-border",
        ].join(" ")}
      >
        <div
          className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-muted/30 px-4 py-2"
          data-knowledge-print-hidden
        >
          <div className="flex items-center gap-2 text-sm font-medium text-foreground">
            <Braces className="h-4 w-4 text-muted-foreground" />
            Diagrama Mermaid
          </div>

          <div className="flex items-center gap-1">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-muted-foreground"
              aria-label="Reducir diagrama"
              title="Reducir diagrama"
              onClick={zoomOut}
            >
              <ZoomOut className="h-4 w-4" />
            </Button>

            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-muted-foreground"
              aria-label="Ajustar diagrama"
              title="Ajustar diagrama"
              onClick={() => setZoom(1)}
            >
              <Minimize2 className="h-4 w-4" />
            </Button>

            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-muted-foreground"
              aria-label="Ampliar diagrama"
              title="Ampliar diagrama"
              onClick={zoomIn}
            >
              <ZoomIn className="h-4 w-4" />
            </Button>

            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-muted-foreground"
              aria-label="Pantalla completa"
              title="Pantalla completa"
              onClick={() => setExpanded(true)}
            >
              <Maximize2 className="h-4 w-4" />
            </Button>

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
        </div>

        {editable ? (
          <div className="border-b border-border p-4">
            <label className="mb-2 block text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Codigo del diagrama
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

        {diagramBody}
      </div>

      {expanded ? (
        <div className="fixed inset-0 z-50 bg-background/95 p-6">
          <div className="flex h-full flex-col overflow-hidden rounded-xl border border-border bg-card">
            <div className="flex items-center justify-between border-b border-border bg-muted/30 px-4 py-2">
              <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                <Braces className="h-4 w-4 text-muted-foreground" />
                Diagrama Mermaid
              </div>

              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-muted-foreground"
                aria-label="Cerrar pantalla completa"
                title="Cerrar pantalla completa"
                onClick={() => setExpanded(false)}
              >
                <Minimize2 className="h-4 w-4" />
              </Button>
            </div>

            <div className="min-h-0 flex-1 overflow-auto">
              {diagramBody}
            </div>
          </div>
        </div>
      ) : null}
    </NodeViewWrapper>
  );
}
