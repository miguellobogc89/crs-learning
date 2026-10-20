# ADR: incertidumbre y aclaraciones durante la ingesta

Estado: decisión de diseño para fases futuras (2026-10-20). No implica implementación actual.

## Principio
CRS descubre automáticamente la arquitectura y los datos empresariales sin exigir preguntas al usuario en el flujo normal. La ambigüedad es un estado gestionable, no un error que se deba ocultar ni una excusa para inventar datos.

## Política de decisión
1. Evidencia y validación suficientes: proponer o procesar automáticamente según los permisos y el estado de revisión aplicable.
2. Conflicto o ambigüedad no bloqueante: conservar las alternativas, documentos y citas de origen, y registrar una cuestión pendiente; continuar con las partes independientes.
3. Ambigüedad bloqueante: no elegir arbitrariamente ni publicar el dato afectado. Solicitar aclaración cuando resulte imprescindible.

## Futuro flujo conversacional
- Durante la ingesta, detectar y guardar preguntas aclaratorias con contexto, evidencia, alternativas y alcance.
- Notificar conflictos relevantes sin generar ruido ni interrumpir innecesariamente.
- Permitir que el asistente explique cada duda y solicite la decisión del usuario en el chat, incluso proactivamente cuando sea apropiado.
- Permitir correcciones posteriores iniciadas por el usuario desde el chat.
- Registrar quién resolvió el conflicto, cuándo, qué evidencia motivó la decisión y qué registros o cálculos se ven afectados.
- No confundir una elección del usuario con un hecho demostrado por los documentos.

## Caso de referencia
Heladería Nieve Azul: dos documentos con etiqueta "Tarifa octubre 2026" muestran Vainilla a 2,50 EUR y 2,80 EUR. No seleccionar un precio vigente sin evidencia adicional; conservar ambas versiones y crear una cuestión resoluble.

## Diseño incremental
Primero consolidación de entidades, campos y relaciones; distinguir equivalencias, diferencias semánticas y conflictos. Diseñar salidas estructuradas para dudas pendientes y su evidencia. Persistencia de preguntas, notificaciones y resolución conversacional quedan para fases posteriores. No bloquear el trabajo de descubrimiento actual.
