/** Catálogo único de módulos de CRS. Sus rutas y permisos se definen aquí. */
export type AppId = "trading" | "finanzas" | "negocio" | "heladeria";
export type AppDefinition = {
  id: AppId;
  title: string;
  description: string;
  href: string | null;
  platformHref: string;
  access: "all" | "business";
};

export const APP_MODULES: readonly AppDefinition[] = [
  {
    id: "trading",
    title: "Trading",
    description: "Inversiones, cartera, mercados y agentes.",
    href: "/trading/inicio",
    platformHref: "/apps/trading",
    access: "all",
  },
  {
    id: "finanzas",
    title: "Finances",
    description: "Cuentas, movimientos, gastos y ahorro.",
    href: "/finanzas/inicio",
    platformHref: "/apps/finanzas",
    access: "all",
  },
  {
    id: "negocio",
    title: "CRS",
    description: "Conocimiento y herramientas para empresas.",
    href: "/dashboard",
    platformHref: "/apps/negocio",
    access: "business",
  },
  {
    id: "heladeria",
    title: "Heladería",
    description: "Producción, costes y gestión del negocio.",
    href: null, // La aplicación real todavía no dispone de una ruta publicada.
    platformHref: "/apps/heladeria",
    access: "business",
  },
];
