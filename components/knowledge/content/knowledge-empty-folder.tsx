// components/knowledge/content/knowledge-empty-folder.tsx

"use client";

import {
  Cloud,
  FileUp,
  FolderPlus,
  FolderUp,
  HardDrive,
  UploadCloud,
} from "lucide-react";
import {
  useRef,
  useState,
  type DragEvent,
} from "react";
import { toast } from "sonner";

type Props = {
  onUploadFiles: () => void;
  onUploadFolder: () => void;
  onCreateFolder: () => void;
  onFilesDropped: (files: File[]) => void;
};

export function KnowledgeEmptyFolder({
  onUploadFiles,
  onUploadFolder,
  onCreateFolder,
  onFilesDropped,
}: Props) {
  const [isDragging, setIsDragging] = useState(false);
  const dragDepth = useRef(0);

  function handleDragEnter(event: DragEvent<HTMLDivElement>) {
    if (!event.dataTransfer.types.includes("Files")) {
      return;
    }

    event.preventDefault();
    dragDepth.current += 1;
    setIsDragging(true);
  }

  function handleDragOver(event: DragEvent<HTMLDivElement>) {
    if (!event.dataTransfer.types.includes("Files")) {
      return;
    }

    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
  }

  function handleDragLeave(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();

    dragDepth.current = Math.max(0, dragDepth.current - 1);

    if (dragDepth.current === 0) {
      setIsDragging(false);
    }
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    if (!event.dataTransfer.types.includes("Files")) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    dragDepth.current = 0;
    setIsDragging(false);

    const files = Array.from(event.dataTransfer.files);

    if (files.length > 0) {
      onFilesDropped(files);
    }
  }

  function handleIntegration(provider: string) {
    toast.info(`Importar desde ${provider}`, {
      description:
        "La integración todavía no está disponible. Próximamente podrás conectar tu cuenta e importar documentos.",
    });
  }

  return (
    <div
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className={[
        "relative flex min-h-[420px] w-full flex-1 flex-col",
        "items-center justify-center rounded-[24px] px-5 py-10",
        "transition-colors duration-200",
        isDragging
          ? "bg-blue-50/70 ring-2 ring-inset ring-[#0A58FF]/35"
          : "bg-transparent",
      ].join(" ")}
    >
      {isDragging ? (
        <div className="pointer-events-none absolute inset-0 z-10 flex flex-col items-center justify-center gap-4 rounded-[24px] bg-blue-50/95">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-white text-[#0A58FF] shadow-sm">
            <UploadCloud className="h-8 w-8" strokeWidth={1.7} />
          </div>

          <div className="text-center">
            <p className="text-lg font-semibold text-slate-900">
              Suelta tus archivos aquí
            </p>

            <p className="mt-1 text-sm text-slate-500">
              Los añadiremos a esta carpeta.
            </p>
          </div>
        </div>
      ) : null}

      <div className="flex w-full max-w-[650px] flex-col items-center text-center">
        <div className="relative mb-6 flex h-[104px] w-[104px] items-center justify-center rounded-[30px] bg-[#EDF3FF] text-[#0A58FF]">
          <FolderUp
            className="h-12 w-12"
            strokeWidth={1.45}
          />

          <div className="absolute -bottom-1 -right-1 flex h-9 w-9 items-center justify-center rounded-xl border-4 border-white bg-[#0A58FF] text-white">
            <FileUp className="h-4 w-4" strokeWidth={2} />
          </div>
        </div>

        <h2 className="text-[22px] font-semibold tracking-[-0.025em] text-slate-900">
          Esta carpeta está vacía
        </h2>

        <p className="mt-2 max-w-[420px] text-sm leading-6 text-slate-500">
          Arrastra aquí tus documentos o añade contenido para
          empezar a organizar el conocimiento de tu equipo.
        </p>

        <button
          type="button"
          onClick={onUploadFiles}
          className="mt-6 inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-[#0A58FF] px-5 text-sm font-semibold text-white transition-colors hover:bg-[#0849D6] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0A58FF]/40 focus-visible:ring-offset-2"
        >
          <FileUp className="h-4 w-4" strokeWidth={2} />

          Subir archivos
        </button>

        <p className="mt-2 text-xs text-slate-400">
          También puedes arrastrarlos directamente aquí.
        </p>

        <div className="mt-10 w-full">
          <p className="mb-4 text-sm font-medium text-slate-500">
            Otras formas de empezar
          </p>

          <div className="flex flex-wrap items-center justify-center gap-2.5">
            <button
              type="button"
              onClick={onCreateFolder}
              className="inline-flex h-10 items-center gap-2 rounded-xl bg-slate-100/80 px-4 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-200/80"
            >
              <FolderPlus className="h-4 w-4" strokeWidth={1.9} />

              Crear carpeta
            </button>

            <button
              type="button"
              onClick={() => handleIntegration("Google Drive")}
              className="inline-flex h-10 items-center gap-2 rounded-xl bg-slate-100/80 px-4 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-200/80"
            >
              <HardDrive className="h-4 w-4" strokeWidth={1.9} />

              Google Drive
            </button>

            <button
              type="button"
              onClick={() => handleIntegration("OneDrive")}
              className="inline-flex h-10 items-center gap-2 rounded-xl bg-slate-100/80 px-4 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-200/80"
            >
              <Cloud className="h-4 w-4" strokeWidth={1.9} />

              OneDrive
            </button>
          </div>

          <p className="mt-3 text-xs text-slate-400">
            Las integraciones con Google Drive y OneDrive estarán
            disponibles próximamente.
          </p>
        </div>
      </div>
    </div>
  );
}