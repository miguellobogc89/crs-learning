// components/knowledge/import/background/knowledge-import-provider.tsx

"use client";

import {
  createContext,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  AlertCircle,
  CheckCircle2,
  FileSearch,
  Loader2,
  X,
} from "lucide-react";

import { Button } from "@/components/ui/button";

import {
  getKnowledgeImportProgress,
} from "../knowledge-import-api";

import type {
  BackgroundKnowledgeImportTask,
  KnowledgeImportBackgroundContextValue,
} from "./knowledge-import-background.types";

const STORAGE_KEY =
  "knowledge-background-import-ids";

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
): BackgroundKnowledgeImportTask {
  const now = new Date().toISOString();

  return {
    importId,
    progress: null,
    error: null,
    registeredAt: now,
    updatedAt: now,
  };
}

function readStoredImportIds() {
  try {
    const storedValue =
      window.localStorage.getItem(
        STORAGE_KEY,
      );

    if (!storedValue) {
      return [];
    }

    const parsedValue =
      JSON.parse(storedValue);

    if (!Array.isArray(parsedValue)) {
      return [];
    }

    return parsedValue.filter(
      (value): value is string =>
        typeof value === "string" &&
        value.length > 0,
    );
  } catch {
    return [];
  }
}

function isTaskActive(
  task: BackgroundKnowledgeImportTask,
) {
  if (!task.progress) {
    return true;
  }

  if (task.progress.proposalReady) {
    return false;
  }

  return !task.progress.isFinished;
}

function getTaskTitle(
  task: BackgroundKnowledgeImportTask,
) {
  if (task.error) {
    return "No se puede consultar la importación";
  }

  if (!task.progress) {
    return "Preparando importación";
  }

  if (
    task.progress.processingStatus ===
      "error" ||
    task.progress.status ===
      "text_error"
  ) {
    return "Importación terminada con errores";
  }

  if (
    task.progress.proposalReady ||
    task.progress.isFinished
  ) {
    return "Análisis finalizado";
  }

  return "Analizando documentación";
}

function getTaskDescription(
  task: BackgroundKnowledgeImportTask,
) {
  if (task.error) {
    return task.error;
  }

  const progress = task.progress;

  if (!progress) {
    return "Conectando con el proceso…";
  }

  if (progress.currentFile?.name) {
    return progress.currentFile.name;
  }

  if (
    progress.proposalReady ||
    progress.isFinished
  ) {
    const completed =
      progress.completedFiles;

    return `${completed} ${
      completed === 1
        ? "documento preparado"
        : "documentos preparados"
    }`;
  }

  return `${progress.processedFiles} de ${progress.totalFiles} documentos`;
}

function BackgroundImportWidget({
  tasks,
  onDismiss,
}: {
  tasks: BackgroundKnowledgeImportTask[];
  onDismiss: (importId: string) => void;
}) {
  if (tasks.length === 0) {
    return null;
  }

  return (
    <aside className="fixed bottom-24 right-6 z-[80] flex w-[360px] max-w-[calc(100vw-3rem)] flex-col gap-3">
      {tasks.map((task) => {
        const progressPercentage =
          task.progress?.progressPercentage ??
          0;

        const finished =
          Boolean(
            task.progress?.proposalReady ||
              task.progress?.isFinished,
          );

        const hasError =
          Boolean(
            task.error ||
              task.progress
                ?.processingStatus ===
                "error" ||
              task.progress?.status ===
                "text_error",
          );

        return (
          <div
            key={task.importId}
            className="rounded-2xl border border-border bg-background p-4 shadow-xl"
          >
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-muted">
                {hasError ? (
                  <AlertCircle className="h-5 w-5 text-destructive" />
                ) : finished ? (
                  <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                ) : task.progress ? (
                  <Loader2 className="h-5 w-5 animate-spin text-primary" />
                ) : (
                  <FileSearch className="h-5 w-5 text-muted-foreground" />
                )}
              </div>

              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold">
                      {getTaskTitle(task)}
                    </p>

                    <p
                      className="mt-1 truncate text-xs text-muted-foreground"
                      title={
                        getTaskDescription(
                          task,
                        )
                      }
                    >
                      {getTaskDescription(
                        task,
                      )}
                    </p>
                  </div>

                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() =>
                      onDismiss(
                        task.importId,
                      )
                    }
                    className="-mr-2 -mt-2 h-8 w-8 shrink-0"
                    aria-label="Ocultar importación"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>

                {!finished &&
                !hasError ? (
                  <div className="mt-3">
                    <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full bg-primary transition-[width] duration-300"
                        style={{
                          width: `${Math.max(
                            2,
                            Math.min(
                              100,
                              progressPercentage,
                            ),
                          )}%`,
                        }}
                      />
                    </div>

                    <p className="mt-1.5 text-right text-[11px] font-medium text-muted-foreground">
                      {progressPercentage}%
                    </p>
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        );
      })}
    </aside>
  );
}

export function KnowledgeImportProvider({
  children,
}: KnowledgeImportProviderProps) {
  const [
    tasks,
    setTasks,
  ] = useState<
    BackgroundKnowledgeImportTask[]
  >([]);

  const [
    storageRestored,
    setStorageRestored,
  ] = useState(false);

  const registerImport =
    useCallback(
      (importId: string) => {
        setTasks((currentTasks) => {
          const alreadyRegistered =
            currentTasks.some(
              (task) =>
                task.importId ===
                importId,
            );

          if (alreadyRegistered) {
            return currentTasks;
          }

          return [
            ...currentTasks,
            createBackgroundTask(
              importId,
            ),
          ];
        });
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

              return {
                ...task,
                progress,
                error: null,
                updatedAt:
                  new Date().toISOString(),
              };
            }),
          );
        } catch (caughtError) {
          const errorMessage =
            caughtError instanceof Error
              ? caughtError.message
              : "No se ha podido consultar la importación";

          setTasks((currentTasks) =>
            currentTasks.map((task) => {
              if (
                task.importId !==
                importId
              ) {
                return task;
              }

              return {
                ...task,
                error: errorMessage,
                updatedAt:
                  new Date().toISOString(),
              };
            }),
          );
        }
      },
      [],
    );

  useEffect(() => {
    const storedImportIds =
      readStoredImportIds();

    setTasks(
      storedImportIds.map(
        createBackgroundTask,
      ),
    );

    setStorageRestored(true);
  }, []);

  useEffect(() => {
    if (!storageRestored) {
      return;
    }

    const importIds = tasks.map(
      (task) => task.importId,
    );

    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(importIds),
    );
  }, [
    storageRestored,
    tasks,
  ]);

  const activeTasks = useMemo(
    () => tasks.filter(isTaskActive),
    [tasks],
  );

  const activeImportIds = useMemo(
    () =>
      activeTasks.map(
        (task) => task.importId,
      ),
    [activeTasks],
  );

  useEffect(() => {
    if (
      activeImportIds.length === 0
    ) {
      return;
    }

    async function refreshActiveImports() {
      await Promise.all(
        activeImportIds.map(
          refreshImport,
        ),
      );
    }

    void refreshActiveImports();

    const intervalId =
      window.setInterval(
        () => {
          void refreshActiveImports();
        },
        POLLING_INTERVAL_MS,
      );

    return () => {
      window.clearInterval(
        intervalId,
      );
    };
  }, [
    activeImportIds,
    refreshImport,
  ]);

  const contextValue = useMemo(
    () => ({
      tasks,
      activeTasks,
      registerImport,
      removeImport,
      refreshImport,
    }),
    [
      tasks,
      activeTasks,
      registerImport,
      removeImport,
      refreshImport,
    ],
  );

  return (
    <KnowledgeImportBackgroundContext.Provider
      value={contextValue}
    >
      {children}

      <BackgroundImportWidget
        tasks={tasks}
        onDismiss={removeImport}
      />
    </KnowledgeImportBackgroundContext.Provider>
  );
}
