// Datos de demostración: no representan el aprendizaje real del usuario.
export const academyLearning = [
  { id: "security", title: "Seguridad de la información", progress: 40, duration: "45 min", category: "Cumplimiento", assignment: "Obligatorio", deadline: "2026-10-15", deadlineLabel: "15 oct 2026" },
  { id: "onboarding", title: "Procesos y cultura de CRS LAB", progress: 0, duration: "30 min", category: "Onboarding", assignment: "Asignado", deadline: "2026-10-22", deadlineLabel: "22 oct 2026" },
  { id: "power-query", title: "Power Query para analistas", progress: 65, duration: "2 h", category: "Análisis de datos" },
  { id: "ai", title: "IA generativa en tu día a día", progress: 25, duration: "1 h 20 min", category: "Inteligencia artificial" },
  { id: "communication", title: "Comunicación de equipo", progress: 0, duration: "50 min", category: "Colaboración" },
  ...Array.from({ length: 8 }, (_, index) => ({
    id: `completed-${index}`, title: `Formación completada ${index + 1}`,
    progress: 100, duration: "1 h", category: "Fundamentos",
  })),
];

export const academyRecommendations = [
  { id: "storytelling", title: "Cuenta historias con tus datos", category: "Análisis de datos", duration: "1 h 30 min", reason: "Por tu puesto de analista" },
  { id: "prompts", title: "Prompts para trabajar mejor", category: "Inteligencia artificial", duration: "50 min", reason: "Para desarrollar tus skills de IA" },
  { id: "knowledge", title: "Organiza el conocimiento de tu equipo", category: "Gestión del conocimiento", duration: "45 min", reason: "Relacionado con tus documentos consultados" },
  { id: "automation", title: "Automatiza tareas con Power Automate", category: "Productividad", duration: "2 h", reason: "Porque estás aprendiendo Power Query" },
];
