// components/academy/course-detail/academy-course-learning-summary.tsx

import type { ReactNode } from "react";

import {
  Check,
  Target,
} from "lucide-react";

const MOCK_OBJECTIVES = [
  "Comprender los conceptos fundamentales del curso.",
  "Aplicar los conocimientos a situaciones reales de trabajo.",
  "Utilizar las herramientas y recursos de forma autónoma.",
];

export function AcademyCourseLearningSummary() {
  return (
    <div className="min-w-0">
      <LearningObjectives />
    </div>
  );
}

function LearningObjectives() {
  return (
    <section className="min-w-0">
      <SectionTitle
        icon={<Target />}
        title="Qué aprenderás"
      />

      <div
        className="
          mt-3 space-y-2.5
          @min-[640px]/course-content:mt-3.5 @min-[640px]/course-content:space-y-3
          @min-[800px]/course-content:mt-4 @min-[800px]/course-content:space-y-3.5
          @min-[960px]/course-content:mt-5 @min-[960px]/course-content:space-y-4
          @min-[1100px]/course-content:mt-6 @min-[1100px]/course-content:space-y-5
        "
      >
        {MOCK_OBJECTIVES.map(
          (objective) => (
            <div
              key={objective}
              className="
                flex min-w-0 items-start
                gap-2.5
                @min-[640px]/course-content:gap-3
                @min-[800px]/course-content:gap-3.5
                @min-[960px]/course-content:gap-4
                @min-[1100px]/course-content:gap-4.5
              "
            >
              <div
                className="
                  mt-px
                  flex h-[22px] w-[22px] shrink-0
                  items-center justify-center
                  rounded-full
                  bg-[#EDF3FF]

                  @min-[640px]/course-content:h-6 @min-[640px]/course-content:w-6
                  @min-[800px]/course-content:h-7 @min-[800px]/course-content:w-7
                  @min-[960px]/course-content:h-8 @min-[960px]/course-content:w-8
                  @min-[1100px]/course-content:h-9 @min-[1100px]/course-content:w-9
                "
              >
                <Check
                  className="
                    h-3.5 w-3.5
                    text-[#315BFF]

                    @min-[640px]/course-content:h-4 @min-[640px]/course-content:w-4
                    @min-[800px]/course-content:h-[17px] @min-[800px]/course-content:w-[17px]
                    @min-[960px]/course-content:h-[18px] @min-[960px]/course-content:w-[18px]
                    @min-[1100px]/course-content:h-5 @min-[1100px]/course-content:w-5
                  "
                />
              </div>

              <p
                className="
                  min-w-0 break-words
                  text-[11px]
                  leading-[17px]
                  text-[#53617F]

                  @min-[640px]/course-content:text-[12px]
                  @min-[640px]/course-content:leading-[18px]

                  @min-[800px]/course-content:text-[13px]
                  @min-[800px]/course-content:leading-[20px]

                  @min-[960px]/course-content:text-[14px]
                  @min-[960px]/course-content:leading-[21px]

                  @min-[1100px]/course-content:text-[15px]
                  @min-[1100px]/course-content:leading-[23px]
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
        gap-2.5

        @min-[640px]/course-content:gap-3
        @min-[800px]/course-content:gap-3.5
        @min-[960px]/course-content:gap-4
        @min-[1100px]/course-content:gap-4.5
      "
    >
      <div
        className="
          flex h-8 w-8 shrink-0
          items-center justify-center
          rounded-lg
          bg-[#EDF3FF]
          text-[#315BFF]

          [&>svg]:h-4
          [&>svg]:w-4

          @min-[640px]/course-content:h-9 @min-[640px]/course-content:w-9
          @min-[640px]/course-content:[&>svg]:h-[17px]
          @min-[640px]/course-content:[&>svg]:w-[17px]

          @min-[800px]/course-content:h-10 @min-[800px]/course-content:w-10
          @min-[800px]/course-content:[&>svg]:h-[18px]
          @min-[800px]/course-content:[&>svg]:w-[18px]

          @min-[960px]/course-content:h-11 @min-[960px]/course-content:w-11
          @min-[960px]/course-content:[&>svg]:h-5
          @min-[960px]/course-content:[&>svg]:w-5

          @min-[1100px]/course-content:h-12 @min-[1100px]/course-content:w-12
          @min-[1100px]/course-content:[&>svg]:h-[22px]
          @min-[1100px]/course-content:[&>svg]:w-[22px]
        "
      >
        {icon}
      </div>

      <h2
        className="
          min-w-0
          text-[14px]
          font-bold
          tracking-[-0.015em]
          text-[#07113D]

          @min-[640px]/course-content:text-[15px]
          @min-[800px]/course-content:text-[17px]
          @min-[960px]/course-content:text-[19px]
          @min-[1100px]/course-content:text-[21px]
        "
      >
        {title}
      </h2>
    </div>
  );
}