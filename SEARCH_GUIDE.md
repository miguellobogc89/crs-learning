# 🔍 Guía del Buscador Global

## Resumen Ejecutivo

El buscador global es un sistema **completamente centralizado** para búsqueda y navegación en toda la aplicación. Toda la lógica está en **un único servicio** (`GlobalSearchService`) que es fácil de conectar con el backend.

## Arquitectura

### 3 Componentes Principales

```
GlobalSearchService (lib/services/global-search.service.ts)
         ↓
      useGlobalSearch Hook
         ↓
  GlobalSearch Component (UI)
```

## 1️⃣ Servicio de Búsqueda
**`lib/services/global-search.service.ts`**

Punto único para toda la lógica de búsqueda:

```typescript
// Búsqueda principal
await GlobalSearchService.search({ 
  query: "react",
  filters: ["articulos", "documentos"]
});

// Datos auxiliares
GlobalSearchService.getRecentSearches();
GlobalSearchService.getQuickAccess();
```

**Características:**
- ✅ Caché de resultados
- ✅ Simulación de latencia (300ms)
- ✅ Agrupación automática por categoría
- ✅ Mock completo de 18+ resultados

## 2️⃣ Hook de Estado
**`lib/hooks/use-global-search.ts`**

Gestiona todo el estado del cliente:

```typescript
const {
  query,              // Texto actual
  isLoading,          // Estado de carga
  results,            // Resultados agrupados
  selectedIndex,      // Índice para navegación
  setQuery,           // Setter
  selectNext,         // Navegación ↓
  selectPrevious,     // Navegación ↑
  getSelectedResult   // Obtener seleccionado
} = useGlobalSearch();
```

## 3️⃣ Componente UI
**`components/search/global-search.tsx`**

- Buscador **central** en el header
- Popover tipo Salesforce (no modal)
- Ctrl+K para abrir
- Navegación por teclado

## Categorías Disponibles

| Ícono | Categoría | Ejemplos |
|-------|-----------|----------|
| 👥 | Usuarios | Juan Pérez, María García |
| 💡 | Artículos | Guía React, Tutorial Next.js |
| 📄 | Documentos | API Docs, Guía Instalación |
| 📚 | Bibliotecas | Components, Utilities |
| 📁 | Carpetas | Proyectos 2024 |
| 🏢 | Equipos | Dev Team, Design Team |

## Conectar al Backend

### Paso 1: Crear Endpoint

```typescript
// app/api/search/route.ts
export async function POST(request: Request) {
  const { query, filters } = await request.json();
  
  // Tu lógica de búsqueda aquí
  const results = await db.search(query, filters);
  
  return Response.json({
    groups: results,
    total: results.length,
    executionTime: 45
  });
}
```

### Paso 2: Actualizar el Servicio

```typescript
// lib/services/global-search.service.ts
static async search(options: SearchOptions): Promise<SearchResponse> {
  const response = await fetch('/api/search', {
    method: 'POST',
    body: JSON.stringify(options)
  });
  return response.json();
}
```

**¡Listo!** El buscador automáticamente usará tu API real.

## Agregar Nuevas Categorías

1. Actualizar tipo en `types/search.ts`:
```typescript
export type SearchCategory = "usuarios" | "nuevaCategoria";
```

2. Añadir datos mock en `GlobalSearchService`:
```typescript
{
  id: "new-1",
  title: "Ejemplo",
  category: "nuevaCategoria",
  description: "...",
}
```

3. Configurar icono y color en `search-result-item.tsx`:
```typescript
const CATEGORY_ICONS: Record<SearchCategory, LucideIcon> = {
  nuevaCategoria: IconComponent,
};
```

## Permisos Futuros

El sistema está preparado para filtrar por permisos del usuario:

```typescript
// Futuro: Pasar userId para filtrado automático
const results = await GlobalSearchService.search({ 
  query,
  userId: session.user.id  // Nuevo
});
```

## Debugging

### Ver tiempos de búsqueda
```
"en 45ms" mostrado en el footer del popover
```

### Caché activo
Los mismos términos se sirven desde caché (no hay latencia simulada)

### Navegación por teclado
- Ctrl+K: Abrir/cerrar
- ↑↓: Navegar resultados
- Enter: Seleccionar
- Esc: Cerrar

## Archivos Clave

| Archivo | Propósito |
|---------|-----------|
| `lib/services/global-search.service.ts` | 🔧 Lógica centralizada |
| `lib/hooks/use-global-search.ts` | 🎣 Hook de estado |
| `components/search/global-search.tsx` | 🎨 UI principal |
| `components/search/search-result-item.tsx` | 📦 Item de resultado |
| `app/(app)/search/page.tsx` | 📄 Página de búsqueda |
| `types/search.ts` | 📋 Tipos compartidos |

## FAQ

**P: ¿Cómo agrego más búsquedas recientes?**
A: Edita `MOCK_RECENT_SEARCHES` en `global-search.service.ts`

**P: ¿Cómo personalizo los accesos rápidos?**
A: Edita `MOCK_QUICK_ACCESS` en `global-search.service.ts`

**P: ¿Puedo cambiar el atajo de teclado?**
A: Modifica el listener en `global-search.tsx` en `handleKeyDown`

**P: ¿Cómo guardo el historial de búsquedas?**
A: Implementa `addToHistory()` en el servicio para guardar en BD

## Próximos Pasos

- [ ] Conectar endpoint real de búsqueda
- [ ] Implementar filtrado por permisos
- [ ] Guardar historial en BD
- [ ] Agregar búsqueda avanzada (@usuarios, etc)
- [ ] Analytics de búsquedas populares
- [ ] Sugerencias inteligentes (AI)
