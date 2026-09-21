"use client";

import { MessageSquareText } from "lucide-react";

import { Button } from "@/components/ui/button";

export function OpenAssistantButton() {
  return (
    <Button
      type="button"
      variant="brand"
      onClick={() => {
        window.dispatchEvent(
          new Event("crs:toggle-assistant"),
        );
      }}
    >
      <MessageSquareText className="h-4 w-4" />
      Hacer una pregunta
    </Button>
  );
}
