// components/academy/right-panel-management/course-basic-information.tsx

"use client";

import { useRef } from "react";
import { ImagePlus, Sparkles, Upload } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

type CourseBasicInformationProps = {
  title: string;
  description: string;
  imageUrl: string | null;
  isGeneratingImage: boolean;
  isUploadingImage: boolean;
  onTitleChange: (value: string) => void;
  onDescriptionChange: (value: string) => void;
  onGenerateImage: () => void;
  onUploadImage: (file: File) => void;
};

export function CourseBasicInformation({
  title,
  description,
  imageUrl,
  isGeneratingImage,
  isUploadingImage,
  onTitleChange,
  onDescriptionChange,
  onGenerateImage,
  onUploadImage,
}: CourseBasicInformationProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const canGenerateWithAi =
    title.trim().length > 0 && description.trim().length > 0;

  function handleFileChange(
    event: React.ChangeEvent<HTMLInputElement>,
  ) {
    const file = event.target.files?.[0];

    if (!file) {
      return;
    }

    onUploadImage(file);

    event.target.value = "";
  }

  return (
    <section className="border-b border-[#EEF1F6] px-5 py-5">
      <div className="flex items-start gap-3">
        <div className="flex h-7 w-7 shrink-0 items-center justify-center text-[#315BFF]">
          <ImagePlus
            className="h-[18px] w-[18px]"
            strokeWidth={2}
          />
        </div>

        <div>
          <h3 className="text-[14px] font-bold leading-5 tracking-[-0.025em] text-[#071747]">
            Información básica
          </h3>

          <p className="mt-0.5 text-[11.5px] leading-4 tracking-[-0.015em] text-[#536184]">
            Añade una portada y define la información principal del
            curso.
          </p>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-[1.02fr_0.98fr] gap-5">
        <div>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            onChange={handleFileChange}
            className="hidden"
          />

          {imageUrl ? (
            <div className="relative h-[210px] overflow-hidden rounded-xl border border-[#DDE3F0] bg-[#FAFBFF]">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={imageUrl}
                alt="Portada del curso"
                className="h-full w-full object-cover"
              />

              <div className="absolute inset-x-0 bottom-0 flex items-center justify-end gap-2 bg-gradient-to-t from-black/45 via-black/15 to-transparent px-3 pb-3 pt-10">
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  disabled={isUploadingImage}
                  onClick={() => fileInputRef.current?.click()}
                  className="h-8 gap-1.5 border border-white/40 bg-white/95 px-3 text-[11px] text-[#15234E] shadow-sm hover:bg-white"
                >
                  <Upload className="h-3.5 w-3.5" />

                  {isUploadingImage
                    ? "Subiendo..."
                    : "Cambiar imagen"}
                </Button>

                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  disabled={
                    !canGenerateWithAi ||
                    isGeneratingImage ||
                    isUploadingImage
                  }
                  onClick={onGenerateImage}
                  className="h-8 gap-1.5 border border-white/40 bg-white/95 px-3 text-[11px] text-[#315BFF] shadow-sm hover:bg-white disabled:text-slate-400"
                >
                  <Sparkles className="h-3.5 w-3.5" />

                  {isGeneratingImage
                    ? "Generando..."
                    : "Generar otra"}
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex h-[210px] flex-col items-center justify-center rounded-xl border border-dashed border-[#C9D4EA] bg-[#FBFCFF] px-5 text-center">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#EEF2FF] text-[#315BFF]">
                <ImagePlus
                  className="h-5 w-5"
                  strokeWidth={1.9}
                />
              </div>

              <p className="mt-3 text-[13px] font-semibold tracking-[-0.02em] text-[#101B45]">
                Sube una imagen
              </p>

              <p className="mt-1 text-[11px] text-[#7180A0]">
                PNG, JPG o WebP · 16:9 recomendado
              </p>

              <div className="mt-4 flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={isUploadingImage}
                  onClick={() => fileInputRef.current?.click()}
                  className="h-9 gap-1.5 px-3 text-[11px]"
                >
                  <Upload className="h-3.5 w-3.5" />

                  {isUploadingImage
                    ? "Subiendo..."
                    : "Subir imagen"}
                </Button>

                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={
                    !canGenerateWithAi ||
                    isGeneratingImage ||
                    isUploadingImage
                  }
                  onClick={onGenerateImage}
                  className="h-9 gap-1.5 border-[#D6DEFF] bg-[#F7F8FF] px-3 text-[11px] text-[#315BFF] hover:bg-[#EEF2FF] hover:text-[#315BFF] disabled:border-slate-200 disabled:bg-slate-50 disabled:text-slate-400"
                >
                  <Sparkles className="h-3.5 w-3.5" />

                  {isGeneratingImage
                    ? "Generando..."
                    : "Generar con IA"}
                </Button>
              </div>
            </div>
          )}
        </div>

        <div className="flex h-[210px] flex-col">
          <label className="block">
            <span className="mb-1.5 block text-[11px] font-medium text-[#1B2851]">
              Título del curso
            </span>

            <Input
              value={title}
              onChange={(event) =>
                onTitleChange(event.target.value)
              }
              placeholder="Ej. Power BI desde cero"
              className="h-10 bg-white text-[12px]"
            />
          </label>

          <label className="mt-3 flex min-h-0 flex-1 flex-col">
            <span className="mb-1.5 block text-[11px] font-medium text-[#1B2851]">
              Descripción
            </span>

            <Textarea
              value={description}
              maxLength={500}
              onChange={(event) =>
                onDescriptionChange(event.target.value)
              }
              placeholder="¿Qué aprenderá el usuario? Objetivos, contexto y resultados esperados..."
              className="min-h-0 flex-1 resize-none bg-white text-[12px]"
            />

            <span className="mt-1 text-right text-[10px] text-[#8190AD]">
              {description.length}/500
            </span>
          </label>
        </div>
      </div>
    </section>
  );
}