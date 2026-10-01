"use client";

import type { ComponentProps } from "react";
import { ArrowRight } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";

type AcademyMockActionProps = {
  title: string;
  label: string;
  className?: string;
  variant?: ComponentProps<typeof Button>["variant"];
  size?: ComponentProps<typeof Button>["size"];
};

export function AcademyMockAction({
  title,
  label,
  className,
  variant = "outline",
  size = "sm",
}: AcademyMockActionProps) {
  return (
    <Button
      variant={variant}
      size={size}
      className={className}
      aria-label={`${label}: ${title}`}
      onClick={() =>
        toast.info("Vista de demostracion", {
          description: `"${title}" es un curso de ejemplo. El contenido estara disponible mas adelante.`,
        })
      }
    >
      {label}
      <ArrowRight aria-hidden="true" />
    </Button>
  );
}
