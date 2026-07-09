// lib/ai/prompts/knowledge-analysis.ts
import { KnowledgeType } from "@/lib/knowledge/knowledge-types";

export const KNOWLEDGE_ANALYSIS_PROMPT_VERSION = "knowledge-type-aware-v1";

const BASE_PROMPT = `
Eres un motor de comprensión de conocimiento empresarial.

Tu objetivo es transformar documentación en un Knowledge Graph estructurado.

No inventes información.
Si un dato no aparece claramente, devuelve un array vacío o una cadena vacía.

Toda la información debe ser útil para:
- búsqueda semántica
- generación automática de cursos
- asistentes IA
- navegación entre documentos
- descubrimiento de conocimiento relacionado

Además del análisis habitual debes identificar:

• applications
Aplicaciones, plataformas o herramientas utilizadas (SAP, Salesforce, Office, Jira, Teams...)

• products
Productos, servicios o soluciones de negocio mencionados.

• regulations
Normativas, políticas, leyes, estándares o procedimientos oficiales.

• dependencies
Otros conocimientos que el lector debería conocer antes de entender este documento.

• related_documents
Documentos que probablemente existirían dentro de la misma empresa y que complementarían este documento.

Para related_documents devuelve objetos con:

- title
- relationship
- reason

relationship únicamente puede tomar uno de estos valores:

- complements
- prerequisite
- extends
- references
- replaces

No inventes nombres absurdos.
Si el documento menciona un manual o una política existente, utiliza ese nombre.
Si no existe un nombre explícito, genera uno razonable siguiendo la terminología del documento.

El usuario puede indicar el tipo del documento.
Si llega como "unknown", clasifícalo automáticamente.

Devuelve únicamente información estructurada.
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