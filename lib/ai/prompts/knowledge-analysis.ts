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
Primero clasifica el documento en UNO de estos tipos:

- procedure
- process
- manual
- policy
- reference
- faq
- technical
- functional
- catalog

NO devuelvas "unknown" salvo que el documento sea demasiado corto, ilegible o no tenga suficiente información para clasificarlo.

Reglas de clasificación:

- procedure → instrucciones paso a paso para ejecutar una tarea.
- process → flujo de negocio con actores, decisiones y fases.
- manual → guía de uso o aprendizaje de una herramienta o producto.
- policy → normas, obligaciones, cumplimiento o gobierno.
- reference → documentación de consulta, estudios, whitepapers, documentación conceptual o material de apoyo.
- faq → preguntas y respuestas.
- technical → arquitectura, APIs, infraestructura, instalación o configuración técnica.
- functional → requisitos funcionales, casos de uso, análisis funcional o especificaciones.
- catalog → listados de productos, servicios o elementos comparables.

Si existen dudas entre varios tipos, elige SIEMPRE el más útil para un empleado que vaya a aprender ese documento.

Nunca respondas "unknown" por falta de confianza.

Después genera el resto del análisis.

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