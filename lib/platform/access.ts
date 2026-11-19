import "server-only";

import { hasBusinessAccess } from "@/lib/auth/business-access";
import { APP_MODULES, type AppDefinition, type AppId } from "@/lib/platform/apps";

/**
 * Punto de entrada común para comprobar acceso a módulos.
 *
 * Por ahora respeta el acceso existente ("all" / "business").
 * No representa todavía una suscripción de pago: los derechos
 * contratados deberán incorporarse aquí y validarse también en las API.
 */
export async function getAccessibleAppModules(userId: string): Promise<AppDefinition[]> {
  const canUseBusiness = await hasBusinessAccess(userId);
  return APP_MODULES.filter((app) => app.access === "all" || canUseBusiness);
}

export async function canAccessAppModule(userId: string, appId: AppId): Promise<boolean> {
  const module = APP_MODULES.find((app) => app.id === appId);
  if (!module) return false;
  if (module.access === "all") return true;
  return hasBusinessAccess(userId);
}
