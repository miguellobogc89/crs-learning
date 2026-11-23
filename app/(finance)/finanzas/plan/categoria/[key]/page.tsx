import { redirect } from "next/navigation";

type PageProps = { params: Promise<{ key: string }> };

/** Dirección antigua: el detalle de categoría vive ahora en /finanzas/categoria/<clave>. */
export default async function Page({ params }: PageProps) {
  const { key } = await params;
  redirect(`/finanzas/categoria/${key}`);
}
