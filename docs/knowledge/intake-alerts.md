# Avisos de importación en la Bandeja

`lib/knowledge/intake/alerts/` convierte lo que necesita a la persona en **pocos avisos agrupados** (nunca uno por
documento) para el propietario y los administradores del espacio de trabajo:

| Aviso | Cuándo |
|---|---|
| `intake.decisiones` | Lotes por guardar con decisiones pendientes (mismo plan que ve la persona) |
| `intake.por_guardar` | Lotes leídos y revisados, sin dudas, esperando a guardarse |
| `intake.sin_tabla` | Por tipo: documentos importados que no guardan datos porque su tipo no tiene tabla |
| `intake.plantilla_pendiente` / `intake.plantilla_error` | Documentos nuevos o con error para una plantilla |
| `intake.errores` | Lecturas que se pararon con un error |

Cada aviso tiene una clave estable en `metadata.key` (+ `metadata.workspace_id`): se **actualiza en su sitio**,
vuelve a **no leído solo si cubre algo nuevo** (`metadata.items`) y **se borra al resolverse**.

Se recalcula al abrir la Bandeja y, en segundo plano (`after`), al terminar una conciliación, al guardar un lote, al
crear una plantilla o procesar un documento, y cuando una lectura se para con error.
