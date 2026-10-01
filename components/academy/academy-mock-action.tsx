"use client";

import { ArrowRight } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

export function AcademyMockAction({ title, label }: { title: string; label: string }) {
  return (
    <Button
      variant="outline"
      className="w-fit max-w-full text-xs"
      aria-label={`${label}: ${title}`}
      onClick={() => toast.info("Vista de demostración", {
        description: `«${title}» es un curso de ejemplo. El contenido estará disponible más adelante.`,
      })}
    >
      {label}<ArrowRight aria-hidden="true" />
    </Button>
  );
}
