"use client";

import { useRef, useState } from "react";
import { ImageIcon, Sparkles, Upload } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type CourseImageFieldProps = {
  value: File | null;
  previewUrl: string | null;
  onChange: (file: File | null, previewUrl: string | null) => void;
};

export function CourseImageField({
  value,
  previewUrl,
  onChange,
}: CourseImageFieldProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [generating, setGenerating] = useState(false);

  function selectFile(file: File | undefined) {
    if (!file) return;

    const nextPreview = URL.createObjectURL(file);
    onChange(file, nextPreview);
  }

  async function handleGenerate() {
    // UI preparada para conectar el generador de imágenes.
    // No fingimos una generación hasta tener el servicio real.
    setGenerating(true);
    await new Promise((resolve) => setTimeout(resolve, 500));
    setGenerating(false);
  }

  return (
    <div className="space-y-3">
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="hidden"
        onChange={(event) => selectFile(event.target.files?.[0])}
      />

      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        className={cn(
          "group relative flex aspect-[16/7] w-full overflow-hidden rounded-2xl border border-dashed border-slate-300 bg-slate-50 text-left transition",
          "hover:border-[#0A58FF]/50 hover:bg-[#F7FAFF]",
        )}
      >
        {previewUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={previewUrl}
            alt="Previsualización de la portada del curso"
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="m-auto flex flex-col items-center px-6 text-center">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-white text-slate-500 shadow-sm ring-1 ring-slate-200">
              <ImageIcon className="h-5 w-5" />
            </div>
            <p className="mt-3 text-sm font-medium text-slate-800">
              Añade una portada
            </p>
            <p className="mt-1 text-xs text-slate-500">
              JPG, PNG o WebP. Recomendado 16:7.
            </p>
          </div>
        )}

        {previewUrl ? (
          <div className="absolute inset-0 flex items-center justify-center bg-slate-950/0 opacity-0 transition group-hover:bg-slate-950/35 group-hover:opacity-100">
            <span className="rounded-lg bg-white px-3 py-2 text-xs font-semibold text-slate-900 shadow-sm">
              Cambiar imagen
            </span>
          </div>
        ) : null}
      </button>

      <div className="grid gap-2 sm:grid-cols-2">
        <Button
          type="button"
          variant="secondary"
          className="gap-2"
          onClick={() => inputRef.current?.click()}
        >
          <Upload className="h-4 w-4" />
          {value ? "Cambiar imagen" : "Subir imagen"}
        </Button>

        <Button
          type="button"
          variant="secondary"
          className="gap-2"
          onClick={handleGenerate}
          disabled={generating}
        >
          <Sparkles className="h-4 w-4" />
          {generating ? "Preparando..." : "Generar con IA"}
        </Button>
      </div>

      <p className="text-xs leading-5 text-slate-400">
        La generación con IA queda preparada visualmente y se conectará al
        servicio de imágenes cuando implementemos esa acción.
      </p>
    </div>
  );
}
