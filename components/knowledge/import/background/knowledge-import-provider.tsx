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
    </KnowledgeImportBackgroundContext.Provider>
  );
}