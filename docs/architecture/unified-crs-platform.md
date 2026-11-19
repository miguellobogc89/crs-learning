# CRS · Plataforma unificada

## Estado de partida

- **Una instalación PWA:** `app/layout.tsx` usa `/app/manifest.webmanifest`; `/apps` es el punto de entrada autenticado.
- **Una identidad:** los módulos de este repositorio ya usan `auth.ts` (Auth.js). No crear un segundo login por módulo.
- **Módulos independientes:** conservar las rutas y los servicios existentes. La unificación inicial no implica fusionar bases de datos, lógica de negocio ni APIs.
- **Diseño compartido:** reutilizar `components/platform/mobile-app-header.tsx`, `notification-button.tsx` y `notifications-drawer.tsx`, que ya se usan en Trading y Finance; las pantallas de negocio conservan su layout mientras se adapta gradualmente.
- **Selector de módulos:** `lib/platform/apps.ts` es el catálogo único. `lib/platform/access.ts` centraliza su acceso desde el servidor.

| Módulo | Entrada existente | Estado |
| --- | --- | --- |
| Trading | `/trading/inicio` | Activo; conservar su funcionalidad |
| Finance | `/finanzas/inicio` | Activo; conservar su funcionalidad |
| Negocio / CRS LAB | `/dashboard` | Activo; solo usuarios con acceso de negocio |
| Heladería | Sin ruta | Futuro; no mostrar como aplicación operativa |

## Límites actuales

`access: "all" | "business"` expresa las reglas actuales de acceso, **no** módulos contratados. El acceso de negocio se resuelve con `hasBusinessAccess`. Cuando haya suscripciones por módulo, evolucionar el comprobador de `lib/platform/access.ts` con derechos persistentes por usuario y/o organización, validarlos también en cada API, y ocultar las opciones no autorizadas en el menú. No usar solo controles visuales como barrera de seguridad.

El historial de notificaciones de negocio y los avisos de Trading aún tienen orígenes diferentes. Comparten componentes visuales, pero **todavía no existe** un backend universal de notificaciones push. No declarar push ni suscripciones a dispositivos como activos hasta implementarlos y probarlos.

El manifiesto unificado todavía referencia algunos iconos heredados de Trading: la identidad gráfica definitiva de CRS debe sustituirlos antes de distribuir.

## Orden de integración

1. Consolidar contratos de navegación, cabeceras, selectores y estructura responsive, partiendo de los componentes ya presentes.
2. Definir derechos por módulo; mantener autorizaciones reales en servidor y APIs.
3. Centralizar eventos, bandeja, preferencias y registro de dispositivos para notificaciones, con adaptadores por módulo.
4. Incorporar la Heladería solo cuando su código y sus límites de datos estén revisados.
5. Evaluar empaquetado iOS/Android después de auditar las dependencias de renderizado en servidor de Next.js; no tratar la PWA como una exportación nativa automática.

**Fuera de alcance de esta base:** migraciones de datos, cambios de Prisma/Neon, nueva autenticación, migración de flujos complejos y publicación móvil.
