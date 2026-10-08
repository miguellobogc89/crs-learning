ACADEMY — Integración de siete mecánicas

1. Extrae este ZIP en la raíz del repositorio (junto a package.json).
2. Ejecuta: python academy-integration/install.py
3. Ejecuta: npx tsc --noEmit
4. Reinicia Next.js y regenera una lección.

El instalador modifica estos tres archivos existentes:
- lib/academy/didactic-package.ts
- lib/academy/didactic-generator.ts
- components/academy/learning-room/academy-didactic-room.tsx

Y copia dos archivos nuevos:
- lib/academy/interaction-schema.ts
- components/academy/learning-room/academy-interaction.tsx

Los siete componentes ya instalados no se alteran. Se mantienen las clases antiguas.

Las interacciones existentes marcan la actividad completada incluso si la respuesta es incorrecta: son práctica, no evaluación certificable. La generación sigue requiriendo OPENAI_API_KEY.
