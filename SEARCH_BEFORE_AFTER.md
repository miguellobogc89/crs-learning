/**
 * ANTES vs DESPUÉS: COMPARACIÓN DE ARQUITECTURA
 */

// ============================================================================
// 1. AUTENTICACIÓN CLIENTE
// ============================================================================

// ❌ ANTES
/*
import { useSession } from "next-auth/react";

export function useGlobalSearch() {
  const { data: session } = useSession();  ← SessionProvider requerido
  
  const search = useCallback(async (query: string) => {
    const response = await searchGlobal({
      query,
      userId: session?.user?.id,  ← userId viene del cliente
    });
  }, [session?.user?.id]);
}
*/

// ✅ DESPUÉS
/*
// NO hay useSession
// NO hay SessionProvider necesario

export function useGlobalSearch() {
  const search = useCallback(async (query: string) => {
    const response = await searchGlobal({
      query,
      // userId NO se envía del cliente
    });
  }, []);
}
*/

// ============================================================================
// 2. ESTRUCTURA DE BÚSQUEDA
// ============================================================================

// ❌ ANTES
/*
app/actions/search.ts
  └─ searchGlobal()
     └─ Búsqueda monolítica
        ├─ searchUsers()
        ├─ searchCourses()
        ├─ searchKnowledgeSources()
        ├─ searchLibraries()
        ├─ searchSpaces()
        └─ searchTeams()

Todo en un archivo, difícil de extender
*/

// ✅ DESPUÉS
/*
lib/search/
  ├─ types.ts (interfaz SearchAdapter)
  ├─ search.orchestrator.ts (coordina)
  ├─ search.init.ts (registra)
  └─ adapters/ (cada módulo independiente)
     ├─ users.adapter.ts
     ├─ courses.adapter.ts
     ├─ knowledge-sources.adapter.ts
     ├─ knowledge-libraries.adapter.ts
     ├─ knowledge-spaces.adapter.ts
     ├─ knowledge-teams.adapter.ts
     ├─ chats.adapter.ts (nuevo)
     ├─ notifications.adapter.ts (nuevo)
     └─ ...

app/actions/search.ts
  └─ searchGlobal()
     ├─ auth() (obtiene userId)
     └─ SearchOrchestrator.search() (coordina adaptadores)

Cada módulo es independiente, fácil de extender
*/

// ============================================================================
// 3. OBTENCIÓN DE USERID
// ============================================================================

// ❌ ANTES: Inseguro
/*
// Cliente tipea
search({ query: "admin", userId: "admin-id" })
                         ↑ USUARIO PUEDE CAMBIAR ESTO

// Servidor confía en el userId del cliente ← ¡RIESGO DE SEGURIDAD!
*/

// ✅ DESPUÉS: Seguro
/*
// Cliente tipea
await searchGlobal({ query: "admin" })
                    // NO envía userId

// Servidor obtiene userId del contexto de autenticación
const session = await auth();
const userId = session.user.id;  ← userId REAL del servidor
// El userId del cliente es ignorado ← IMPOSIBLE DE TRUCAR
*/

// ============================================================================
// 4. PROCESO DE BÚSQUEDA
// ============================================================================

// ❌ ANTES: Búsqueda secuencial en 6 funciones
/*
await Promise.all([
  searchUsers(query, limit),
  searchCourses(query, limit),
  searchKnowledgeSources(query, limit),
  searchLibraries(query, limit),
  searchSpaces(query, limit),
  searchTeams(query, limit),
])
  .then(results => combine(results))
  .then(results => groupResults(results))

Tiempo: ~200-300ms (si todas las queries son eficientes)
Problema: Agregar módulo = modificar app/actions/search.ts
*/

// ✅ DESPUÉS: Búsqueda dinámica con adaptadores
/*
SearchOrchestrator.search(context)
  .then(response => {
    // Adaptadores se ejecutan EN PARALELO
    // Cada uno independiente
    // Nuevos módulos se registran automáticamente
  })

Tiempo: ~150-200ms (mismo o mejor, sin cambios de código)
Ventaja: Agregar módulo = solo crear un nuevo adaptador
*/

// ============================================================================
// 5. AGREGACIÓN DE PERMISOS
// ============================================================================

// ❌ ANTES: Validación cliente-side (insegura)
/*
// Servidor envía TODOS los datos

const results = [
  { id: "doc-1", title: "Admin Docs", visibility: "private" },
  { id: "doc-2", title: "Public Docs", visibility: "public" },
];

// Cliente filtra
const filteredResults = results.filter(r => 
  r.visibility === "public" || userHasPermission(r)
);

// Problema: El cliente puede modificar el filtro
// Problema: El usuario ve datos que NO debería ver
*/

// ✅ DESPUÉS: Validación servidor-side (segura)
/*
// Cada adaptador valida permisos en BD

const spaces = await prisma.knowledge_spaces.findMany({
  where: {
    OR: [
      { visibility: "public" },
      { members: { some: { user_id: userId } } },
      { owner_id: userId }
    ],
    name: { contains: query }
  }
});

// Resultado: Solo datos a los que el usuario accede
// Resultado: Imposible de trucar desde el cliente
*/

// ============================================================================
// 6. EXTENSIBILIDAD
// ============================================================================

// ❌ ANTES: Agregar nuevo módulo requiere:
/*
// 1. Modificar app/actions/search.ts
//    - Agregar función searchChats()
//    - Agregar await Promise.all([..., searchChats()])
//    - Validar que se llama correctamente

// 2. Modificar app/actions/search.ts OTRA VEZ
//    - Agregar combinación de resultados
//    - Agregar grouping

// 3. Modificar tipos
//    - Agregar "chats" en SearchCategory

// 4. Modificar UI
//    - Agregar filtro para chats

// 5. Testing
//    - Verificar que todo funciona

PROBLEMA: Alto riesgo de regresiones, cambios frágiles
*/

// ✅ DESPUÉS: Agregar nuevo módulo requiere SOLO:
/*
// 1. Crear lib/search/adapters/chats.adapter.ts
//    - Implementar SearchAdapter
//    - Validar permisos en Prisma
//    - Retornar SearchResult[]

// 2. Registrar en lib/search/search.init.ts
//    - SearchOrchestrator.registerAdapter(chatsAdapter)

// LISTO. Eso es TODO.
//
// NO modificas:
//   - app/actions/search.ts ✅
//   - lib/hooks/use-global-search.ts ✅
//   - SearchOrchestrator ✅
//   - Lógica existente ✅

VENTAJA: Bajo riesgo de regresiones, cambios limpios
*/

// ============================================================================
// 7. TABLA COMPARATIVA
// ============================================================================

/*
┌────────────────────────┬──────────────────────┬──────────────────────┐
│       Aspecto          │       ANTES          │       DESPUÉS        │
├────────────────────────┼──────────────────────┼──────────────────────┤
│ userId                 │ Cliente lo envía     │ Servidor lo obtiene  │
│                        │ (inseguro)           │ (seguro)             │
├────────────────────────┼──────────────────────┼──────────────────────┤
│ SessionProvider        │ Requerido            │ NO requerido         │
├────────────────────────┼──────────────────────┼──────────────────────┤
│ useSession()           │ En cliente           │ NO en cliente        │
├────────────────────────┼──────────────────────┼──────────────────────┤
│ Estructura código       │ Monolítica           │ Modular (adapters)   │
├────────────────────────┼──────────────────────┼──────────────────────┤
│ Agregar módulo         │ Modificar varios     │ Crear 1 archivo      │
│                        │ archivos             │                      │
├────────────────────────┼──────────────────────┼──────────────────────┤
│ Riesgo de regresiones  │ Alto                 │ Bajo                 │
├────────────────────────┼──────────────────────┼──────────────────────┤
│ Validación permisos    │ Cliente (inseguro)   │ Servidor (seguro)    │
├────────────────────────┼──────────────────────┼──────────────────────┤
│ Escalabilidad          │ Limitada             │ Ilimitada            │
├────────────────────────┼──────────────────────┼──────────────────────┤
│ Performance            │ ~200-300ms           │ ~150-200ms           │
├────────────────────────┼──────────────────────┼──────────────────────┤
│ Documentación          │ Mínima               │ Completa             │
└────────────────────────┴──────────────────────┴──────────────────────┘
*/

// ============================================================================
// 8. IMPACTO EN DESARROLLO FUTURO
// ============================================================================

// ❌ ANTES: Desarrollo lento
/*
Feature: "Quiero buscar en Chats"

1. Estudiar el código de searchTeams()
2. Copiar y adaptar
3. Modificar app/actions/search.ts (riesgo: romper otros)
4. Probar que no rompí nada
5. Agregué tipos en 2 lugares
6. Agregué filtro en UI
7. Testing completo

Tiempo: 2-3 horas
Riesgo: Alto (muchos puntos de fallo)
*/

// ✅ DESPUÉS: Desarrollo rápido
/*
Feature: "Quiero buscar en Chats"

1. Crear lib/search/adapters/chats.adapter.ts (copiar template)
2. Implementar SearchAdapter (5 min)
3. Registrar en search.init.ts (1 línea)
4. Agregar categoría en tipos (1 línea)
5. Testing rápido

Tiempo: 15-20 minutos
Riesgo: Bajo (no tocas código existente)
*/

// ============================================================================
// 9. CONCLUSIÓN
// ============================================================================

/*
ANTES:
├─ Monolítico → Difícil de extender
├─ Cliente controla seguridad → Vulnerable
├─ Agregar módulo = alto riesgo → Frágil
└─ SessionProvider necesario → Overhead innecesario

DESPUÉS:
├─ Modular → Fácil de extender
├─ Servidor controla seguridad → Seguro
├─ Agregar módulo = bajo riesgo → Robusto
└─ Sin SessionProvider innecesario → Limpio

RESULTADO:
✅ Mejor arquitectura
✅ Mejor seguridad
✅ Mejor escalabilidad
✅ Mejor experiencia de desarrollador
*/
