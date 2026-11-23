import { redirect } from "next/navigation";

/** Dirección antigua de «Mis finanzas»: ahora es CRS Finance, una app aparte. */
export default function Page() {
  redirect("/finanzas/inicio");
}
