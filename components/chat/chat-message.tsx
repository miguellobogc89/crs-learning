// components/chat/chat-message.tsx
"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import {
  Bot,
  FileText,
  User,
} from "lucide-react";


type ChatSource = {
  citationId: string;
  knowledgeSourceId: string;
  title: string;
  description: string | null;
  libraryId: string | null;
  libraryName: string | null;
  sourceType: "analysis" | "manual" | "file";
  fileName: string | null;
  score: number;
};

type ChatMessageData = {
  id: string;
  role: "user" | "assistant";
  content: string;
  sources: ChatSource[];
};

type Props = {
  message: ChatMessageData;
};

type ContentPart =
  | {
      type: "text";
      value: string;
    }
  | {
      type: "citation";
      citationIds: string[];
    };

export function ChatMessage({
  message,
}: Props) {
  const isUser = message.role === "user";

  return (
    <div
      className={
        isUser
          ? "flex justify-end"
          : "flex justify-start"
      }
    >
      <div
        className={
          isUser
            ? `
                flex max-w-[78%] gap-3
                rounded-2xl rounded-br-md
                border border-border
                bg-muted/60 px-4 py-3
                text-foreground
              `
            : `
                flex max-w-[82%] gap-3
                rounded-2xl rounded-bl-md
                border border-border
                bg-card px-4 py-3
                text-foreground shadow-sm
              `
        }
      >
        <div className="mt-1 shrink-0">
          {isUser ? (
            <User className="h-4 w-4 text-muted-foreground" />
          ) : (
            <Bot className="h-4 w-4 text-brand" />
          )}
        </div>

        <div className="min-w-0 flex-1">
          {isUser ? (
            <p className="whitespace-pre-wrap text-sm leading-7">
              {message.content}
            </p>
          ) : (
            <>
              <AssistantMessageContent
                text={message.content}
                sources={message.sources}
              />

              <ConsultedArticles
                message={message}
              />
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function AssistantMessageContent({
  text,
  sources,
}: {
  text: string;
  sources: ChatSource[];
}) {
  const parts = splitCitationGroups(text);

  return (
    <div className="whitespace-pre-wrap text-sm leading-7">
      {parts.map((part, index) => {
        if (part.type === "citation") {
          const source = findFirstSource(
            part.citationIds,
            sources,
          );

          if (!source) {
            return null;
          }

          return (
            <InlineSourceReference
              key={`citation-${index}`}
              source={source}
            />
          );
        }

        const nextPart = parts[index + 1];

        if (nextPart?.type === "citation") {
          return (
            <HighlightedStatement
              key={`text-${index}`}
              text={part.value}
            />
          );
        }

        return (
          <span key={`text-${index}`}>
            {part.value}
          </span>
        );
      })}
    </div>
  );
}

function HighlightedStatement({
  text,
}: {
  text: string;
}) {
  const {
    prefix,
    statement,
  } = separateLastStatement(text);

  return (
    <>
      {prefix}

      <strong className="font-semibold text-primary">
        {statement}
      </strong>
    </>
  );
}

function InlineSourceReference({
  source,
}: {
  source: ChatSource;
}) {
  const [isOpen, setIsOpen] = useState(false);

  const closeTimeoutRef =
    useRef<ReturnType<typeof setTimeout> | null>(
      null,
    );

  const documentName =
    source.fileName ?? source.title;

  const hasDocument = Boolean(source.fileName);

  function openTooltip() {
    if (closeTimeoutRef.current) {
      clearTimeout(closeTimeoutRef.current);
      closeTimeoutRef.current = null;
    }

    setIsOpen(true);
  }

  function scheduleCloseTooltip() {
    if (closeTimeoutRef.current) {
      clearTimeout(closeTimeoutRef.current);
    }

    closeTimeoutRef.current = setTimeout(() => {
      setIsOpen(false);
      closeTimeoutRef.current = null;
    }, 1500);
  }

  return (
    <span
      className="relative ml-1 inline-flex align-middle"
      onMouseEnter={openTooltip}
      onMouseLeave={scheduleCloseTooltip}
    >
      <button
        type="button"
        aria-label={`Ver fuente: ${documentName}`}
        onClick={() => {
          setIsOpen((current) => !current);
        }}
        onFocus={openTooltip}
        onBlur={scheduleCloseTooltip}
        className="
          inline-flex h-6 w-6 items-center justify-center
          rounded-md border border-primary/20
          bg-primary/5 transition-colors
          hover:bg-primary/10
        "
      >
        {hasDocument ? (
          <img
            src="/icons/files/pdf.png"
            alt="Documento PDF"
            width={16}
            height={16}
            className="block h-4 w-4 object-contain"
          />
        ) : (
          <FileText className="h-4 w-4 text-primary" />
        )}
      </button>

      {isOpen && (
        <span
          className="
            absolute bottom-[calc(100%+6px)] left-1/2
            z-[100] w-72 -translate-x-1/2
            rounded-xl border border-border
            bg-popover p-3 text-left
            text-xs font-normal text-popover-foreground
            shadow-xl
          "
          onMouseEnter={openTooltip}
          onMouseLeave={scheduleCloseTooltip}
        >
          <span className="block text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
            {hasDocument ? "Documento consultado" : "Artículo consultado"}
          </span>

          <span className="mt-1 block select-text font-medium leading-5">
            {documentName}
          </span>

          <span className="mt-1 block select-text text-[11px] text-muted-foreground">
            Artículo: {source.title}
          </span>

          <Link
            href={`/knowledge/${source.knowledgeSourceId}`}
            className="
              mt-2 inline-flex font-semibold
              text-primary hover:underline
              hover:underline-offset-2
            "
          >
            Abrir artículo
          </Link>
        </span>
      )}
    </span>
  );
}

function ConsultedArticles({
  message,
}: {
  message: ChatMessageData;
}) {
  const citedIds = extractCitationIds(
    message.content,
  );

  const citedSources = message.sources.filter(
    (source) =>
      citedIds.has(source.citationId),
  );

  const articles =
    getUniqueConsultedArticles(citedSources);

  if (articles.length === 0) {
    return null;
  }

  return (
    <div className="mt-3 border-t border-border/60 pt-2">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        {articles.map((article) => (
          <button
            key={article.knowledgeSourceId}
            type="button"
            className="
              inline-flex items-center gap-1.5
              text-[10px] italic
              text-muted-foreground
              transition-colors
              hover:text-foreground
            "
          >
            <FileText className="h-3 w-3 shrink-0 text-primary" />

            <span>
              {article.title}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

function splitCitationGroups(
  text: string,
): ContentPart[] {
  const pattern =
    /((?:\s*\[F\d+\]\s*)+)/g;

  const rawParts = text.split(pattern);
  const parts: ContentPart[] = [];

  for (const rawPart of rawParts) {
    if (!rawPart) {
      continue;
    }

    const matches = Array.from(
      rawPart.matchAll(/\[(F\d+)\]/g),
    );

    if (matches.length === 0) {
      parts.push({
        type: "text",
        value: rawPart,
      });

      continue;
    }

    const citationIds = matches.map(
      (match) => match[1],
    );

    parts.push({
      type: "citation",
      citationIds,
    });
  }

  return parts;
}

function findFirstSource(
  citationIds: string[],
  sources: ChatSource[],
) {
  for (const citationId of citationIds) {
    const source = sources.find(
      (candidate) =>
        candidate.citationId === citationId,
    );

    if (source) {
      return source;
    }
  }

  return null;
}

function getUniqueConsultedArticles(
  sources: ChatSource[],
) {
  const uniqueArticles = new Map<
    string,
    ChatSource
  >();

  for (const source of sources) {
    if (
      uniqueArticles.has(
        source.knowledgeSourceId,
      )
    ) {
      continue;
    }

    uniqueArticles.set(
      source.knowledgeSourceId,
      source,
    );
  }

  return Array.from(
    uniqueArticles.values(),
  );
}

function getInlineSourceLabel(
  source: ChatSource,
) {
  if (
    source.sourceType === "file" &&
    source.fileName
  ) {
    return source.fileName;
  }

  return source.title;
}

function separateLastStatement(
  text: string,
) {
  const trailingWhitespace =
    text.match(/\s*$/)?.[0] ?? "";

  const content = text.slice(
    0,
    text.length - trailingWhitespace.length,
  );

  const boundaryPattern =
    /(?:\n\n|\n|[.!?]\s+)/g;

  let lastBoundaryEnd = 0;
  let match =
    boundaryPattern.exec(content);

  while (match) {
    lastBoundaryEnd =
      match.index + match[0].length;

    match =
      boundaryPattern.exec(content);
  }

  if (lastBoundaryEnd === 0) {
    return {
      prefix: "",
      statement:
        content + trailingWhitespace,
    };
  }

  return {
    prefix: content.slice(
      0,
      lastBoundaryEnd,
    ),
    statement:
      content.slice(lastBoundaryEnd) +
      trailingWhitespace,
  };
}

function extractCitationIds(
  text: string,
) {
  const citationIds = new Set<string>();
  const pattern = /\[(F\d+)\]/g;

  let match = pattern.exec(text);

  while (match) {
    citationIds.add(match[1]);
    match = pattern.exec(text);
  }

  return citationIds;
}