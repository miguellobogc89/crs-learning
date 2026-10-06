// components/academy/academy-catalog.tsx
// components/academy//academy-catalog.tsx

"use client";

import {
  ArrowLeft,
  ArrowRight,
  BarChart3,
  Bookmark,
  BrainCircuit,
  BriefcaseBusiness,
  Check,
  ChevronDown,
  Clock3,
  Database,
  Filter,
  GraduationCap,
  LayoutGrid,
  Leaf,
  MoreHorizontal,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Star,
  UsersRound,
  Zap,
} from "lucide-react";

type MockCourse = {
  id: number;
  title: string;
  description: string;
  category: string;
  duration: string;
  level: string;
  rating: string;
  image: string;
};

const COURSES: MockCourse[] = [
  {
    id: 1,
    title: "Power BI desde cero",
    description:
      "Aprende a transformar datos en información útil con Power BI, desde los fundamentos hasta tus primeros dashboards.",
    category: "Datos",
    duration: "4 h 30 min",
    level: "Principiante",
    rating: "4,8",
    image:
      "https://images.unsplash.com/photo-1551288049-bebda4e38f71?auto=format&fit=crop&w=900&q=85",
  },
  {
    id: 2,
    title: "Power BI intermedio",
    description:
      "Profundiza en modelado de datos, DAX y visualizaciones avanzadas para crear informes profesionales.",
    category: "Datos",
    duration: "4 h 30 min",
    level: "Intermedio",
    rating: "4,6",
    image:
      "https://images.unsplash.com/photo-1460925895917-afdab827c52f?auto=format&fit=crop&w=900&q=85",
  },
  {
    id: 3,
    title: "Gestión del tiempo en entornos híbridos",
    description:
      "Estrategias prácticas para organizar tu tiempo, priorizar tareas y mantener el foco en entornos de trabajo flexibles.",
    category: "Habilidades",
    duration: "2 h 10 min",
    level: "Todos los niveles",
    rating: "4,7",
    image:
      "https://images.unsplash.com/photo-1556761175-b413da4baf72?auto=format&fit=crop&w=900&q=85",
  },
  {
    id: 4,
    title: "Ciberseguridad en el trabajo",
    description:
      "Conoce las principales amenazas y aprende buenas prácticas para mantener la información de la empresa segura.",
    category: "Tecnología",
    duration: "1 h 45 min",
    level: "Principiante",
    rating: "4,6",
    image:
      "https://images.unsplash.com/photo-1563013544-824ae1b704d3?auto=format&fit=crop&w=900&q=85",
  },
  {
    id: 5,
    title: "Comunicación efectiva en entornos híbridos",
    description:
      "Mejora la colaboración y la comunicación con tu equipo, estés donde estés.",
    category: "Habilidades",
    duration: "3 h 15 min",
    level: "Todos los niveles",
    rating: "4,6",
    image:
      "https://images.unsplash.com/photo-1521737711867-e3b97375f902?auto=format&fit=crop&w=900&q=85",
  },
  {
    id: 6,
    title: "Análisis de datos con Excel",
    description:
      "Domina las funciones, tablas dinámicas y visualizaciones para analizar datos de forma eficaz.",
    category: "Negocio",
    duration: "3 h 40 min",
    level: "Intermedio",
    rating: "4,5",
    image:
      "https://images.unsplash.com/photo-1543286386-713bdd548da4?auto=format&fit=crop&w=900&q=85",
  },
  {
    id: 7,
    title: "Introducción a la IA generativa",
    description:
      "Descubre cómo aplicar la inteligencia artificial generativa en tu día a día de forma segura y práctica.",
    category: "Tecnología",
    duration: "2 h 45 min",
    level: "Principiante",
    rating: "4,7",
    image:
      "https://images.unsplash.com/photo-1677442136019-21780ecad995?auto=format&fit=crop&w=900&q=85",
  },
  {
    id: 8,
    title: "Gestión de proyectos ágiles",
    description:
      "Aprende a trabajar con metodologías ágiles en entornos reales y mejora la entrega de resultados.",
    category: "Negocio",
    duration: "4 h 10 min",
    level: "Intermedio",
    rating: "4,6",
    image:
      "https://images.unsplash.com/photo-1516321318423-f06f85e504b3?auto=format&fit=crop&w=900&q=85",
  },
  {
    id: 9,
    title: "Protección de datos y cumplimiento",
    description:
      "Conoce los principios del RGPD y las buenas prácticas para el tratamiento de datos personales.",
    category: "Seguridad",
    duration: "2 h 20 min",
    level: "Todos los niveles",
    rating: "4,5",
    image:
      "https://images.unsplash.com/photo-1563986768609-322da13575f3?auto=format&fit=crop&w=900&q=85",
  },
];

const CATEGORIES = [
  {
    label: "Todos",
    icon: LayoutGrid,
  },
  {
    label: "Datos",
    icon: BarChart3,
  },
  {
    label: "Productividad",
    icon: BriefcaseBusiness,
  },
  {
    label: "Tecnología",
    icon: BrainCircuit,
  },
  {
    label: "Habilidades",
    icon: GraduationCap,
  },
  {
    label: "Negocio",
    icon: BriefcaseBusiness,
  },
  {
    label: "Seguridad",
    icon: ShieldCheck,
  },
  {
    label: "Sostenibilidad",
    icon: Leaf,
  },
];

const FILTER_CATEGORIES = [
  ["Datos", 12],
  ["Productividad", 6],
  ["Tecnología", 8],
  ["Habilidades", 9],
  ["Negocio", 7],
  ["Seguridad", 5],
  ["Sostenibilidad", 3],
] as const;

const LEVELS = [
  ["Todos los niveles", 18],
  ["Principiante", 12],
  ["Intermedio", 9],
  ["Avanzado", 3],
] as const;

const DURATIONS = [
  ["Menos de 2 horas", 10],
  ["2–5 horas", 20],
  ["Más de 5 horas", 12],
] as const;

const LEARNING_PATHS = [
  {
    title: "Analista de Datos",
    meta: "5 cursos · 18 h",
    icon: Database,
    className: "bg-[#E9F2FF] text-[#315BFF]",
  },
  {
    title: "Gestión de proyectos",
    meta: "6 cursos · 20 h",
    icon: BriefcaseBusiness,
    className: "bg-[#F2E9FF] text-[#8754E8]",
  },
  {
    title: "Liderazgo de equipos",
    meta: "4 cursos · 14 h",
    icon: UsersRound,
    className: "bg-[#E1F6ED] text-[#15936C]",
  },
];

export function AcademyCatalog() {
  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden">
      {/* Título */}
      <div className="shrink-0 px-2 pb-4 lg:px-3 2xl:pb-5">

      </div>

      {/* Contenido */}
      <div
        className="
          grid min-h-0 min-w-0 flex-1
          grid-cols-1 gap-3
          xl:grid-cols-[minmax(0,1fr)_230px]
          2xl:grid-cols-[minmax(0,1fr)_270px]
        "
      >
        {/* Zona principal */}
        <section
          className="
            flex min-h-0 min-w-0 flex-col
            overflow-hidden
            rounded-xl
            border border-slate-200/70
            bg-white
          "
        >
          {/* Categorías */}
          <div
            className="
              flex shrink-0 items-center gap-1
              overflow-x-auto
              border-b border-slate-200/70
              px-2 py-1.5
              [scrollbar-width:none]
              [&::-webkit-scrollbar]:hidden
            "
          >
            {CATEGORIES.map(
              ({ label, icon: Icon }, index) => {
                const active = index === 0;

                return (
                  <button
                    key={label}
                    type="button"
                    className={`
                      flex h-8 shrink-0 items-center gap-1.5
                      rounded-md px-2.5
                      text-[10px] font-medium
                      transition-colors
                      xl:text-[11px]
                      2xl:h-9 2xl:px-3 2xl:text-[12px]
                      ${
                        active
                          ? "bg-[#315BFF] text-white"
                          : "text-[#435176] hover:bg-[#F3F6FC]"
                      }
                    `}
                  >
                    <Icon
                      aria-hidden="true"
                      strokeWidth={1.8}
                      className="h-3.5 w-3.5 2xl:h-4 2xl:w-4"
                    />

                    {label}
                  </button>
                );
              },
            )}

            <button
              type="button"
              className="
                flex h-8 shrink-0 items-center gap-1.5
                rounded-md px-2.5
                text-[10px] font-medium
                text-[#435176]
                hover:bg-[#F3F6FC]
                xl:text-[11px]
                2xl:h-9 2xl:text-[12px]
              "
            >
              <MoreHorizontal className="h-4 w-4" />
              Más
            </button>
          </div>

          {/* Buscador y orden */}
          <div
            className="
              grid shrink-0
              grid-cols-[minmax(0,1fr)_170px]
              gap-3
              px-3 py-3
              2xl:grid-cols-[minmax(0,1fr)_190px]
            "
          >
            <div
              className="
                flex h-9 min-w-0 items-center gap-2
                rounded-lg
                border border-slate-200
                bg-[#F8FAFD]
                px-3
                2xl:h-10
              "
            >
              <Search
                strokeWidth={1.8}
                className="h-4 w-4 shrink-0 text-[#657493]"
              />

              <input
                type="text"
                placeholder="Buscar cursos, habilidades o temas..."
                className="
                  min-w-0 flex-1 bg-transparent
                  text-[10px] text-[#18254F]
                  outline-none
                  placeholder:text-[#95A0B8]
                  xl:text-[11px]
                  2xl:text-[12px]
                "
              />
            </div>

            <button
              type="button"
              className="
                flex h-9 items-center justify-between
                rounded-lg
                border border-slate-200
                bg-white
                px-3
                text-[10px] font-semibold
                text-[#26345C]
                xl:text-[11px]
                2xl:h-10 2xl:text-[12px]
              "
            >
              <span className="flex items-center gap-2">
                <SlidersHorizontal className="h-4 w-4 text-[#66728F]" />
                Más relevantes
              </span>

              <ChevronDown className="h-4 w-4 text-[#66728F]" />
            </button>
          </div>

{/* Grid cursos */}
<div
  className="
    grid min-h-0 flex-1
    grid-cols-4
    gap-2
    overflow-hidden
    px-3 pb-2
    2xl:grid-cols-5
  "
>
  {COURSES.slice(0, 10).map((course, index) => (
    <CatalogCourseCard
      key={course.id}
      course={course}
      hiddenUntil2xl={index >= 8}
    />
  ))}
</div>

          {/* Paginación */}
          <div
            className="
              flex shrink-0 items-center justify-between
              border-t border-slate-100
              px-4 py-2
            "
          >
            <div className="w-[120px]" />

            <div className="flex items-center gap-1">
              <PaginationButton>
                <ArrowLeft className="h-3.5 w-3.5" />
              </PaginationButton>

              {[1, 2, 3, 4, 5].map((page) => (
                <PaginationButton
                  key={page}
                  active={page === 1}
                >
                  {page}
                </PaginationButton>
              ))}

              <PaginationButton>
                <ArrowRight className="h-3.5 w-3.5" />
              </PaginationButton>
            </div>

            <p
              className="
                w-[120px] text-right
                text-[9px] text-[#66728F]
                xl:text-[10px]
              "
            >
              Mostrando 1–9 de 42 cursos
            </p>
          </div>
        </section>

        {/* Columna derecha */}
        <aside
          className="
            hidden min-h-0 min-w-0
            flex-col gap-3
            xl:flex
          "
        >
          <FiltersCard />

          <LearningPathsCard />
        </aside>
      </div>
    </div>
  );
}

function CatalogCourseCard({
  course,
  hiddenUntil2xl,
}: {
  course: MockCourse;
  hiddenUntil2xl: boolean;
}) {
  return (
    <article
      className={`
        ${hiddenUntil2xl ? "hidden 2xl:flex" : "flex"}
        h-full min-h-0 min-w-0 flex-col
        overflow-hidden
        rounded-lg
        border border-slate-200/70
        bg-white
        shadow-[0_2px_7px_rgba(15,23,42,0.035)]
      `}
    >
      <div className="relative h-[40%] min-h-[78px] shrink-0">
        <img
          src={course.image}
          alt=""
          className="h-full w-full object-cover"
        />

        <button
          type="button"
          aria-label={`Guardar ${course.title}`}
          className="
            absolute right-2 top-2
            flex h-7 w-7 items-center justify-center
            rounded-md
            bg-white/95
            text-[#26345C]
            shadow-sm
          "
        >
          <Bookmark
            strokeWidth={1.8}
            className="h-4 w-4"
          />
        </button>

        <span
className="
  absolute bottom-[-9px] left-2
  rounded-full
  bg-[#E7F3FF]
  px-2.5 py-0.5
  text-[10px] font-medium
  text-[#1677D2]
  xl:text-[11px]
  2xl:text-[12px]
"
        >
          {course.category}
        </span>
      </div>

      <div
        className="
          flex min-h-0 flex-1 flex-col
          px-2.5 pb-2 pt-3
          2xl:px-3
        "
      >
        <h3
className="
  line-clamp-2
  text-[13px] font-bold
  leading-[17px]
  tracking-[-0.01em]
  text-[#07113D]
  xl:text-[14px] xl:leading-[18px]
  2xl:text-[15px] 2xl:leading-[19px]
"
        >
          {course.title}
        </h3>

        <p
className="
  mt-1.5
  line-clamp-3
  text-[11px] font-normal
  leading-[15px]
  text-[#66728F]
  xl:text-[12px] xl:leading-[16px]
  2xl:text-[13px] 2xl:leading-[17px]
"
        >
          {course.description}
        </p>

        <div
className="
  mt-auto
  flex items-center justify-between
  gap-2
  pt-2
  text-[10px]
  text-[#66728F]
  xl:text-[11px]
  2xl:text-[12px]
"
        >
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex shrink-0 items-center gap-1">
              <Clock3
                strokeWidth={1.8}
                className="h-3.5 w-3.5"
              />
              {course.duration}
            </span>

            <span className="flex min-w-0 items-center gap-1">
              <BarChart3
                strokeWidth={1.8}
                className="h-3.5 w-3.5 shrink-0"
              />

              <span className="truncate">
                {course.level}
              </span>
            </span>
          </div>

          <span
            className="
              flex shrink-0 items-center gap-1
              font-semibold text-[#344263]
            "
          >
            <Star
              fill="currentColor"
              strokeWidth={0}
              className="h-3.5 w-3.5 text-[#FFB020]"
            />
            {course.rating}
          </span>
        </div>
      </div>
    </article>
  );
}

function FiltersCard() {
  return (
    <div
      className="
        min-h-0 shrink
        overflow-y-auto
        rounded-xl
        border border-slate-200/70
        bg-white
        px-3 py-3
        2xl:px-4
      "
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Filter
            strokeWidth={2}
            className="h-4 w-4 text-[#315BFF]"
          />

          <h2 className="text-[11px] font-bold text-[#07113D] 2xl:text-[12px]">
            Filtros
          </h2>
        </div>

        <button
          type="button"
          className="text-[9px] font-medium text-[#315BFF] 2xl:text-[10px]"
        >
          Limpiar todo
        </button>
      </div>

      <FilterSection title="Categoría">
        {FILTER_CATEGORIES.map(([label, count]) => (
          <FilterRow
            key={label}
            label={label}
            count={count}
          />
        ))}
      </FilterSection>

      <FilterSection title="Nivel">
        {LEVELS.map(([label, count]) => (
          <FilterRow
            key={label}
            label={label}
            count={count}
          />
        ))}
      </FilterSection>

      <FilterSection title="Duración">
        {DURATIONS.map(([label, count]) => (
          <FilterRow
            key={label}
            label={label}
            count={count}
          />
        ))}
      </FilterSection>

      <FilterSection title="Valoración mínima">
        <RatingFilter
          stars="4,5 o superior"
          count={18}
        />
        <RatingFilter
          stars="4,0 o superior"
          count={32}
        />
        <RatingFilter
          stars="3,5 o superior"
          count={40}
        />
      </FilterSection>
    </div>
  );
}

function FilterSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mt-4 border-t border-slate-100 pt-3 first:border-0">
      <h3 className="mb-2 text-[10px] font-bold text-[#18254F] 2xl:text-[11px]">
        {title}
      </h3>

      <div className="space-y-1.5">
        {children}
      </div>
    </div>
  );
}

function FilterRow({
  label,
  count,
}: {
  label: string;
  count: number;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-2">
      <span
        className="
          flex h-3.5 w-3.5 shrink-0
          items-center justify-center
          rounded-[3px]
          border border-[#B8C2D7]
          bg-white
        "
      >
        <Check className="hidden h-2.5 w-2.5" />
      </span>

      <span className="min-w-0 flex-1 truncate text-[9px] text-[#435176] 2xl:text-[10px]">
        {label}
      </span>

      <span className="text-[9px] text-[#7886A8] 2xl:text-[10px]">
        {count}
      </span>
    </label>
  );
}

function RatingFilter({
  stars,
  count,
}: {
  stars: string;
  count: number;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <Star
        fill="currentColor"
        strokeWidth={0}
        className="h-3.5 w-3.5 shrink-0 text-[#FFB020]"
      />

      <span className="min-w-0 flex-1 truncate text-[9px] text-[#435176] 2xl:text-[10px]">
        {stars}
      </span>

      <span className="text-[9px] text-[#7886A8] 2xl:text-[10px]">
        {count}
      </span>
    </div>
  );
}

function LearningPathsCard() {
  return (
    <div
      className="
        shrink-0
        rounded-xl
        border border-slate-200/70
        bg-white
        p-3
      "
    >
      <div className="flex items-start gap-2">
        <Sparkles
          strokeWidth={1.8}
          className="mt-0.5 h-4 w-4 shrink-0 text-[#315BFF]"
        />

        <div className="min-w-0">
          <h2 className="text-[10px] font-bold text-[#315BFF] 2xl:text-[11px]">
            Rutas de aprendizaje
          </h2>

          <p className="mt-0.5 text-[8px] leading-3 text-[#66728F] 2xl:text-[9px]">
            Itinerarios recomendados para desarrollar habilidades clave en tu puesto.
          </p>
        </div>

        <ChevronDown className="-rotate-90 h-4 w-4 shrink-0 text-[#315BFF]" />
      </div>

      <div className="mt-3 space-y-2">
        {LEARNING_PATHS.map(
          ({
            title,
            meta,
            icon: Icon,
            className,
          }) => (
            <button
              key={title}
              type="button"
              className="
                flex w-full items-center gap-2
                text-left
              "
            >
              <span
                className={`
                  flex h-8 w-8 shrink-0
                  items-center justify-center
                  rounded-md
                  ${className}
                `}
              >
                <Icon
                  strokeWidth={1.8}
                  className="h-4 w-4"
                />
              </span>

              <span className="min-w-0 flex-1">
                <span className="block truncate text-[9px] font-semibold text-[#18254F] 2xl:text-[10px]">
                  {title}
                </span>

                <span className="mt-0.5 block text-[8px] text-[#7886A8] 2xl:text-[9px]">
                  {meta}
                </span>
              </span>

              <ArrowRight className="h-3.5 w-3.5 shrink-0 text-[#315BFF]" />
            </button>
          ),
        )}
      </div>
    </div>
  );
}

function PaginationButton({
  children,
  active = false,
}: {
  children: React.ReactNode;
  active?: boolean;
}) {
  return (
    <button
      type="button"
      className={`
        flex h-6 min-w-6 items-center justify-center
        rounded-full px-1.5
        text-[9px] font-medium
        transition-colors
        2xl:h-7 2xl:min-w-7 2xl:text-[10px]
        ${
          active
            ? "bg-[#315BFF] text-white"
            : "text-[#435176] hover:bg-[#F1F4FA]"
        }
      `}
    >
      {children}
    </button>
  );
}