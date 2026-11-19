import { redirect } from "next/navigation";

/** Estructura pública de CRS: sin autenticación ni datos en esta fase. */
export default function HomePage() {
  redirect("/apps");
}
