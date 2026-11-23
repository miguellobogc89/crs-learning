// URLs de los tres módulos. En localhost y previews se mantienen las rutas locales.
export const PRIMARY_DOMAIN = "crussader.com";

export type AppModule = "business" | "finance" | "trading";

const moduleHosts: Record<AppModule, string> = {
  business: "business.crussader.com",
  finance: "finance.crussader.com",
  trading: "trading.crussader.com",
};

const businessRoots = [
  "achievements", "admin", "analytics", "assistant", "connectors",
  "courses", "dashboard", "engine", "knowledge", "my-space",
  "notifications", "search", "settings", "tenders", "users", "whatsapp",
];

export function normalizedHostname(host: string | null | undefined): string {
  return (host ?? "").toLowerCase().trim().split(":")[0];
}

export function isCrussaderHost(host: string | null | undefined): boolean {
  const hostname = normalizedHostname(host);
  return hostname === PRIMARY_DOMAIN ||
    hostname === `www.${PRIMARY_DOMAIN}` ||
    Object.values(moduleHosts).includes(hostname);
}

export function moduleOfPath(path: string): AppModule | null {
  const pathname = path.split("?")[0];
  const root = pathname.split("/")[1];
  if (root === "finanzas" || root === "mis-finanzas") return "finance";
  if (root === "trading") return "trading";
  if (businessRoots.includes(root)) return "business";
  return null;
}

export function moduleHref(path: string, host: string | null | undefined): string {
  const module = moduleOfPath(path);
  if (!module || !isCrussaderHost(host)) return path;
  const targetHost = moduleHosts[module];
  if (normalizedHostname(host) === targetHost) return path;
  return `https://${targetHost}${path}`;
}

export function moduleHomeForHost(host: string | null | undefined): string | null {
  switch (normalizedHostname(host)) {
    case moduleHosts.business: return "/dashboard";
    case moduleHosts.finance: return "/finanzas/inicio";
    case moduleHosts.trading: return "/trading/inicio";
    default: return null;
  }
}
