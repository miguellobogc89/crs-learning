// components/knowledge/editor/knowledge-editor.tsx

"use client";

import { useEffect } from "react";
import {
  Bold,
  Braces,
  Heading2,
  Heading3,
  Italic,
  List,
  ListOrdered,
  Redo2,
  Strikethrough,
  Undo2,
} from "lucide-react";
import {
  EditorContent,
  useEditor,
} from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import { MermaidExtension } from "./mermaid/mermaid-extension";

type KnowledgeEditorProps = {
  value: string;
  onChange: (value: string) => void;
  editable?: boolean;
  className?: string;
};

const DEFAULT_MERMAID_DIAGRAM = `flowchart LR
    A[Inicio] --> B{Decisión}
    B -->|Sí| C[Continuar]
    B -->|No| D[Revisar]`;

function normalizeKnowledgeContent(
  html: string,
) {
  if (
    !html ||
    typeof window === "undefined"
  ) {
    return html;
  }

  const document = new DOMParser().parseFromString(
    html,
    "text/html",
  );

  const mermaidBlocks =
    document.querySelectorAll(
      "pre > code.language-mermaid",
    );

  mermaidBlocks.forEach((codeElement) => {
    const preElement =
      codeElement.parentElement;

    if (!preElement) {
      return;
    }

    const diagramElement =
      document.createElement("div");

    diagramElement.setAttribute(
      "data-type",
      "mermaid-diagram",
    );

    diagramElement.setAttribute(
      "data-code",
      codeElement.textContent?.trim() ?? "",
    );

    preElement.replaceWith(diagramElement);
  });

  return document.body.innerHTML;
}

export function KnowledgeEditor({
  value,
  onChange,
  editable = true,
  className,
}: KnowledgeEditorProps) {
  const editor = useEditor({
    immediatelyRender: false,

    extensions: [
      StarterKit.configure({
        heading: {
          levels: [2, 3],
        },
      }),
      TaskList,

TaskItem.configure({
  nested: true,
}),
      MermaidExtension, 
    ],

    content: normalizeKnowledgeContent(
      value || "",
    ),

    editable,

    editorProps: {
      attributes: {
        class: cn(
          "min-h-[420px] w-full px-6 py-5",
          "text-sm leading-7 text-foreground",
          "outline-none",
          "[&_p]:my-3",
          "[&_h2]:mb-3 [&_h2]:mt-7",
          "[&_h2]:text-2xl [&_h2]:font-semibold",
          "[&_h2]:tracking-tight",
          "[&_h3]:mb-2 [&_h3]:mt-6",
          "[&_h3]:text-xl [&_h3]:font-semibold",
          "[&_ul]:my-4 [&_ul]:list-disc",
          "[&_ul]:pl-6",
          "[&_ul[data-type='taskList']]:list-none",
          "[&_ul[data-type='taskList']]:space-y-2",
          "[&_ul[data-type='taskList']]:pl-0",
          "[&_ul[data-type='taskList']_li]:my-0",
          "[&_ul[data-type='taskList']_li]:flex",
          "[&_ul[data-type='taskList']_li]:items-start",
          "[&_ul[data-type='taskList']_li]:gap-3",
          "[&_ul[data-type='taskList']_li]:rounded-lg",
          "[&_ul[data-type='taskList']_li]:border",
          "[&_ul[data-type='taskList']_li]:border-border",
          "[&_ul[data-type='taskList']_li]:bg-background",
          "[&_ul[data-type='taskList']_li]:px-3",
          "[&_ul[data-type='taskList']_li]:py-2",
          "[&_ul[data-type='taskList']_label]:mt-1",
          "[&_ul[data-type='taskList']_label]:flex",
          "[&_ul[data-type='taskList']_label]:h-5",
          "[&_ul[data-type='taskList']_label]:w-5",
          "[&_ul[data-type='taskList']_label]:shrink-0",
          "[&_ul[data-type='taskList']_input]:h-4",
          "[&_ul[data-type='taskList']_input]:w-4",
          "[&_ul[data-type='taskList']_input]:appearance-none",
          "[&_ul[data-type='taskList']_input]:rounded-full",
          "[&_ul[data-type='taskList']_input]:border-2",
          "[&_ul[data-type='taskList']_input]:border-emerald-500",
          "[&_ul[data-type='taskList']_input]:bg-background",
          "[&_ul[data-type='taskList']_input]:checked:border-emerald-600",
          "[&_ul[data-type='taskList']_input]:checked:bg-emerald-600",
          "[&_ul[data-type='taskList']_div]:min-w-0",
          "[&_ul[data-type='taskList']_div]:flex-1",
          "[&_ul[data-type='taskList']_p]:my-0",
          "[&_ul[data-type='taskList']_p]:leading-6",
          "[&_ol]:my-4 [&_ol]:list-decimal",
          "[&_ol]:pl-6",
          "[&_li]:my-1",
          "[&_blockquote]:my-5",
          "[&_blockquote]:border-l-4",
          "[&_blockquote]:border-border",
          "[&_blockquote]:pl-4",
          "[&_blockquote]:italic",
          "[&_blockquote]:text-muted-foreground",
          "[&_hr]:my-8 [&_hr]:border-border",
          "[&_pre]:my-5",
          "[&_pre]:overflow-x-auto",
          "[&_pre]:rounded-lg",
          "[&_pre]:bg-muted [&_pre]:p-4",
          "[&_pre]:font-mono [&_pre]:text-sm",
          "[&_code]:rounded",
          "[&_code]:bg-muted",
          "[&_code]:px-1.5 [&_code]:py-0.5",
        ),
      },
    },

    onUpdate: ({ editor: currentEditor }) => {
      onChange(currentEditor.getHTML());
    },
  });

  useEffect(() => {
    if (!editor) {
      return;
    }

    editor.setEditable(editable);
  }, [editor, editable]);

  useEffect(() => {
    if (!editor) {
      return;
    }

    const currentContent = editor.getHTML();
    const nextContent =
      normalizeKnowledgeContent(value || "");

    if (currentContent === nextContent) {
      return;
    }

    queueMicrotask(() => {
      if (editor.isDestroyed) {
        return;
      }

      editor.commands.setContent(nextContent, {
        emitUpdate: false,
      });
    });
  }, [editor, value]);

  if (!editor) {
    return (
      <div
        className={cn(
          "min-h-[420px] animate-pulse rounded-xl border border-border bg-muted/30",
          className,
        )}
      />
    );
  }

  return (
    <div
      className={cn(
        "overflow-hidden rounded-xl border border-border bg-card",
        "transition-shadow",
        "focus-within:ring-2",
        "focus-within:ring-ring/20",
        className,
      )}
    >
      {editable ? (
        <div className="flex flex-wrap items-center gap-1 border-b border-border bg-muted/30 px-3 py-2">
          <ToolbarButton
            label="Deshacer"
            active={false}
            disabled={
              !editor
                .can()
                .chain()
                .focus()
                .undo()
                .run()
            }
            onClick={() => {
              editor.chain().focus().undo().run();
            }}
          >
            <Undo2 className="h-4 w-4" />
          </ToolbarButton>

          <ToolbarButton
            label="Rehacer"
            active={false}
            disabled={
              !editor
                .can()
                .chain()
                .focus()
                .redo()
                .run()
            }
            onClick={() => {
              editor.chain().focus().redo().run();
            }}
          >
            <Redo2 className="h-4 w-4" />
          </ToolbarButton>

          <ToolbarSeparator />

          <ToolbarButton
            label="Negrita"
            active={editor.isActive("bold")}
            onClick={() => {
              editor
                .chain()
                .focus()
                .toggleBold()
                .run();
            }}
          >
            <Bold className="h-4 w-4" />
          </ToolbarButton>

          <ToolbarButton
            label="Cursiva"
            active={editor.isActive("italic")}
            onClick={() => {
              editor
                .chain()
                .focus()
                .toggleItalic()
                .run();
            }}
          >
            <Italic className="h-4 w-4" />
          </ToolbarButton>

          <ToolbarButton
            label="Tachado"
            active={editor.isActive("strike")}
            onClick={() => {
              editor
                .chain()
                .focus()
                .toggleStrike()
                .run();
            }}
          >
            <Strikethrough className="h-4 w-4" />
          </ToolbarButton>

          <ToolbarSeparator />

          <ToolbarButton
            label="Título 2"
            active={editor.isActive("heading", {
              level: 2,
            })}
            onClick={() => {
              editor
                .chain()
                .focus()
                .toggleHeading({
                  level: 2,
                })
                .run();
            }}
          >
            <Heading2 className="h-4 w-4" />
          </ToolbarButton>

          <ToolbarButton
            label="Título 3"
            active={editor.isActive("heading", {
              level: 3,
            })}
            onClick={() => {
              editor
                .chain()
                .focus()
                .toggleHeading({
                  level: 3,
                })
                .run();
            }}
          >
            <Heading3 className="h-4 w-4" />
          </ToolbarButton>

          <ToolbarSeparator />

          <ToolbarButton
            label="Lista"
            active={editor.isActive("bulletList")}
            onClick={() => {
              editor
                .chain()
                .focus()
                .toggleBulletList()
                .run();
            }}
          >
            <List className="h-4 w-4" />
          </ToolbarButton>

          <ToolbarButton
            label="Lista numerada"
            active={editor.isActive("orderedList")}
            onClick={() => {
              editor
                .chain()
                .focus()
                .toggleOrderedList()
                .run();
            }}
          >
            <ListOrdered className="h-4 w-4" />
          </ToolbarButton>

          <ToolbarSeparator />

          <ToolbarButton
            label="Insertar diagrama"
            active={editor.isActive(
              "mermaidDiagram",
            )}
            onClick={() => {
              editor
                .chain()
                .focus()
                .insertContent({
                  type: "mermaidDiagram",
                  attrs: {
                    code: DEFAULT_MERMAID_DIAGRAM,
                  },
                })
                .run();
            }}
          >
            <Braces className="h-4 w-4" />
          </ToolbarButton>
        </div>
      ) : null}

      <EditorContent editor={editor} />
    </div>
  );
}

type ToolbarButtonProps = {
  label: string;
  active: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
};

function ToolbarButton({
  label,
  active,
  disabled = false,
  onClick,
  children,
}: ToolbarButtonProps) {
  return (
    <Button
      type="button"
      variant={active ? "secondary" : "ghost"}
      size="icon"
      className="h-8 w-8"
      disabled={disabled}
      aria-label={label}
      title={label}
      onMouseDown={(event) => {
        event.preventDefault();
      }}
      onClick={onClick}
    >
      {children}
    </Button>
  );
}

function ToolbarSeparator() {
  return (
    <div className="mx-1 h-5 w-px bg-border" />
  );
}
