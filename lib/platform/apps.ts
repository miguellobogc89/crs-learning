/** Catálogo único de módulos de CRS. Sus rutas y permisos se definen aquí. */
export type AppId = "trading" | "finanzas" | "negocio" | "heladeria";
export type AppDefinition = {
  id: AppId;
  title: string;
  description: string;
  href: string | null;
  access: "all" | "business";
};

export const APP_MODULES: readonly AppDefinition[] = [
  {
    id: "trading",
    title: "Trading",
    description: "Inversiones, cartera, mercados y agentes.",
    href: "/trading/inicio",
    access: "all",
  },
  {
    id: "finanzas",
    title: "Finances",
    description: "Cuentas, movimientos, gastos y ahorro.",
    href: "/finanzas/inicio",
    access: "all",
  },
  {
    id: "negocio",
    title: "CRS LAB",
    description: "Conocimiento y herramientas para empresas.",
    href: "/dashboard",
    access: "business",
  },
  {
    id: "heladeria",
    title: "Heladería",
    description: "Producción, costes y gestión del negocio.",
    href: null, // No existe todavía una ruta publicada en este repositorio.
    access: "business",
  },
];
