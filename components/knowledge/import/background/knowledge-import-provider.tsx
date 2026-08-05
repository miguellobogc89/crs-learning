"use client";

import {
  createContext,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useRouter } from "next/navigation";

import {
  createEmptyImportSummary,
  mergeServerProgress,
} from "@/lib/knowledge/import-flow";

import {
  cancelKnowledgeImport,
  confirmKnowledgeImport,
  generateKnowledgeImportProposal,
  getKnowledgeImportProgress,
} from "../knowledge-import-api";

import type {
  BackgroundKnowledgeImportTask,
  KnowledgeImportBackgroundContextValue,
  KnowledgeImportTaskPatch,
  KnowledgeImportCurrentAction,
  KnowledgeImportNextAction,
  KnowledgeImportSharedState,
} from "./knowledge-import-background.types";

const POLLING_INTERVAL_MS = 1000;

export const KnowledgeImportBackgroundContext =
  createContext<
    KnowledgeImportBackgroundContextValue | null
  >(null);

type KnowledgeImportProviderProps = {
  children: React.ReactNode;
};

function createBackgroundTask(
  importId: string,
  patch: KnowledgeImportTaskPatch = {},
): BackgroundKnowledgeImportTask {
  const now = new Date().toISOString();

  return {
    importId,
    context: null,
    displayMode: "modal",
    detailHost: "local",
    label: null,
    step: "analyzing",
    phase: "preparing",
    status: "registered",
    progress: null,
    summary: createEmptyImportSummary(),
    files: [],
    error: null,
    proposal: null,
    proposalProgress: null,
    completionResult: null,
    isAnalyzing: true,
    isConfirming: false,
    isCancelling: false,
    registeredAt: now,
    updatedAt: now,
    completedAt: null,
    ...patch,
  };
}

function isTaskTerminal(
  task: BackgroundKnowledgeImportTask,
) {
  return (
    task.step === "completed" ||
    task.status === "completed" ||
    task.status === "cancelled" ||
    task.progress?.processingStatus ===
      "cancelled" ||
    (task.progress?.isFinished === true &&
      (task.progress.processingStatus ===
        "error" ||
        task.status === "error"))
  );
}

function getCurrentAction(
  task: BackgroundKnowledgeImportTask,
): KnowledgeImportCurrentAction {
  if (task.isCancelling) {
    return "cancelling";
  }

  if (task.isConfirming) {
    return "confirming";
  }

  if (!task.isAnalyzing) {
    return null;
  }

  if (task.phase === "generating_proposal") {
    return "generating_proposal";
  }

  if (task.phase === "extracting") {
    return "extracting";
  }

  if (task.phase === "uploading") {
    return "uploading";
  }

  return "analyzing";
}

function getNextAction(
  task: BackgroundKnowledgeImportTask,
): KnowledgeImportNextAction {
  if (isTaskTerminal(task)) {
    return null;
  }

  if (task.proposal) {
    return "confirm_proposal";
  }

  if (
    !task.isAnalyzing &&
    task.summary.completedFiles > 0
  ) {
    return "generate_proposal";
  }

  return null;
}

function deriveSharedState(
  task: BackgroundKnowledgeImportTask,
): KnowledgeImportSharedState {
  const currentAction =
    getCurrentAction(task);
  const nextAction =
    getNextAction(task);
  const isBusy =
    currentAction !== null;
  const terminal =
    isTaskTerminal(task);

  return {
    importId: task.importId,
    currentStep: task.step,
    processingPhase: task.phase,
    status: task.status,
    currentAction,
    nextAction,
    canContinue:
      nextAction !== null &&
      !isBusy,
    canContinueInBackground:
      !task.isCancelling &&
      !terminal,
    isBusy,
    isWaitingUser:
      nextAction !== null &&
      !isBusy,
    hasProposal:
      task.proposal !== null,
    hasCompletionResult:
      task.completionResult !==
      null,
    progress: task.progress,
    progressSummary: task.summary,
    fileProgress: task.files,
    error: task.error,
  };
}

function isTaskActive(
  task: BackgroundKnowledgeImportTask,
) {
  if (task.step !== "analyzing") {
    return false;
  }

  if (
    task.phase === "generating_proposal"
  ) {
    return false;
  }

  if (!task.isAnalyzing) {
    return false;
  }

  if (!task.progress) {
    return true;
  }

  if (task.progress.proposalReady) {
    return false;
  }

  return !task.progress.isFinished;
}

export function KnowledgeImportProvider({
  children,
}: KnowledgeImportProviderProps) {
  const router = useRouter();
  const [
    tasks,
    setTasks,
  ] = useState<
    BackgroundKnowledgeImportTask[]
  >([]);

  const inFlightRefreshesRef = useRef(
    new Set<string>(),
  );
  const inFlightActionsRef = useRef(
    new Set<string>(),
  );

  const registerImport =
    useCallback(
      (
        importId: string,
        patch: KnowledgeImportTaskPatch = {},
      ) => {
        setTasks((currentTasks) => {
          const now =
            new Date().toISOString();

          const existingTask =
            currentTasks.find(
              (task) =>
                task.importId ===
                importId,
            );

          if (existingTask) {
            return currentTasks.map(
              (task) =>
                task.importId ===
                importId
                  ? {
                      ...task,
                      ...patch,
                      updatedAt: now,
                    }
                  : task,
            );
          }

          return [
            ...currentTasks,
            createBackgroundTask(
              importId,
              patch,
            ),
          ];
        });
      },
      [],
    );

  const updateImport =
    useCallback(
      (
        importId: string,
        patch: KnowledgeImportTaskPatch,
      ) => {
        setTasks((currentTasks) =>
          currentTasks.map((task) =>
            task.importId === importId
              ? {
                  ...task,
                  ...patch,
                  updatedAt:
                    new Date().toISOString(),
                }
              : task,
          ),
        );
      },
      [],
    );

  const removeImport =
    useCallback(
      (importId: string) => {
        setTasks((currentTasks) =>
          currentTasks.filter(
            (task) =>
              task.importId !==
              importId,
          ),
        );
      },
      [],
    );

  const refreshImport =
    useCallback(
      async (importId: string) => {
        const inFlightRefreshes =
          inFlightRefreshesRef.current;

        if (
          inFlightRefreshes.has(importId)
        ) {
          return;
        }

        inFlightRefreshes.add(importId);

        try {
          const progress =
            await getKnowledgeImportProgress(
              importId,
            );

          setTasks((currentTasks) =>
            currentTasks.map((task) => {
              if (
                task.importId !==
                importId
              ) {
                return task;
              }

              const merged =
                mergeServerProgress(
                  task.files,
                  task.summary,
                  progress,
                );

              return {
                ...task,
                progress,
                files: merged.files,
                summary:
                  merged.summary,
                status: progress.status,
                error: null,
                completedAt:
                  progress.completedAt ??
                  task.completedAt,
                updatedAt:
                  new Date().toISOString(),
              };
            }),
          );
        } catch (caughtError) {
          const errorMessage =
            caughtError instanceof Error
              ? caughtError.message
              : "No se ha podido consultar la importacion";

          setTasks((currentTasks) =>
            currentTasks.map((task) =>
              task.importId === importId
                ? {
                    ...task,
                    error: errorMessage,
                    updatedAt:
                      new Date().toISOString(),
                  }
                : task,
            ),
          );
        } finally {
          inFlightRefreshes.delete(
            importId,
          );
        }
      },
      [],
    );

  const getImportState =
    useCallback(
      (importId: string) => {
        const task = tasks.find(
          (currentTask) =>
            currentTask.importId ===
            importId,
        );

        return task
          ? deriveSharedState(task)
          : null;
      },
      [tasks],
    );

  const continueWithValidDocuments =
    useCallback(
      async (importId: string) => {
        const actionKey = `${importId}:generate_proposal`;

        if (
          inFlightActionsRef.current.has(
            actionKey,
          )
        ) {
          return;
        }

        inFlightActionsRef.current.add(
          actionKey,
        );

        updateImport(importId, {
          phase: "generating_proposal",
          status: "generating_proposal",
          isAnalyzing: true,
          error: null,
          proposalProgress: {
            step: "preparing",
            progressPercentage: 0,
            message:
              "Preparando la generacion de la propuesta",
          },
        });

        try {
          const proposalResult =
            await generateKnowledgeImportProposal(
              importId,
              {
                onProgress:
                  (progress) => {
                    updateImport(
                      importId,
                      {
                        proposalProgress:
                          progress,
                      },
                    );
                  },
              },
            );

          updateImport(importId, {
            step: "proposal",
            status: "proposal_ready",
            proposal:
              proposalResult.proposal,
            proposalProgress: null,
            isAnalyzing: false,
            error: null,
          });
        } catch (caughtError) {
          updateImport(importId, {
            error:
              caughtError instanceof Error
                ? caughtError.message
                : "No se ha podido generar la propuesta",
            isAnalyzing: false,
            step: "analyzing",
          });
        } finally {
          inFlightActionsRef.current.delete(
            actionKey,
          );
        }
      },
      [updateImport],
    );

  const confirmProposal =
    useCallback(
      async (importId: string) => {
        const actionKey = `${importId}:confirm_proposal`;

        if (
          inFlightActionsRef.current.has(
            actionKey,
          )
        ) {
          return null;
        }

        inFlightActionsRef.current.add(
          actionKey,
        );

        updateImport(importId, {
          isConfirming: true,
          error: null,
        });

        try {
          const result =
            await confirmKnowledgeImport(
              importId,
            );

          setTasks((currentTasks) =>
            currentTasks.map((task) => {
              if (
                task.importId !==
                importId
              ) {
                return task;
              }

              const completedAt =
                new Date().toISOString();

              return {
                ...task,
                step: "completed",
                status: "completed",
                displayMode: "modal",
                detailHost:
                  task.displayMode ===
                  "widget"
                    ? "global"
                    : task.detailHost,
                completionResult:
                  result,
                isAnalyzing: false,
                isConfirming: false,
                proposalProgress: null,
                completedAt,
                updatedAt: completedAt,
                error: null,
              };
            }),
          );

          router.refresh();

          return result;
        } catch (caughtError) {
          updateImport(importId, {
            error:
              caughtError instanceof Error
                ? caughtError.message
                : "No se ha podido aplicar la propuesta",
            isConfirming: false,
          });

          return null;
        } finally {
          inFlightActionsRef.current.delete(
            actionKey,
          );
        }
      },
      [
        router,
        updateImport,
      ],
    );

  const continueInBackground =
    useCallback(
      (importId: string) => {
        updateImport(importId, {
          displayMode: "widget",
          detailHost: "global",
        });
      },
      [updateImport],
    );

  const showImportDetail =
    useCallback(
      (importId: string) => {
        updateImport(importId, {
          displayMode: "modal",
          detailHost: "global",
        });
      },
      [updateImport],
    );

  const cancelImport =
    useCallback(
      async (importId: string) => {
        updateImport(importId, {
          isCancelling: true,
          error: null,
        });

        try {
          await cancelKnowledgeImport(
            importId,
          );
          removeImport(importId);

          return {
            success: true,
          };
        } catch (caughtError) {
          const errorMessage =
            caughtError instanceof Error
              ? caughtError.message
              : "No se ha podido cancelar la importacion";

          updateImport(importId, {
            isCancelling: false,
            error: errorMessage,
          });

          return {
            success: false,
            error: errorMessage,
          };
        }
      },
      [
        removeImport,
        updateImport,
      ],
    );

  const finishImport =
    useCallback(
      (importId: string) => {
        removeImport(importId);
      },
      [removeImport],
    );

  const activeTasks = useMemo(
    () => tasks.filter(isTaskActive),
    [tasks],
  );

  useEffect(() => {
    setTasks((currentTasks) => {
      let changed = false;

      const nextTasks =
        currentTasks.map((task) => {
          if (
            task.step !== "completed" ||
            task.displayMode !==
              "widget"
          ) {
            return task;
          }

          changed = true;

          return {
            ...task,
            displayMode: "modal" as const,
            detailHost: "global" as const,
            updatedAt:
              new Date().toISOString(),
          };
        });

      return changed
        ? nextTasks
        : currentTasks;
    });
  }, [tasks]);

  const widgetTask = useMemo(
    () =>
      tasks.find(
        (task) =>
          task.displayMode ===
            "widget" &&
          task.step !== "completed",
      ) ?? null,
    [tasks],
  );

  useEffect(() => {
    document.body.classList.toggle(
      "knowledge-import-widget-visible",
      widgetTask !== null,
    );

    return () => {
      document.body.classList.remove(
        "knowledge-import-widget-visible",
      );
    };
  }, [widgetTask]);

  const activeImportIds = useMemo(
    () =>
      activeTasks.map(
        (task) => task.importId,
      ),
    [activeTasks],
  );

  const activeImportIdsKey = useMemo(
    () => activeImportIds.join("|"),
    [activeImportIds],
  );

  useEffect(() => {
    if (
      activeImportIds.length === 0
    ) {
      return;
    }

    function refreshActiveImports() {
      for (const importId of activeImportIds) {
        void refreshImport(importId);
      }
    }

    refreshActiveImports();

    const intervalId =
      window.setInterval(
        refreshActiveImports,
        POLLING_INTERVAL_MS,
      );

    return () => {
      window.clearInterval(
        intervalId,
      );
    };
  }, [
    activeImportIdsKey,
    refreshImport,
  ]);

  const currentTask = useMemo(
    () => tasks.at(-1) ?? null,
    [tasks],
  );

  const contextValue = useMemo(
    () => ({
      tasks,
      activeTasks,
      currentTask,
      widgetTask,
      registerImport,
      updateImport,
      removeImport,
      refreshImport,
      getImportState,
      continueWithValidDocuments,
      confirmProposal,
      continueInBackground,
      showImportDetail,
      cancelImport,
      finishImport,
    }),
    [
      tasks,
      activeTasks,
      currentTask,
      widgetTask,
      registerImport,
      updateImport,
      removeImport,
      refreshImport,
      getImportState,
      continueWithValidDocuments,
      confirmProposal,
      continueInBackground,
      showImportDetail,
      cancelImport,
      finishImport,
    ],
  );

  return (
    <KnowledgeImportBackgroundContext.Provider
      value={contextValue}
    >
      {children}
    </KnowledgeImportBackgroundContext.Provider>
  );
}
