// components/academy/course-detail/academy-course-learning-summary.tsx

import type { ReactNode } from "react";

import {
  BarChart3,
  BookOpen,
  BriefcaseBusiness,
  Check,
  Target,
} from "lucide-react";

const MOCK_OBJECTIVES = [
  "Comprender los conceptos fundamentales del curso.",
  "Aplicar los conocimientos a situaciones reales de trabajo.",
  "Utilizar las herramientas y recursos de forma autónoma.",
  "Identificar buenas prácticas y errores habituales.",
];

const MOCK_SKILLS = [
  {
    label: "Power BI",
    primary: true,
    icon: BookOpen,
  },
  {
    label: "Visualización de datos",
    icon: BriefcaseBusiness,
  },
  {
    label: "Análisis de datos",
    icon: BarChart3,
  },
  {
    label: "Storytelling con datos",
    icon: Target,
  },
];

export function AcademyCourseLearningSummary() {
  return (
    <div
      className="
        flex min-h-0 min-w-0 flex-col
        overflow-y-auto
        pr-2
        [scrollbar-gutter:stable]

        max-h-[calc(100vh-225px)]
        lg:max-h-[calc(100vh-240px)]
        xl:max-h-[calc(100vh-300px)]
        2xl:max-h-[calc(100vh-335px)]
        3xl:max-h-[calc(100vh-365px)]
      "
    >
      <LearningObjectives />

      <div
        className="
          my-4 h-px shrink-0 bg-slate-100
          lg:my-5
          xl:my-6
          2xl:my-7
          3xl:my-8
        "
      />

      <Skills />
    </div>
  );
}

function LearningObjectives() {
  return (
    <section className="min-w-0 shrink-0">
      <SectionTitle
        icon={<Target />}
        title="Qué aprenderás"
      />

      <div
        className="
          mt-3 space-y-3
          lg:mt-4 lg:space-y-3.5
          xl:mt-5 xl:space-y-4
          2xl:mt-6 2xl:space-y-5
          3xl:mt-7 3xl:space-y-6
        "
      >
        {MOCK_OBJECTIVES.map(
          (objective) => (
            <div
              key={objective}
              className="
                flex min-w-0 items-start
                gap-3
                lg:gap-3.5
                xl:gap-4
                2xl:gap-4.5
                3xl:gap-5
              "
            >
              <div
                className="
                  mt-0.5
                  flex h-6 w-6 shrink-0
                  items-center justify-center
                  rounded-full
                  bg-[#EDF3FF]

                  lg:h-7 lg:w-7
                  xl:h-8 xl:w-8
                  2xl:h-9 2xl:w-9
                  3xl:h-10 3xl:w-10
                "
              >
                <Check
                  className="
                    h-3.5 w-3.5
                    text-[#315BFF]

                    lg:h-4 lg:w-4
                    xl:h-[18px] xl:w-[18px]
                    2xl:h-5 2xl:w-5
                    3xl:h-[22px] 3xl:w-[22px]
                  "
                />
              </div>

              <p
                className="
                  min-w-0
                  text-[12px]
                  leading-[18px]
                  text-[#53617F]

                  lg:text-[13px]
                  lg:leading-[20px]

                  xl:text-[15px]
                  xl:leading-[22px]

                  2xl:text-[16px]
                  2xl:leading-[24px]

                  3xl:text-[17px]
                  3xl:leading-[26px]
                "
              >
                {objective}
              </p>
            </div>
          ),
        )}
      </div>
    </section>
  );
}

function Skills() {
  return (
    <section className="min-w-0 shrink-0">
      <SectionTitle
        icon={<BarChart3 />}
        title="Habilidades que desarrollarás"
      />

      <div
        className="
          mt-3 space-y-2.5
          lg:mt-4 lg:space-y-3
          xl:mt-5 xl:space-y-3.5
          2xl:mt-6 2xl:space-y-4
          3xl:mt-7 3xl:space-y-5
        "
      >
        {MOCK_SKILLS.map(
          ({
            label,
            primary,
            icon: Icon,
          }) => (
            <div
              key={label}
              className="
                flex min-w-0
                items-center
                gap-2.5

                lg:gap-3
                xl:gap-3.5
                2xl:gap-4
                3xl:gap-5
              "
            >
              <div
                className="
                  flex h-8 w-8 shrink-0
                  items-center justify-center
                  rounded-lg
                  bg-[#EDF3FF]

                  lg:h-9 lg:w-9
                  xl:h-10 xl:w-10
                  2xl:h-11 2xl:w-11
                  3xl:h-12 3xl:w-12
                "
              >
                <Icon
                  className="
                    h-4 w-4
                    text-[#315BFF]

                    lg:h-[18px] lg:w-[18px]
                    xl:h-5 xl:w-5
                    2xl:h-[22px] 2xl:w-[22px]
                    3xl:h-6 3xl:w-6
                  "
                />
              </div>

              <span
                className="
                  min-w-0 truncate
                  bg-transparent
                  text-[12px]
                  font-semibold
                  text-[#07113D]

                  lg:text-[13px]
                  xl:text-[15px]
                  2xl:text-[16px]
                  3xl:text-[17px]
                "
              >
                {label}
              </span>

              {primary ? (
                <span
                  className="
                    hidden shrink-0
                    bg-[#EDF3FF]
                    px-2.5 py-1
                    text-[10px]
                    font-medium
                    text-[#315BFF]

                    xl:inline
                    xl:px-3
                    xl:py-1.5
                    xl:text-[12px]

                    2xl:text-[13px]

                    3xl:text-[14px]
                  "
                >
                  Habilidad principal
                </span>
              ) : null}
            </div>
          ),
        )}
      </div>
    </section>
  );
}

function SectionTitle({
  icon,
  title,
}: {
  icon: ReactNode;
  title: string;
}) {
  return (
    <div
      className="
        flex min-w-0
        items-center
        gap-3

        lg:gap-3.5
        xl:gap-4
        2xl:gap-4.5
        3xl:gap-5
      "
    >
      <div
        className="
          flex h-9 w-9 shrink-0
          items-center justify-center
          rounded-lg
          bg-[#EDF3FF]
          text-[#315BFF]

          [&>svg]:h-[18px]
          [&>svg]:w-[18px]

          lg:h-10 lg:w-10
          lg:[&>svg]:h-5
          lg:[&>svg]:w-5

          xl:h-11 xl:w-11
          xl:[&>svg]:h-[22px]
          xl:[&>svg]:w-[22px]

          2xl:h-12 2xl:w-12
          2xl:[&>svg]:h-6
          2xl:[&>svg]:w-6

          3xl:h-14 3xl:w-14
          3xl:[&>svg]:h-7
          3xl:[&>svg]:w-7
        "
      >
        {icon}
      </div>

      <h2
        className="
          min-w-0
          text-[16px]
          font-bold
          tracking-[-0.015em]
          text-[#07113D]

          lg:text-[17px]
          xl:text-[20px]
          2xl:text-[22px]
          3xl:text-[24px]
        "
      >
        {title}
      </h2>
    </div>
  );
}