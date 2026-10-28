import { redirect } from "next/navigation";

/** The old engine «Tablas» section was replaced by Analítica → Tablas; old links (notifications, bookmarks) land there. */
export default function EngineTablesPage() {
  redirect("/analytics?view=tablas");
}
