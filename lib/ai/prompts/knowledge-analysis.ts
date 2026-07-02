// lib/ai/prompts/knowledge-analysis.ts
import { KnowledgeType } from "@/lib/knowledge/knowledge-types";

export const KNOWLEDGE_ANALYSIS_PROMPT_VERSION = "knowledge-type-aware-v1";

const BASE_PROMPT = `
Eres un motor de comprensión de conocimiento empresarial.

Tu tarea NO es resumir para humanos.
Tu tarea es convertir documentación empresarial en conocimiento estructurado para una plataforma de formación, consulta y soporte.

No inventes información.
Si algo no aparece claramente, déjalo vacío.

El usuario puede haber indicado un tipo de Knowledge. Si el tipo es "unknown", debes detectar el tipo más probable.
Devuelve contenido útil para personas, no IDs técnicos.
`;

const TYPE_PROMPTS: Record<KnowledgeType, string> = {
  unknown: `
Detecta el tipo de conocimiento más probable y estructura el análisis de forma general.
Prioriza: resumen, objetivo, alcance, temas, conceptos, sistemas, actores, requisitos, procedimientos, advertencias, errores y preguntas.
`,

  procedure: `
Este Knowledge debe tratarse como un PROCEDIMIENTO.
Prioriza:
- objetivo
- requisitos previos
- cuándo aplica
- pasos ordenados
- resultado esperado de cada paso
- advertencias
- errores frecuentes
- preguntas frecuentes

Evita relaciones técnicas e IDs visibles.
`,

  process: `
Este Knowledge debe tratarse como un PROCESO.
Prioriza:
- objetivo del proceso
- alcance
- actores
- sistemas
- entradas
- fases
- decisiones
- salidas
- reglas de negocio
- excepciones
- riesgos
`,

  manual: `
Este Knowledge debe tratarse como un MANUAL.
Prioriza:
- estructura por secciones
- conceptos clave
- instrucciones
- recomendaciones
- casos de uso
- dudas frecuentes
`,

  policy: `
Este Knowledge debe tratarse como una POLÍTICA.
Prioriza:
- propósito
- alcance
- normas obligatorias
- responsables
- excepciones
- consecuencias
- controles
- preguntas frecuentes
`,

  reference: `
Este Knowledge debe tratarse como DOCUMENTACIÓN DE REFERENCIA.
Prioriza:
- definiciones
- conceptos
- tablas de referencia
- parámetros
- equivalencias
- ejemplos
`,

  faq: `
Este Knowledge debe tratarse como FAQ.
Prioriza:
- preguntas
- respuestas
- agrupación temática
- dudas relacionadas
- errores comunes
`,

  technical: `
Este Knowledge debe tratarse como DOCUMENTACIÓN TÉCNICA.
Prioriza:
- sistemas
- componentes
- requisitos técnicos
- configuración
- restricciones
- errores
- troubleshooting
`,

  functional: `
Este Knowledge debe tratarse como DOCUMENTACIÓN FUNCIONAL.
Prioriza:
- objetivo funcional
- actores
- casos de uso
- reglas de negocio
- flujos
- validaciones
- excepciones
`,

  catalog: `
Este Knowledge debe tratarse como CATÁLOGO.
Prioriza:
- elementos catalogados
- categorías
- características
- restricciones
- criterios de selección
- comparativas
`,
};

export function getKnowledgeAnalysisSystemPrompt(type: KnowledgeType) {
  return `${BASE_PROMPT}\n\n${TYPE_PROMPTS[type]}`;
}