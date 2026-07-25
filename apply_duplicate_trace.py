from pathlib import Path
import shutil

ROOT = Path.cwd()

def require_file(relative: str) -> Path:
    path = ROOT / relative
    if not path.exists():
        raise SystemExit(
            f"No existe: {relative}. Ejecuta este script desde la raíz de crs-learning."
        )
    return path

def backup(path: Path) -> None:
    backup_path = path.with_suffix(path.suffix + ".bak")
    if not backup_path.exists():
        shutil.copy2(path, backup_path)

def replace_once(text: str, old: str, new: str, label: str) -> str:
    if new in text:
        print(f"✓ {label}: ya aplicado")
        return text

    count = text.count(old)

    if count != 1:
        raise SystemExit(
            f"No se pudo aplicar '{label}': se esperaba 1 coincidencia y se encontraron {count}."
        )

    print(f"✓ {label}")
    return text.replace(old, new, 1)


# TIPOS
types_path = require_file(
    "components/knowledge/intake/modal/knowledge-intake-processing.types.ts"
)
backup(types_path)
text = types_path.read_text(encoding="utf-8")

text = replace_once(
    text,
    '  | "completed"\n  | "error";',
    '  | "completed"\n  | "duplicate"\n  | "error";',
    "estado duplicate",
)

text = replace_once(
    text,
    '  error?: string;\n};',
    '''  error?: string;

  duplicateOf?: {
    fileId: string;
    articleId: string;
    articleTitle: string;
  };
};''',
    "metadatos duplicateOf",
)

text = replace_once(
    text,
    '  completedFiles: number;\n  failedFiles: number;',
    '  completedFiles: number;\n  duplicateFiles: number;\n  failedFiles: number;',
    "contador duplicateFiles",
)

types_path.write_text(text, encoding="utf-8")


# API
api_path = require_file(
    "components/knowledge/import/knowledge-import-api.ts"
)
backup(api_path)
text = api_path.read_text(encoding="utf-8")

text = replace_once(
    text,
    '''type AnalyzeImportResponse = {
  importId: string;
  status: "extracted";
  processingStatus: string;
  fileCount: number;
  completedFiles: number;
  failedFiles: number;
  totalSize: number;
};''',
    '''export type KnowledgeImportDuplicateFile = {
  name: string;
  relativePath: string;
  size: number;
  existingFileId: string;
  existingArticleId: string;
  existingArticleTitle: string;
};

type AnalyzeImportResponse = {
  importId: string;
  status: "extracted" | "completed";
  processingStatus: "pending" | "completed";
  fileCount: number;
  completedFiles: number;
  failedFiles: number;
  totalSize: number;
  duplicateCount: number;
  allFilesDuplicate: boolean;
  duplicateFiles: KnowledgeImportDuplicateFile[];
};''',
    "respuesta de análisis con duplicados",
)

text = replace_once(
    text,
    '''  const extraction =
    await analyzeImport(importId);

  options.onStageChange?.(
    "extracting_text",
  );''',
    '''  const extraction =
    await analyzeImport(importId);

  if (extraction.allFilesDuplicate) {
    return {
      importId,
      extraction,
      textExtraction: {
        importId,
        status: "text_ready",
        processingStatus: "completed",
        totalFiles: 0,
        successfulFiles: 0,
        failedFiles: 0,
        totalCharacters: 0,
      },
    };
  }

  options.onStageChange?.(
    "extracting_text",
  );''',
    "detener extract-text cuando todos son duplicados",
)

api_path.write_text(text, encoding="utf-8")


# MODAL
modal_path = require_file(
    "components/knowledge/intake/modal/knowledge-intake-modal.tsx"
)
backup(modal_path)
text = modal_path.read_text(encoding="utf-8")

text = replace_once(
    text,
    '''  const isWaitingToStart =
    open &&
    Boolean(selectedFiles?.length) &&
    intake.step === "upload";''',
    '''  const isWaitingToStart =
    open &&
    Boolean(selectedFiles?.length) &&
    intake.step === "upload" &&
    intake.files.length === 0;''',
    "evitar carga infinita",
)

modal_path.write_text(text, encoding="utf-8")


# COMPONENTE VISUAL
step_path = require_file(
    "components/knowledge/intake/modal/knowledge-intake-processing-step.tsx"
)
backup(step_path)
text = step_path.read_text(encoding="utf-8")

replacements = [
    (
        '''  Loader2,
  X,''',
        '''  Loader2,
  TriangleAlert,
  X,''',
        "importar TriangleAlert",
    ),
    (
        '''  if (file.status === "error") {''',
        '''  if (file.status === "duplicate") {
    return file.duplicateOf
      ? `Ya existe en "${file.duplicateOf.articleTitle}" y no se importará`
      : "El documento ya existe y no se importará";
  }

  if (file.status === "error") {''',
        "texto de duplicado",
    ),
    (
        '''  const completedOrFailed =
    summary.completedFiles +
    summary.failedFiles;''',
        '''  const completedOrFailed =
    summary.completedFiles +
    summary.duplicateFiles +
    summary.failedFiles;''',
        "duplicados como procesados",
    ),
    (
        '''          }${
            summary.failedFiles > 0''',
        '''          }${
            summary.duplicateFiles > 0
              ? `, ${summary.duplicateFiles} ${
                  summary.duplicateFiles === 1
                    ? "duplicado"
                    : "duplicados"
                }`
              : ""
          }${
            summary.failedFiles > 0''',
        "resumen con duplicados",
    ),
    (
        '''            <span>
              Fallidos:{" "}''',
        '''            <span>
              Duplicados:{" "}
              <strong
                className={cn(
                  summary.duplicateFiles > 0
                    ? "text-amber-700 dark:text-amber-400"
                    : "text-foreground",
                )}
              >
                {summary.duplicateFiles}
              </strong>
            </span>

            <span>
              Fallidos:{" "}''',
        "contador visual",
    ),
    (
        '''            const isError =
              file.status === "error";

            const isProcessing =''',
        '''            const isError =
              file.status === "error";

            const isDuplicate =
              file.status === "duplicate";

            const isProcessing =''',
        "variable isDuplicate",
    ),
    (
        '''                  isCompleted &&
                    "bg-emerald-50/60 dark:bg-emerald-950/20",
                  isError &&''',
        '''                  isCompleted &&
                    "bg-emerald-50/60 dark:bg-emerald-950/20",
                  isDuplicate &&
                    "bg-amber-50/70 dark:bg-amber-950/20",
                  isError &&''',
        "fondo amarillo",
    ),
    (
        '''                    isCompleted &&
                      "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-400",
                    isError &&''',
        '''                    isCompleted &&
                      "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-400",
                    isDuplicate &&
                      "bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-400",
                    isError &&''',
        "círculo amarillo",
    ),
    (
        '''                  {isCompleted ? (
                    <Check className="h-4 w-4 stroke-[2.5]" />
                  ) : isError ? (''',
        '''                  {isCompleted ? (
                    <Check className="h-4 w-4 stroke-[2.5]" />
                  ) : isDuplicate ? (
                    <TriangleAlert className="h-4 w-4 stroke-[2.5]" />
                  ) : isError ? (''',
        "icono amarillo",
    ),
    (
        '''                      isError
                        ? "text-red-700 dark:text-red-400"
                        : "text-muted-foreground",''',
        '''                      isDuplicate
                        ? "text-amber-700 dark:text-amber-400"
                        : isError
                          ? "text-red-700 dark:text-red-400"
                          : "text-muted-foreground",''',
        "texto amarillo",
    ),
]

for old, new, label in replacements:
    text = replace_once(text, old, new, label)

step_path.write_text(text, encoding="utf-8")


# HOOK
hook_path = require_file(
    "components/knowledge/intake/hooks/use-knowledge-intake.ts"
)
backup(hook_path)
text = hook_path.read_text(encoding="utf-8")

text = text.replace(
    "      completedFiles: 0,\n      failedFiles: 0,",
    "      completedFiles: 0,\n      duplicateFiles: 0,\n      failedFiles: 0,",
)

text = text.replace(
    "          completedFiles:\n            progress.completedFiles,\n          failedFiles:",
    "          completedFiles:\n            progress.completedFiles,\n          duplicateFiles: 0,\n          failedFiles:",
)

text = replace_once(
    text,
    '''setFileProgress(
  (currentFiles) => {
    const currentByName =''',
    '''setFileProgress(
  (currentFiles) => {
    const duplicateFiles =
      currentFiles.filter(
        (file) =>
          file.status === "duplicate",
      );

    const currentByName =''',
    "conservar duplicados durante polling",
)

text = replace_once(
    text,
    '''    return progress.files.map(
      (file) => {''',
    '''    const processedFiles =
      progress.files.map(
      (file) => {''',
    "crear processedFiles",
)

text = replace_once(
    text,
    '''      },
    );
  },
);''',
    '''      },
    );

    return [
      ...processedFiles,
      ...duplicateFiles,
    ];
  },
);''',
    "combinar procesados y duplicados",
)

old_result = '''if (
  analysisResult
    .textExtraction
    .successfulFiles === 0
) {
  setError(
    "No se ha podido obtener texto de ninguno de los documentos",
  );
}'''

new_result = '''const duplicateProgress =
  analysisResult.extraction
    .duplicateFiles.map(
      (file, index) => ({
        id: [
          "duplicate",
          file.existingFileId,
          index,
        ].join("-"),
        name: file.name,
        size: file.size,
        relativePath:
          file.relativePath,
        status:
          "duplicate" as const,
        duplicateOf: {
          fileId:
            file.existingFileId,
          articleId:
            file.existingArticleId,
          articleTitle:
            file.existingArticleTitle,
        },
      }),
    );

if (duplicateProgress.length > 0) {
  setFileProgress(
    (currentFiles) => {
      const duplicateNames =
        new Set(
          duplicateProgress.map(
            (file) => file.name,
          ),
        );

      return [
        ...currentFiles.filter(
          (file) =>
            !duplicateNames.has(
              file.name,
            ),
        ),
        ...duplicateProgress,
      ];
    },
  );

  const completedFiles =
    analysisResult.textExtraction
      .successfulFiles;
  const failedFiles =
    analysisResult.textExtraction
      .failedFiles;
  const duplicateFiles =
    duplicateProgress.length;
  const totalFiles =
    completedFiles +
    failedFiles +
    duplicateFiles;

  setProgressSummary(
    (currentSummary) => ({
      ...currentSummary,
      totalFiles,
      completedFiles,
      duplicateFiles,
      failedFiles,
      processedFiles: totalFiles,
      pendingFiles: 0,
      progressPercentage:
        totalFiles > 0 ? 100 : 0,
      currentFileName: null,
    }),
  );

  toast.warning(
    duplicateProgress.length === 1
      ? "Se ha detectado un documento duplicado"
      : `Se han detectado ${duplicateProgress.length} documentos duplicados`,
    {
      description:
        "Los duplicados aparecen marcados en amarillo y no se incluirán en la propuesta.",
    },
  );
}

if (
  analysisResult.textExtraction
    .successfulFiles === 0 &&
  analysisResult.extraction
    .duplicateCount === 0
) {
  setError(
    "No se ha podido obtener texto de ninguno de los documentos",
  );
}'''

if old_result in text:
    text = text.replace(old_result, new_result, 1)
elif "const duplicateProgress =" in text:
    print("✓ bloque de duplicados del hook: ya aplicado")
else:
    raise SystemExit(
        "No se encontró el bloque de resultado del análisis en use-knowledge-intake.ts."
    )

hook_path.write_text(text, encoding="utf-8")

print("")
print("Cambios aplicados. Se han creado copias .bak.")
print("Ejecuta ahora: npx tsc --noEmit")
