import { redirect } from "next/navigation";
import { auth } from "@/auth";

// Una sola entrada para todos los módulos tras iniciar sesión.
export default async function AppEntryPage() {
  const userId = (await auth())?.user?.id;
  if (!userId) redirect("/");

  redirect("/apps");
}
