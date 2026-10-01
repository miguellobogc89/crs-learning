// Datos de demostracion: no representan el aprendizaje real del usuario.
export type AcademyCourse = {
  id: string;
  title: string;
  progress: number;
  duration: string;
  remaining?: string;
  category: string;
  assignment?: "Obligatorio" | "Asignado";
  deadline?: string;
  deadlineLabel?: string;
  dueLabel?: string;
  thumbnail: "analytics" | "team" | "security" | "risk" | "ai" | "agile" | "knowledge";
};

export type AcademyRecommendation = {
  id: string;
  title: string;
  category: string;
  duration: string;
  reason: string;
  rating: number;
  thumbnail: AcademyCourse["thumbnail"];
};

export const academyLearning: AcademyCourse[] = [
  {
    id: "power-bi",
    title: "Power BI desde cero",
    progress: 72,
    duration: "1 h 45 min",
    remaining: "45 min restantes",
    category: "Herramientas",
    thumbnail: "analytics",
  },
  {
    id: "time-management",
    title: "Gestion del tiempo",
    progress: 35,
    duration: "2 h",
    remaining: "1 h 20 min restantes",
    category: "Soft skills",
    thumbnail: "team",
  },
  {
    id: "security",
    title: "Ciberseguridad",
    progress: 60,
    duration: "1 h 15 min",
    remaining: "30 min restantes",
    category: "Operativa interna",
    assignment: "Obligatorio",
    deadline: "2026-10-15",
    deadlineLabel: "15 oct 2026",
    dueLabel: "Quedan 14 dias",
    thumbnail: "security",
  },
  {
    id: "risk-prevention",
    title: "Prevencion de Riesgos Laborales",
    progress: 0,
    duration: "40 min",
    category: "Cumplimiento",
    assignment: "Obligatorio",
    deadline: "2026-10-18",
    deadlineLabel: "18 oct 2026",
    dueLabel: "Quedan 17 dias",
    thumbnail: "risk",
  },
  {
    id: "ethics",
    title: "Codigo Etico y Cumplimiento",
    progress: 0,
    duration: "50 min",
    category: "Cumplimiento",
    assignment: "Asignado",
    deadline: "2026-11-30",
    deadlineLabel: "30 nov 2026",
    dueLabel: "Quedan 60 dias",
    thumbnail: "team",
  },
  ...Array.from({ length: 6 }, (_, index) => ({
    id: `completed-${index}`,
    title: `Formacion completada ${index + 1}`,
    progress: 100,
    duration: "1 h",
    category: "Fundamentos",
    thumbnail: "knowledge" as const,
  })),
];

export const academyRecommendations: AcademyRecommendation[] = [
  {
    id: "excel",
    title: "Excel avanzado",
    category: "Herramientas",
    duration: "2 h 30 min",
    reason: "Por tu puesto",
    rating: 4.8,
    thumbnail: "analytics",
  },
  {
    id: "communication",
    title: "Comunicacion efectiva",
    category: "Soft skills",
    duration: "1 h 45 min",
    reason: "Relacionado con tu trabajo",
    rating: 4.6,
    thumbnail: "team",
  },
  {
    id: "ai-intro",
    title: "Introduccion a la IA",
    category: "Inteligencia artificial",
    duration: "3 h",
    reason: "Tendencia en tu area",
    rating: 4.7,
    thumbnail: "ai",
  },
  {
    id: "agile",
    title: "Metodologias Agiles",
    category: "Gestion de proyectos",
    duration: "2 h 15 min",
    reason: "Por tu desarrollo",
    rating: 4.5,
    thumbnail: "agile",
  },
];

export const academyWorkRecommendation = {
  title: "Power BI intermedio",
  description:
    "Recomendado por tu puesto de Analista de Datos y por el conocimiento que consultas habitualmente.",
  duration: "3 h 20 min",
  level: "Intermedio",
  thumbnail: "analytics" as const,
};

export const academyTeamRequests = [
  { id: "python", title: "Python avanzado", votes: 34 },
  { id: "negotiation", title: "Negociacion y persuasion", votes: 21 },
  { id: "remote-teams", title: "Gestion de equipos remotos", votes: 18 },
];

export const academyProgressSummary = {
  global: 68,
  completed: 8,
  inProgress: 3,
  pending: 2,
  skills: 6,
  hours: "14 h",
  badges: 3,
};
