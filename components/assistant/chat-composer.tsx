// components/assistant/chat-composer.tsx
"use client";

import { Send } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

type Props = {
  conversationId?: string;
};

export function ChatComposer({
  conversationId,
}: Props) {
  const router = useRouter();

  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  async function sendMessage() {
    const content = message.trim();

    if (!content || loading) {
      return;
    }

    setLoading(true);

    try {
      const response = await fetch("/api/assistant", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          conversationId,
          message: content,
        }),
      });

      if (!response.ok) {
  const errorBody = await response.text();
  console.error("Assistant API error:", response.status, errorBody);
  throw new Error(errorBody || "Error enviando el mensaje");
}

      const result = await response.json();

      setMessage("");

      if (!conversationId) {
        router.push(`/assistant/${result.conversationId}`);
        return;
      }

      router.refresh();
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="border-t border-border bg-background px-8 py-4">
      <div className="mx-auto max-w-4xl rounded-2xl border border-border bg-panel p-3 shadow-sm">
        <textarea
          value={message}
          onChange={(event) => setMessage(event.target.value)}
          placeholder="Escribe una pregunta sobre el conocimiento de la empresa..."
          className="min-h-24 w-full resize-none border-0 bg-transparent px-2 py-1 text-sm outline-none"
          disabled={loading}
          onKeyDown={(event) => {
            if (event.key !== "Enter") {
              return;
            }

            if (event.shiftKey) {
              return;
            }

            event.preventDefault();

            void sendMessage();
          }}
        />

        <div className="flex items-center justify-between border-t border-border pt-3">
          <span className="text-xs text-muted-foreground">
            {loading
              ? "Pensando..."
              : "Pulsa Intro para enviar"}
          </span>

          <button
            onClick={() => {
              void sendMessage();
            }}
            disabled={loading}
            className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand text-white transition hover:bg-brand-hover disabled:opacity-50"
          >
            <Send className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}