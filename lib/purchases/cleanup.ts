import type { AnalyticsData } from "@/lib/analytics/data";
import { normalizePurchases } from "./analytics";

/**
 * Cleanup of purchases already imported (pure plan): what the reader now reads apart — discount %, packs and the
 * content of each pack — is written back into the lines whose figures PROVE it (they add up to the cent with it).
 * Only those cases; the previous values stay in the record's history. Lines read correctly are not touched.
 */
export type Fix = { lineId: string; producto: string | null; valores: Record<string, number | string | null>; motivo: "descuento" | "envases" | "cantidad" };
const UNIT: Record<string, string> = { L: "l", Kg: "kg", ud: "ud" };
const r4 = (n: number) => Math.round(n * 10000) / 10000;

export function cleanupPlan(data: AnalyticsData): Fix[] {
  const { lines, normalized } = normalizePurchases(data);
  const out: Fix[] = [];
  for (const l of lines) {
    const n = normalized.get(l.id);
    if (n?.estado !== "auto" || !n.caso || l.cantidad === null) continue;
    const valores: Fix["valores"] = {};
    let motivo: Fix["motivo"] | null = null;
    // A % saved as euros: it goes to «Descuento (%)».
    if (n.descuento_pct && !l.descuentoPct && l.descuento !== null && Math.abs(l.descuento - n.descuento_pct) < 0.001) {
      valores.discount_percent = n.descuento_pct; valores.discount_amount = null; motivo = "descuento";
    }
    const content = l.envase && l.unidadEnvase && !l.envaseLeido ? { package_content: l.envase, package_unit: UNIT[l.unidadEnvase] } : null;
    if (n.caso === "envases" && content) { Object.assign(valores, content, { package_count: l.cantidad }); motivo = "envases"; }
    else if (n.caso === "precio_envase" && content && n.unidades) { Object.assign(valores, content, { quantity: r4(n.unidades), package_count: r4(n.unidades) }); motivo = "envases"; }
    else if (n.caso === "contenido" && n.unidades && l.envase && l.unidadEnvase) { Object.assign(valores, { quantity: n.unidades, package_count: n.unidades, package_content: l.envase, package_unit: UNIT[l.unidadEnvase] }); motivo = "cantidad"; }
    else if (n.caso === "cantidad" && n.unidades) { valores.quantity = n.unidades; motivo = "cantidad"; }
    if (motivo && Object.keys(valores).length) out.push({ lineId: l.id, producto: l.producto, valores, motivo });
  }
  return out;
}

export function cleanupSummary(fixes: Fix[]) {
  const by = (m: Fix["motivo"]) => fixes.filter(f => f.motivo === m || (m === "descuento" && "discount_percent" in f.valores)).length;
  return { total: fixes.length, descuentos: by("descuento"), envases: by("envases"), cantidades: by("cantidad") };
}
