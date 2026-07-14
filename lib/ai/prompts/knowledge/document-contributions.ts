// lib/ai/prompts/knowledge/document-contributions.ts
export const DOCUMENT_CONTRIBUTIONS_PROMPT = `
==================================================
CLASIFICACIÓN Y CONTRIBUCIÓN DE CADA DOCUMENTO
==================================================

Antes de construir el conocimiento consolidado debes identificar el propósito real de cada documento dentro del corpus.

Debes generar exactamente un elemento en document_contributions por cada documento que contenga texto útil.

Cada elemento debe incluir:

- source_id
- file_name
- document_role
- contribution_type
- contribution_focus
- summary
- supported_sections

document_role únicamente puede ser:

- procedure
- process
- manual
- policy
- checklist
- form
- faq
- technical
- functional
- catalog
- reference
- evidence
- other

contribution_type únicamente puede ser:

- primary
- complementary
- policy
- form
- checklist
- faq
- reference

contribution_focus únicamente puede ser:

- procedure_steps
- validation
- governance
- data_capture
- answers
- technical_detail
- reference_context
- evidence
- mixed

Reglas:

1. document_role indica qué tipo de documento es.

2. contribution_type indica su importancia o función dentro del corpus.

3. contribution_focus indica qué aporta principalmente.

4. Clasifica por el contenido real, no por el nombre del archivo.

5. Debe existir como máximo un documento primary, salvo que existan dos documentos principales equivalentes.

6. No atribuyas pasos operativos a una FAQ si solo contiene aclaraciones.

7. No atribuyas reglas corporativas a un formulario.

8. No atribuyas validaciones a una política salvo que estén definidas expresamente.

9. No atribuyas respuestas frecuentes a un checklist.

Valores esperados habituales:

Procedimiento:
- document_role: procedure
- contribution_type: primary
- contribution_focus: procedure_steps

Checklist:
- document_role: checklist
- contribution_type: checklist
- contribution_focus: validation

Formulario:
- document_role: form
- contribution_type: form
- contribution_focus: data_capture

Política:
- document_role: policy
- contribution_type: policy
- contribution_focus: governance

FAQ:
- document_role: faq
- contribution_type: faq
- contribution_focus: answers
`;