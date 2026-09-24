
﻿// components/knowledge/article/content/documents/article-documents-view.tsx

"use client";

import {
  AlertCircle,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  Clock3,
  File,
  FileArchive,
  FileCode2,
  FileImage,
  FileSpreadsheet,
  FileText,
  FileType2,
  HardDrive,
  Layers3,
  ListChecks,
  ScanText,
  Sparkles,
  UserRound,
} from "lucide-react";

import type {
  KnowledgeAnalysis,
  KnowledgeFile,
} from "@/components/knowledge/detail/knowledge-detail.types";

import {
  getContributionFocusLabel,
  getContributionLabel,
  getDocumentRoleLabel,
  parseQualityAnalysis,
} from "@/components/knowledge/detail/summary/summary.utils";

type ArticleDocumentsViewProps = {
  documents: KnowledgeFile[];
  analysis?: KnowledgeAnalysis | null;
};

function formatFileSize(bytes: number | null): string {
  if (bytes === null) return "Tamaño desconocido";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }

  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(value: Date | string): string {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Fecha desconocida";
  }

  return new Intl.DateTimeFormat("es-ES", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function getFileExtension(fileName: string): string {
  const extension = fileName.split(".").pop();

  if (!extension || extension === fileName) {
    return "Archivo";
  }

  return extension.toUpperCase();
}

function getFileAppearance(fileName: string) {
  const extension = getFileExtension(fileName);

  switch (extension) {
    case "PDF":
      return {
        Icon: FileText,
        iconClass: "bg-rose-50 text-rose-600 ring-rose-100",
        badgeClass: "bg-rose-50 text-rose-700",
      };

    case "DOC":
    case "DOCX":
    case "ODT":
      return {
        Icon: FileType2,
        iconClass: "bg-blue-50 text-blue-600 ring-blue-100",
        badgeClass: "bg-blue-50 text-blue-700",
      };

    case "XLS":
    case "XLSX":
    case "CSV":
    case "ODS":
      return {
        Icon: FileSpreadsheet,
        iconClass: "bg-emerald-50 text-emerald-600 ring-emerald-100",
        badgeClass: "bg-emerald-50 text-emerald-700",
      };

    case "PNG":
    case "JPG":
    case "JPEG":
    case "WEBP":
    case "SVG":
      return {
        Icon: FileImage,
        iconClass: "bg-violet-50 text-violet-600 ring-violet-100",
        badgeClass: "bg-violet-50 text-violet-700",
      };

    case "ZIP":
    case "RAR":
    case "7Z":
      return {
        Icon: FileArchive,
        iconClass: "bg-amber-50 text-amber-600 ring-amber-100",
        badgeClass: "bg-amber-50 text-amber-700",
      };

    case "JSON":
    case "XML":
    case "HTML":
    case "MD":
      return {
        Icon: FileCode2,
        iconClass: "bg-cyan-50 text-cyan-600 ring-cyan-100",
        badgeClass: "bg-cyan-50 text-cyan-700",
      };

    default:
      return {
        Icon: File,
        iconClass: "bg-slate-100 text-slate-600 ring-slate-200",
        badgeClass: "bg-slate-100 text-slate-600",
      };
  }
}

function getAnalysisStatus(status: string): string {
  switch (status) {
    case "ready":
      return "Analizado";
    case "processing":
      return "En análisis";
    case "error":
      return "Error en el análisis";
    default:
      return status;
  }
}

function AnalysisBadge({ status }: { status: string }) {
  if (status === "ready") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold leading-4 text-emerald-700">
        <CheckCircle2 aria-hidden="true" className="h-3.5 w-3.5" />
        Analizado
      </span>
    );
  }

  if (status === "processing") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-50 px-2.5 py-1 text-[11px] font-semibold leading-4 text-blue-700">
        <Clock3 aria-hidden="true" className="h-3.5 w-3.5" />
        En análisis
      </span>
    );
  }

  if (status === "error") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-rose-50 px-2.5 py-1 text-[11px] font-semibold leading-4 text-rose-700">
        <AlertCircle aria-hidden="true" className="h-3.5 w-3.5" />
        Error en el análisis
      </span>
    );
  }

  return (
    <span className="inline-flex items-center rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-medium leading-4 text-slate-600">
      {getAnalysisStatus(status)}
    </span>
  );
}

function ContentSection({
  icon: Icon,
  title,
  children,
}: {
  icon: typeof FileText;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="!border-0 !bg-transparent !p-0">
      <div className="mb-4 flex items-center gap-2.5">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
          <Icon aria-hidden="true" className="h-4 w-4" />
        </span>

        <h3 className="!m-0 !text-[15px] !font-semibold !leading-6 !text-slate-900">
          {title}
        </h3>
      </div>

      {children}
    </section>
  );
}

function InfoItem({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof FileText;
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="flex min-w-0 items-start gap-3">
      <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-500">
        <Icon aria-hidden="true" className="h-4 w-4" />
      </span>

      <div className="min-w-0">
        <p className="!m-0 !text-[11px] !font-medium !leading-5 !text-slate-500">
          {label}
        </p>

        <div className="mt-0.5 break-words text-[13px] font-medium leading-6 text-slate-800">
          {value}
        </div>
      </div>
    </div>
  );
}

export function ArticleDocumentsView({
  documents,
  analysis,
}: ArticleDocumentsViewProps) {
  const { documentContributions } = parseQualityAnalysis(
    analysis?.analysis_json,
  );

  if (documents.length === 0) {
    return (
      <section className="flex min-h-64 flex-col items-center justify-center text-center">
        <span className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-50 text-blue-600">
          <FileText aria-hidden="true" className="h-7 w-7" />
        </span>

        <h2 className="!mb-2 !text-[17px] !font-semibold">
          Todavía no hay documentos
        </h2>

        <p className="max-w-sm text-slate-500">
          Los archivos asociados al artículo aparecerán aquí junto con
          su análisis y la información que aportan al conocimiento.
        </p>
      </section>
    );
  }

  return (
    <section className="min-w-0">
      <div className="mb-7 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
            <Layers3 aria-hidden="true" className="h-4 w-4" />
          </span>

          <h2 className="!m-0 !text-[16px] !font-semibold !leading-6">
            Documentos asociados
          </h2>
        </div>

        <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold tabular-nums text-slate-600">
          {documents.length}{" "}
          {documents.length === 1 ? "archivo" : "archivos"}
        </span>
      </div>

      <div className="min-w-0 divide-y divide-slate-100">
        {documents.map((document) => {
          const contribution = documentContributions.find(
            (item) =>
              item.sourceId === document.id ||
              item.fileName === document.file_name,
          );

          const fileAnalysis = document.knowledge_file_analysis;
          const extension = getFileExtension(document.file_name);
          const appearance = getFileAppearance(document.file_name);
          const FileIcon = appearance.Icon;

          return (
            <details
              key={document.id}
              className="group !border-0 !border-b !border-slate-100 !bg-transparent last:!border-b-0"
            >
              <summary className="flex cursor-pointer list-none items-center gap-3 !py-5 marker:content-none [&::-webkit-details-marker]:hidden">
                <span
                  className={[
                    "flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl ring-1",
                    appearance.iconClass,
                  ].join(" ")}
                >
                  <FileIcon aria-hidden="true" className="h-6 w-6" />
                </span>

                <div className="min-w-0 flex-1">
                  <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                    <span className="min-w-0 break-all text-[14px] font-semibold leading-6 text-slate-900 transition-colors group-hover:text-blue-700">
                      {document.file_name}
                    </span>
                  </div>

                  <div className="mt-1.5 flex flex-wrap items-center gap-2">
                    <span
                      className={[
                        "rounded-md px-2 py-0.5 text-[10px] font-bold tracking-wide",
                        appearance.badgeClass,
                      ].join(" ")}
                    >
                      {extension}
                    </span>

                    <span className="text-[12px] text-slate-500">
                      {formatFileSize(document.file_size)}
                    </span>

                    <span
                      aria-hidden="true"
                      className="h-1 w-1 rounded-full bg-slate-300"
                    />

                    <span className="text-[12px] text-slate-500">
                      {formatDate(document.created_at)}
                    </span>
                  </div>
                </div>

                {fileAnalysis && (
                  <span className="hidden shrink-0 sm:inline-flex">
                    <AnalysisBadge status={fileAnalysis.status} />
                  </span>
                )}

                <span className="ml-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-slate-400 transition-all group-hover:bg-slate-100 group-hover:text-slate-700 group-open:rotate-180">
                  <ChevronDown aria-hidden="true" className="h-4 w-4" />
                </span>
              </summary>

              <div className="min-w-0 pb-8 pl-0 sm:pl-[60px]">
                {fileAnalysis && (
                  <div className="mb-6 sm:hidden">
                    <AnalysisBadge status={fileAnalysis.status} />
                  </div>
                )}

                <div className="space-y-8">
                  <ContentSection icon={ScanText} title="Resumen del documento">
                    <p className="!m-0 !text-[14px] !leading-7 !text-slate-600">
                      {contribution?.summary ||
                        "Este documento todavía no tiene un resumen individual disponible."}
                    </p>
                  </ContentSection>

                  {contribution && (
                    <ContentSection
                      icon={Sparkles}
                      title="Aportación al artículo"
                    >
                      <div className="flex flex-wrap gap-2">
                        <span className="inline-flex items-center rounded-lg border border-blue-100 bg-blue-50 px-3 py-1.5 text-[12px] font-medium text-blue-700">
                          {getDocumentRoleLabel(contribution.documentRole)}
                        </span>

                        <span className="inline-flex items-center rounded-lg border border-violet-100 bg-violet-50 px-3 py-1.5 text-[12px] font-medium text-violet-700">
                          {getContributionLabel(
                            contribution.contributionType,
                          )}
                        </span>

                        <span className="inline-flex items-center rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-[12px] font-medium text-slate-700">
                          {getContributionFocusLabel(
                            contribution.contributionFocus,
                          )}
                        </span>
                      </div>

                      {contribution.supportedSections.length > 0 && (
                        <div className="mt-5">
                          <div className="mb-3 flex items-center gap-2 text-[12px] font-semibold text-slate-700">
                            <ListChecks
                              aria-hidden="true"
                              className="h-4 w-4 text-blue-500"
                            />
                            Secciones que respalda
                          </div>

                          <ul className="!m-0 flex !list-none flex-wrap gap-2 !p-0">
                            {contribution.supportedSections.map(
                              (section, index) => (
                                <li
                                  key={index}
                                  className="!m-0 !rounded-lg !border !border-slate-200 !bg-white !px-3 !py-1.5 !text-[12px] !font-medium !leading-5 !text-slate-600"
                                >
                                  {section}
                                </li>
                              ),
                            )}
                          </ul>
                        </div>
                      )}
                    </ContentSection>
                  )}

                  <ContentSection icon={FileText} title="Información del archivo">
                    <div className="grid grid-cols-1 gap-x-8 gap-y-5 sm:grid-cols-2 xl:grid-cols-3">
                      <InfoItem
                        icon={FileType2}
                        label="Formato"
                        value={document.file_type || extension}
                      />

                      <InfoItem
                        icon={HardDrive}
                        label="Tamaño"
                        value={formatFileSize(document.file_size)}
                      />

                      <InfoItem
                        icon={CalendarDays}
                        label="Fecha de incorporación"
                        value={formatDate(document.created_at)}
                      />

                      {document.users?.name && (
                        <InfoItem
                          icon={UserRound}
                          label="Incorporado por"
                          value={document.users.name}
                        />
                      )}

                      <InfoItem
                        icon={CheckCircle2}
                        label="Estado del archivo"
                        value={document.status}
                      />
                    </div>
                  </ContentSection>

                  {fileAnalysis && (
                    <ContentSection
                      icon={Sparkles}
                      title="Análisis del documento"
                    >
                      <div className="grid grid-cols-1 gap-x-8 gap-y-5 sm:grid-cols-2 xl:grid-cols-3">
                        <InfoItem
                          icon={CheckCircle2}
                          label="Estado"
                          value={
                            <AnalysisBadge status={fileAnalysis.status} />
                          }
                        />

                        {fileAnalysis.model && (
                          <InfoItem
                            icon={Sparkles}
                            label="Modelo"
                            value={fileAnalysis.model}
                          />
                        )}

                        <InfoItem
                          icon={CalendarDays}
                          label="Último análisis"
                          value={formatDate(fileAnalysis.updated_at)}
                        />

                        {fileAnalysis.error_message && (
                          <div className="sm:col-span-2 xl:col-span-3">
                            <div className="flex items-start gap-3 rounded-xl border border-rose-100 bg-rose-50 p-4">
                              <AlertCircle
                                aria-hidden="true"
                                className="mt-0.5 h-4 w-4 shrink-0 text-rose-600"
                              />

                              <div className="min-w-0">
                                <p className="!m-0 !text-[12px] !font-semibold !text-rose-700">
                                  Error del análisis
                                </p>

                                <p className="!mt-1 !text-[13px] !leading-6 !text-rose-700">
                                  {fileAnalysis.error_message}
                                </p>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    </ContentSection>
                  )}
                </div>
              </div>
            </details>
          );
        })}
      </div>
    </section>
  );
}