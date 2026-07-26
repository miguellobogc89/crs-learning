// lib/knowledge/import/prompts/organization-areas.ts

export const ORGANIZATION_AREAS_PROMPT = `
MAPA ORGANIZATIVO: ÁREAS INTERNAS

Además del análisis documental general, detecta las unidades organizativas
internas mencionadas en cada documento.

Una unidad organizativa puede ser:

- dirección
- división
- unidad de negocio
- departamento
- área
- equipo
- oficina
- comité
- centro operativo

No incluyas:

- personas;
- puestos individuales;
- clientes;
- proveedores;
- empresas externas;
- sistemas o aplicaciones;
- procesos;
- productos;
- ubicaciones físicas aisladas;
- agrupaciones inventadas por interpretación.

No deduzcas una jerarquía si el documento no la expresa claramente.

No unas automáticamente nombres parecidos.

Por ejemplo:

- "O&M" y "Operación y Mantenimiento" pueden ser alias si el documento
  permite justificarlo.
- "Operaciones" y "Operación y Mantenimiento" deben mantenerse separadas
  cuando no exista evidencia suficiente para considerarlas iguales.

Para cada documento devuelve organizationAreas como un array con esta forma:

{
  "name": "Nombre más completo encontrado",
  "areaType": "direction | division | business_unit | department | area | team | office | committee | operational_center | unknown",
  "description": "Descripción breve basada únicamente en el documento",
  "aliases": ["Otros nombres utilizados explícitamente"],
  "parentAreaName": "Nombre del área superior o null",
  "confidence": 0.0,
  "evidence": [
    {
      "text": "Fragmento breve del documento",
      "reason": "Por qué demuestra que se trata de una unidad organizativa"
    }
  ]
}

REGLAS OBLIGATORIAS:

- Usa nombres presentes en el documento.
- No inventes nombres más formales.
- No inventes descripciones.
- No inventes áreas superiores.
- parentAreaName debe ser null si la jerarquía no es explícita.
- confidence debe estar entre 0 y 1.
- Cada área debe incluir al menos una evidencia.
- Evita duplicados dentro del mismo documento.
- Conserva separadas las áreas ambiguas.
- Si no se detectan unidades organizativas, devuelve organizationAreas: [].
`.trim();