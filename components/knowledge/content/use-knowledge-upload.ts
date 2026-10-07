// components/knowledge/content/use-knowledge-upload.ts

"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
} from "react";

import type { UploadType } from "./toolbar/types";

export function useKnowledgeUpload() {
  const [
    isKnowledgeImportOpen,
    setIsKnowledgeImportOpen,
  ] = useState(false);

  const [
    selectedFiles,
    setSelectedFiles,
  ] = useState<File[]>([]);

  const filesInputRef =
    useRef<HTMLInputElement>(null);

  const folderInputRef =
    useRef<HTMLInputElement>(null);

  const zipInputRef =
    useRef<HTMLInputElement>(null);

  const handleFilesSelected = useCallback(
    (
      event: ChangeEvent<HTMLInputElement>,
    ) => {
      const files = Array.from(
        event.target.files ?? [],
      );

      if (files.length === 0) {
        return;
      }

      setSelectedFiles(files);
      setIsKnowledgeImportOpen(true);

      event.target.value = "";
    },
    [],
  );

  const handleDroppedFiles = useCallback(
    (files: File[]) => {
      if (files.length === 0) {
        return;
      }

      setSelectedFiles(files);
      setIsKnowledgeImportOpen(true);
    },
    [],
  );

  const handleUpload = useCallback(
    (type: UploadType) => {
      if (type === "files") {
        filesInputRef.current?.click();
        return;
      }

      if (type === "folder") {
        folderInputRef.current?.click();
        return;
      }

      zipInputRef.current?.click();
    },
    [],
  );

  useEffect(() => {
    function handleTopbarUpload(
      event: Event,
    ) {
      const uploadEvent =
        event as CustomEvent<UploadType>;

      if (
        uploadEvent.detail === "files" ||
        uploadEvent.detail === "folder" ||
        uploadEvent.detail === "zip"
      ) {
        handleUpload(
          uploadEvent.detail,
        );
      }
    }

    window.addEventListener(
      "crs:knowledge-upload",
      handleTopbarUpload,
    );

    return () => {
      window.removeEventListener(
        "crs:knowledge-upload",
        handleTopbarUpload,
      );
    };
  }, [handleUpload]);

  return {
    isKnowledgeImportOpen,
    setIsKnowledgeImportOpen,
    selectedFiles,
    filesInputRef,
    folderInputRef,
    zipInputRef,
    handleFilesSelected,
    handleDroppedFiles,
    handleUpload,
  };
}