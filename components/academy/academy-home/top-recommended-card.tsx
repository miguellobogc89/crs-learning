// components/academy/academy-home/top-recommended-card.tsx

import {
  ArrowRight,
  BarChart3,
  Clock3,
  MoreVertical,
  Sparkles,
  ChevronDown,
} from "lucide-react";

export function TopRecommendedCard() {
  return (
    <section
      className="
        flex h-full min-h-0 min-w-0 flex-col
        overflow-hidden
        rounded-lg
        border border-slate-200/80
        bg-white
        px-4 pb-3 pt-3
      "
    >
      {/* Cabecera */}
      <div className="flex shrink-0 items-center justify-between">
        <div className="flex items-center gap-2.5">
          <Sparkles
            aria-hidden="true"
            strokeWidth={2}
            className="h-[19px] w-[19px] text-[#4567F2]"
          />

          <h2 className="text-sm font-semibold text-slate-950">
            Más recomendado
          </h2>
        </div>

        <ChevronDown
          aria-hidden="true"
          strokeWidth={2.2}
          className="h-4 w-4 text-[#66728F]"
        />
      </div>

      {/* Curso */}
      <div
        className="
          mt-3 flex min-h-0 flex-1 flex-col
          rounded-lg
          border border-slate-200
          bg-white
          p-2
        "
      >
        {/* Información principal */}
        <div className="flex min-h-0 flex-1 gap-3">
          {/* Imagen */}
          <div
            className="
              h-[92px] w-[138px]
              shrink-0 overflow-hidden
              rounded-md
              bg-[#E9EDF5]
            "
          >
            <div
              className="
                flex h-full w-full
                items-center justify-center
                bg-gradient-to-br
                from-slate-100 to-slate-200
              "
            >
              <BarChart3
                aria-hidden="true"
                strokeWidth={1.5}
                className="h-10 w-10 text-[#4567F2]"
              />
            </div>
          </div>

          {/* Texto */}
          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-2">
              <h3
                className="
                  truncate
                  text-[14px] font-bold
                  leading-5
                  text-[#07113D]
                "
              >
                Power BI intermedio
              </h3>

              <MoreVertical
                aria-hidden="true"
                strokeWidth={2.2}
                className="
                  mt-0.5 h-[17px] w-[17px]
                  shrink-0 text-[#66728F]
                "
              />
            </div>

            <p
              className="
                mt-1 max-w-[290px]
                text-[12px] font-normal
                leading-[18px]
                text-[#66728F]
              "
            >
              Uno de los cursos mejor valorados
              de Academy. Aprende a analizar y
              visualizar datos con Power BI.
            </p>
          </div>
        </div>

        {/* Pie */}
        <div
          className="
            mt-2 flex shrink-0
            items-center justify-between
            gap-3
          "
        >
          <div className="flex min-w-0 items-center gap-5">
            <div className="flex items-center gap-2">
              <Clock3
                aria-hidden="true"
                strokeWidth={1.8}
                className="h-[17px] w-[17px] text-[#7886A8]"
              />

              <span className="whitespace-nowrap text-[11px] font-normal text-[#66728F]">
                4 h 30 min
              </span>
            </div>

            <div className="flex items-center gap-2">
              <BarChart3
                aria-hidden="true"
                strokeWidth={1.8}
                className="h-[17px] w-[17px] text-[#7886A8]"
              />

              <span className="whitespace-nowrap text-[11px] font-normal text-[#66728F]">
                Nivel intermedio
              </span>
            </div>
          </div>

          <button
            type="button"
            className="
              flex h-10 w-[142px]
              shrink-0 items-center
              justify-center gap-2
              rounded-lg
              bg-[#EEF2FF]
              text-[12px] font-semibold
              text-[#315BFF]
              transition-colors
              hover:bg-[#E4EAFF]
            "
          >
            Ver curso

            <ArrowRight
              aria-hidden="true"
              strokeWidth={2}
              className="h-4 w-4"
            />
          </button>
        </div>
      </div>
    </section>
  );
}