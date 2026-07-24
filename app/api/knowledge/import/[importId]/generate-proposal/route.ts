// app/api/knowledge/import/[importId]/generate-proposal/route.ts

import { auth } from "@/auth";
import {
  generateKnowledgeImportProposal,
  type KnowledgeImportProposalProgress,
} from "@/lib/knowledge/import/generate-proposal";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

type RouteContext = {
  params: Promise<{
    importId: string;
  }>;
};

type ProposalStreamEvent =
  | {
      type: "progress";
      progress: KnowledgeImportProposalProgress;
    }
  | {
      type: "completed";
      result: Awaited<
        ReturnType<
          typeof generateKnowledgeImportProposal
        >
      >;
    }
  | {
      type: "error";
      error: string;
    };

function serializeEvent(
  event: ProposalStreamEvent,
) {
  return `${JSON.stringify(event)}\n`;
}

export async function POST(
  _request: Request,
  context: RouteContext,
) {
  const session = await auth();

  if (!session?.user?.id) {
    return Response.json(
      {
        error: "No autorizado",
      },
      {
        status: 401,
      },
    );
  }

  const { importId } =
    await context.params;

  if (!importId) {
    return Response.json(
      {
        error:
          "Importación no válida",
      },
      {
        status: 400,
      },
    );
  }

  const userId =
    session.user.id;

  const encoder =
    new TextEncoder();

  const stream =
    new ReadableStream<Uint8Array>({
      async start(controller) {
        let closed = false;

        function send(
          event: ProposalStreamEvent,
        ) {
          if (closed) {
            return;
          }

          controller.enqueue(
            encoder.encode(
              serializeEvent(event),
            ),
          );
        }

        try {
          const result =
            await generateKnowledgeImportProposal(
              {
                importId,
                userId,
                onProgress:
                  async (
                    progress,
                  ) => {
                    send({
                      type: "progress",
                      progress,
                    });
                  },
              },
            );

          send({
            type: "completed",
            result,
          });
        } catch (error) {
          console.error(
            "Error generating knowledge import proposal:",
            error,
          );

          send({
            type: "error",
            error:
              error instanceof Error
                ? error.message
                : "No se ha podido generar la propuesta",
          });
        } finally {
          closed = true;
          controller.close();
        }
      },
    });

  return new Response(stream, {
    headers: {
      "Content-Type":
        "application/x-ndjson; charset=utf-8",
      "Cache-Control":
        "no-cache, no-transform",
      Connection:
        "keep-alive",
      "X-Accel-Buffering":
        "no",
    },
  });
}