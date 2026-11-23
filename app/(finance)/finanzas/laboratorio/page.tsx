import type { Metadata } from "next";
import { FinanceWorkspace } from "@/components/finance/workspace";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Laboratorio · CRS Finance" };

/** Laboratorio: pantallas de prueba (sin menú). Carpeta propia para no pasar por la ruta genérica de secciones. */
export default function Page() {
  return <FinanceWorkspace tab="laboratorio" />;
}
