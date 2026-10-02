// components/academy/create-course/course-basic-information.tsx

"use client";

import { BookOpen, ImagePlus, Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

type CourseBasicInformationProps = {
  title: string;
  description: string;
  imageUrl: string | null;
  isGeneratingImage: boolean;
  onTitleChange: (value: string) => void;
  onDescriptionChange: (value: string) => void;
  onGenerateImage: () => void;
};

export function CourseBasicInformation({
  title,
  description,
  imageUrl,
  isGeneratingImage,
  onTitleChange,
  onDescriptionChange,
  onGenerateImage,
}: CourseBasicInformationProps) {
  return (
    <section className="border-b border-[#EEF1F6] py-5">
      <div className="flex items-start gap-3">
        <div className="flex h-7 w-7 shrink-0 items-center justify-center text-[#315BFF]">
          <BookOpen className="h-[18px] w-[18px]" strokeWidth={2} />
        </div>

        <div>
          <h3 className="text-[14px] font-bold leading-5 tracking-[-0.025em] text-[#071747]">
            Información básica
          </h3>

          <p className="mt-0.5 text-[11.5px] leading-4 tracking-[-0.015em] text-[#536184]">
            Añade la portada y define la información principal del curso.
          </p>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-[1.02fr_0.98fr] gap-5">
        {/* Portada */}
        <div>
          {imageUrl ? (
            <div className="relative flex h-[210px] overflow-hidden rounded-xl border border-[#DDE3F0] bg-[#FAFBFF]">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={imageUrl}
                alt="Portada del curso"
                className="h-full w-full object-cover"
              />

              <Button
                type="button"
                variant="secondary"
                size="sm"
                disabled={isGeneratingImage}
                onClick={onGenerateImage}
                className="absolute bottom-3 right-3 gap-1.5 border border-[#DCE2F0] bg-white/95 text-[11px] text-[#15234E] shadow-sm hover:bg-white"
              >
                <Sparkles className="h-3.5 w-3.5 text-[#315BFF]" />

                {isGeneratingImage
                  ? "Generando..."
                  : "Generar otra"}
              </Button>
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
                Portada del curso
              </p>

              <p className="mt-1 text-[11px] text-[#7180A0]">
                Formato 16:9 recomendado
              </p>

              <div className="mt-4 flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled
                  className="h-9 gap-1.5 px-3 text-[11px]"
                >
                  <ImagePlus className="h-3.5 w-3.5" />
                  Subir imagen
                </Button>

                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={isGeneratingImage}
                  onClick={onGenerateImage}
                  className="h-9 gap-1.5 border-[#D6DEFF] bg-[#F7F8FF] px-3 text-[11px] text-[#315BFF] hover:bg-[#EEF2FF] hover:text-[#315BFF]"
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

        {/* Información */}
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