// components/knowledge/editor/mermaid/mermaid-extension.ts

import {
  mergeAttributes,
  Node,
} from "@tiptap/core";
import { ReactNodeViewRenderer } from "@tiptap/react";

import { MermaidNodeView } from "./mermaid-node-view";

export const MermaidExtension = Node.create({
  name: "mermaidDiagram",

  group: "block",
  atom: true,
  draggable: true,
  selectable: true,

  addAttributes() {
    return {
      code: {
        default: "",
        parseHTML: (element) =>
          element.getAttribute("data-code") ?? "",
        renderHTML: (attributes) => ({
          "data-code": attributes.code,
        }),
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'div[data-type="mermaid-diagram"]',
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "div",
      mergeAttributes(HTMLAttributes, {
        "data-type": "mermaid-diagram",
      }),
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(MermaidNodeView);
  },
});