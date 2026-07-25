// components/knowledge/content/toolbar/knowledge-navigation.tsx
"use client";

import type { ReactNode } from "react";
import {
  ArrowLeft,
  ArrowRight,
  ArrowUp,
} from "lucide-react";

import { useKnowledgeNavigationHistory } from "./use-knowledge-navigation-history";

type NavigationButtonProps = {
  enabled: boolean;
  label: string;
  onClick: () => void;
  children: ReactNode;
};

type Props = {
  breadcrumb: ReactNode;
  parentHref: string | null;
};

function NavigationButton({
  enabled,
  label,
  onClick,
  children,
}: NavigationButtonProps) {
  return (
    <button
      type="button"
      onClick={enabled ? onClick : undefined}
      disabled={!enabled}
      tabIndex={enabled ? 0 : -1}
      className={[
        "inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border transition",
        enabled
          ? [
              "cursor-pointer",
              "border-transparent",
              "text-muted-foreground",
              "hover:border-border",
              "hover:bg-muted",
              "hover:text-foreground",
            ].join(" ")
          : [
              "cursor-not-allowed",
              "border-transparent",
              "bg-transparent",
              "text-border",
              "opacity-40",
            ].join(" "),
      ].join(" ")}
      title={enabled ? label : undefined}
      aria-label={label}
    >
      {children}
    </button>
  );
}

export function KnowledgeNavigation({
  breadcrumb,
  parentHref,
}: Props) {
  const {
    canGoBack,
    canGoForward,
    goBack,
    goForward,
    navigateTo,
  } = useKnowledgeNavigationHistory();

  const canGoToParent = parentHref !== null;

  function goToParent() {
    if (!parentHref) {
      return;
    }

    navigateTo(parentHref);
  }

  return (
    <div className="flex min-h-10 items-center gap-1 pb-3">
      <NavigationButton
        enabled={canGoBack}
        label="Volver a la ubicación anterior"
        onClick={goBack}
      >
        <ArrowLeft
          className="h-4 w-4"
          strokeWidth={2.25}
        />
      </NavigationButton>

      <NavigationButton
        enabled={canGoForward}
        label="Ir a la ubicación siguiente"
        onClick={goForward}
      >
        <ArrowRight
          className="h-4 w-4"
          strokeWidth={2.25}
        />
      </NavigationButton>

      <NavigationButton
        enabled={canGoToParent}
        label="Subir a la carpeta superior"
        onClick={goToParent}
      >
        <ArrowUp
          className="h-4 w-4"
          strokeWidth={2.25}
        />
      </NavigationButton>

      <div className="min-w-0 pl-1">
        {breadcrumb}
      </div>
    </div>
  );
}