/**
 * FLUJO DE BÚSQUEDA - DIAGRAMA VISUAL
 * 
 * Este archivo muestra exactamente qué ocurre cuando el usuario busca
 */

// ============================================================================
// PASO 1: USUARIO ABRE EL BUSCADOR
// ============================================================================

/*
CLIENTE (React)
┌─────────────────────────────────────┐
│  <GlobalSearch />  (Popover)        │
│  useGlobalSearch() hook             │
│                                     │
│  [__search_term__]  ← Usuario tipea │
│                                     │
│  300ms debounce                     │
│  ↓                                  │
│  search("react")                    │
└─────────────────────────────────────┘
*/

// ============================================================================
// PASO 2: SE EJECUTA EL SERVER ACTION
// ============================================================================

/*
CLIENTE → SERVIDOR (Network request)
   │
   └─ await searchGlobal({ query: "react", filters: undefined })
      │
      └─ POST /app/actions/search
*/

// ============================================================================
// PASO 3: SERVIDOR OBTIENE LA SESIÓN
// ============================================================================

/*
SERVIDOR (Node.js)
┌─────────────────────────────────────────┐
│  app/actions/search.ts                  │
│  export async function searchGlobal()   │
│                                         │
│  const session = await auth()           │
│                                         │
│  if (!session?.user?.id) {              │
│    return { groups: [], ... }  ← Sin auth
│  }                                      │
│                                         │
│  userId = session.user.id    ← SERVIDOR │
│  (NO viene del cliente)                 │
│                                         │
│  Contexto de búsqueda:                  │
│  {                                      │
│    query: "react",                      │
│    userId: "user-abc123",  ← SEGURO    │
│    limit: 50                            │
│  }                                      │
│                                         │
│  initializeSearchAdapters()             │
│  Registra 6 adaptadores                 │
└─────────────────────────────────────────┘
*/

// ============================================================================
// PASO 4: ORQUESTADOR COORDINA BÚSQUEDAS EN PARALELO
// ============================================================================

/*
SearchOrchestrator.search(context)
│
├─ Obtiene todos los adaptadores registrados
│  [users, courses, sources, libraries, spaces, teams]
│
└─ Ejecuta búsquedas EN PARALELO usando Promise.all()
   │
   ├─────────────┬────────────┬──────────┬──────────┬────────┬──────┐
   │             │            │          │          │        │      │
   ▼             ▼            ▼          ▼          ▼        ▼      ▼
   
   [Adapter:Users] [Adapter:Courses] [Adapter:Sources] [Adapter:Libs] ...
   │               │                 │                  │
   └─ await        └─ await          └─ await          └─ await
      prisma          prisma             prisma           prisma
      .users          .courses           .knowledge_      .knowledge_
      .findMany       .findMany          sources          libraries
      (...)           (...)              .findMany()      .findMany()
      │               │                  │                │
      │ (PERMISOS)    │ (PERMISOS)       │ (PERMISOS)    │ (PERMISOS)
      │ - name:       │ - is_published   │ - visibility  │ - visibility
      │   contains    │   = true         │   = "public"  │   = "restricted"
      │   "react"     │ - title/desc     │ - title/desc  │ - name
      │              │   contains       │   contains    │   contains
      │              │   "react"        │   "react"     │   "react"
      │              │                  │                │
      └──────────────┴──────────────────┴────────────────┴────────...
         │              │                 │                 │
         ▼              ▼                 ▼                 ▼
         
      [{ id, title, category, url }]
      [{ id, title, category, url }]
      [{ id, title, category, url }]
      [{ id, title, category, url }]
*/

// ============================================================================
// PASO 5: AGRUPA RESULTADOS
// ============================================================================

/*
Resultados de todos los adaptadores:

SearchResult[] = [
  { id: "user-1", title: "React Dev", category: "usuarios", ... },
  { id: "react-course", title: "React Course", category: "articulos", ... },
  { id: "doc-1", title: "React Docs", category: "documentos", ... },
  { id: "team-1", title: "React Team", category: "equipos", ... },
]

   │
   ▼
   
Agrupa por categoría:

SearchGroup[] = [
  {
    category: "usuarios",
    label: "👥 Usuarios",
    results: [
      { id: "user-1", title: "React Dev", ... }
    ]
  },
  {
    category: "articulos",
    label: "💡 Artículos",
    results: [
      { id: "react-course", title: "React Course", ... }
    ]
  },
  {
    category: "documentos",
    label: "📄 Documentos",
    results: [
      { id: "doc-1", title: "React Docs", ... }
    ]
  },
  {
    category: "equipos",
    label: "🏢 Equipos",
    results: [
      { id: "team-1", title: "React Team", ... }
    ]
  }
]
*/

// ============================================================================
// PASO 6: RETORNA AL CLIENTE
// ============================================================================

/*
SERVIDOR → CLIENTE (Network response)
   │
   └─ SearchResponse {
        groups: SearchGroup[],
        total: 4,
        query: "react",
        executionTime: 142  ← milisegundos
      }
*/

// ============================================================================
// PASO 7: CLIENTE RENDERIZA
// ============================================================================

/*
CLIENTE (React)
┌──────────────────────────────────────────────┐
│  <GlobalSearch />                            │
│                                              │
│  Búsqueda: "react"                           │
│  Tiempo: 142ms                               │
│                                              │
│  👥 Usuarios (1)                             │
│  ├─ 👤 React Dev                             │
│                                              │
│  💡 Artículos (1)                            │
│  ├─ 📚 React Course                          │
│                                              │
│  📄 Documentos (1)                           │
│  ├─ 📃 React Docs                            │
│                                              │
│  🏢 Equipos (1)                              │
│  ├─ 👥 React Team                            │
│                                              │
│  Navega con ↑↓ Enter Esc                     │
└──────────────────────────────────────────────┘
*/

// ============================================================================
// PASO 8: USUARIO HACE CLIC O PRESIONA ENTER
// ============================================================================

/*
const result = getSelectedResult();
window.location.href = result.url;  ← /users/user-1

URL real de la BD, ID real, Permiso ya validado en servidor ✅
*/

// ============================================================================
// CLAVE DE SEGURIDAD: PERMISOS EN SERVIDOR
// ============================================================================

/*
¿QUÉ PASA SI UN USUARIO INTENTA "TRUCAR"?

Cliente intenta:
  await searchGlobal({ 
    query: "admin-docs",
    userId: "admin-user-id"  ← ¡INTENTA SPOOFEAR!
  })

Servidor ignora:
  const session = await auth();  ← Obtiene userId REAL del servidor
  const userId = session.user.id;  ← userId REAL, no el del cliente
  
  // El userId del cliente es IGNORADO ❌
  // El userId viene de la sesión ✅

Resultado:
  ✅ Solo ve documentos a los que REALMENTE tiene acceso
  ✅ No puede acceder a documentos de otros usuarios
  ✅ Los permisos siempre se validan en el servidor
*/

// ============================================================================
// RESUMEN: FLUJO COMPLETO EN 3 PUNTOS
// ============================================================================

/*
┌─────────────────────────────────────────────────────────────────┐
│  CLIENTE TIPEA "REACT"                                          │
└─────────────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────────┐
│  SERVIDOR:                                                      │
│  1. await auth() → obtiene userId                               │
│  2. Ejecuta 6 adaptadores EN PARALELO                           │
│  3. Cada adaptador valida permisos en BD                        │
│  4. Agrupa resultados por categoría                             │
│  5. Retorna SearchResponse                                      │
└─────────────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────────┐
│  CLIENTE RENDERIZA                                              │
│  - Solo resultados seguros (ya filtrados)                       │
│  - URLs reales                                                  │
│  - IDs reales                                                   │
│  - Navegación funcional                                         │
└─────────────────────────────────────────────────────────────────┘

PRINCIPIO CLAVE:
"El cliente NUNCA controla la seguridad"
"Toda validación ocurre en el servidor"
"El userId viene del servidor, no del cliente"
*/
