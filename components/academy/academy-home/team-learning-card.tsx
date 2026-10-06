// components/academy/academy-home/team-learning-card.tsx

import {
  ArrowRight,
  BriefcaseBusiness,
  Code2,
  UsersRound,
  UserRoundPlus,
} from "lucide-react";

type MockTeamRequest = {
  id: string;
  title: string;
  votes: number;
  icon: "code" | "people" | "business";
};

const MOCK_REQUESTS: MockTeamRequest[] = [
  {
    id: "python",
    title: "Python avanzado",
    votes: 34,
    icon: "code",
  },
  {
    id: "negociacion",
    title: "Negociación y persuasión",
    votes: 21,
    icon: "people",
  },
  {
    id: "equipos",
    title: "Gestión de equipos remotos",
    votes: 18,
    icon: "business",
  },
];

export function TeamLearningCard() {
  return (
    <section
      className="
        flex h-full min-h-0 min-w-0 flex-col
        overflow-hidden
        rounded-lg
        bg-white
        px-4 pb-3 pt-3
      "
    >
      {/* Cabecera */}
      <div className="flex shrink-0 items-center gap-2.5">
        <UserRoundPlus
          aria-hidden="true"
          strokeWidth={2}
          className="
            h-[18px] w-[18px]
            shrink-0
            text-[#4567F2]
          "
        />

        <h2
          className="
            text-[14px] font-semibold
            tracking-[-0.015em]
            text-[#07113D]
          "
        >
          Lo que tu equipo quiere aprender
        </h2>
      </div>

      {/* Solicitudes */}
      <div
        className="
          mt-3 flex min-h-0 flex-1
          flex-col
          overflow-hidden
          rounded-lg
          border border-slate-200
          bg-white
          px-2
        "
      >
        {MOCK_REQUESTS.map(
          (request, index) => (
            <TeamRequestRow
              key={request.id}
              request={request}
              showBorder={
                index <
                MOCK_REQUESTS.length - 1
              }
            />
          ),
        )}
      </div>

      {/* Footer */}
      <button
        type="button"
        className="
          mt-2.5
          flex shrink-0
          items-center gap-2
          self-start
          text-[11px] font-semibold
          text-[#315BFF]
          transition-opacity
          hover:opacity-75
        "
      >
        Ver solicitudes

        <ArrowRight
          aria-hidden="true"
          strokeWidth={2}
          className="h-[15px] w-[15px]"
        />
      </button>
    </section>
  );
}

function TeamRequestRow({
  request,
  showBorder,
}: {
  request: MockTeamRequest;
  showBorder: boolean;
}) {
  return (
    <div
      className={`
        grid min-h-0 flex-1
        grid-cols-[minmax(0,1fr)_70px_68px]
        items-center
        gap-2
        px-1
        ${
          showBorder
            ? "border-b border-slate-100"
            : ""
        }
      `}
    >
      {/* Curso */}
      <div className="flex min-w-0 items-center gap-2.5">
        <RequestIcon
          type={request.icon}
        />

        <p
          className="
            truncate
            text-[11px] font-medium
            text-[#18254F]
          "
        >
          {request.title}
        </p>
      </div>

      {/* Votos */}
      <span
        className="
          whitespace-nowrap
          text-[10px] font-normal
          text-[#66728F]
        "
      >
        {request.votes} votos
      </span>

      {/* Botón */}
      <button
        type="button"
        className="
          flex h-8 w-full
          items-center justify-center
          rounded-md
          bg-[#EEF2FF]
          text-[10px] font-semibold
          text-[#315BFF]
          transition-colors
          hover:bg-[#E4EAFF]
        "
      >
        Votar
      </button>
    </div>
  );
}

function RequestIcon({
  type,
}: {
  type: MockTeamRequest["icon"];
}) {
  const iconClass =
    "h-[14px] w-[14px] text-white";

  return (
    <div
      className={`
        flex h-6 w-6 shrink-0
        items-center justify-center
        rounded-md
        ${
          type === "code"
            ? "bg-[#1261A0]"
            : type === "people"
              ? "bg-[#6956C7]"
              : "bg-[#078A78]"
        }
      `}
    >
      {type === "code" ? (
        <Code2
          aria-hidden="true"
          strokeWidth={1.8}
          className={iconClass}
        />
      ) : type === "people" ? (
        <UsersRound
          aria-hidden="true"
          strokeWidth={1.8}
          className={iconClass}
        />
      ) : (
        <BriefcaseBusiness
          aria-hidden="true"
          strokeWidth={1.8}
          className={iconClass}
        />
      )}
    </div>
  );
}