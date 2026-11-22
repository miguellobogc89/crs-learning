// Laboratorio de Plan: categorías simuladas por comercio mientras no existan de verdad («Moda», «Comida a domicilio»,
// «Mascotas»). Las usan la lista de grupos y el detalle de una categoría, para que ambas cuenten lo mismo.
import { categoryLabel } from "@/lib/finance/categories";

export const VIRTUAL: { key: string; label: string; merchants: string[] }[] = [
  { key: "lab_domicilio", label: "Comida a domicilio", merchants: ["glovo", "uber eats", "ubereats", "just eat", "justeat", "deliveroo", "telepizza", "dominos", "domino s"] },
  { key: "lab_moda", label: "Moda", merchants: ["zara", "mango", "primark", "h m", "pull bear", "pull and bear", "bershka", "stradivarius", "massimo dutti", "shein", "zalando", "springfield", "lefties", "oysho", "uniqlo", "levis", "nike", "adidas", "adidases", "foot locker", "jd sports", "parfois", "pandora", "vinted"] },
  { key: "lab_mascotas", label: "Mascotas", merchants: ["veterinario", "veterinaria", "veterinarios", "kiwoko", "tiendanimal", "zooplus", "miscota", "mascotas", "animalia"] },
];

const fold = (s: string) => ` ${s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ")} `;

/** Categoría con la que cuenta un cargo en el laboratorio: la simulada si su concepto la delata; si no, la suya. */
export function labCategory(category: string, ...texts: (string | null | undefined)[]) {
  const text = fold(texts.filter(Boolean).join(" "));
  return VIRTUAL.find((v) => v.merchants.some((m) => text.includes(` ${m} `)))?.key ?? category;
}

export const isVirtual = (key: string) => VIRTUAL.some((v) => v.key === key);
export const labLabel = (key: string) => VIRTUAL.find((v) => v.key === key)?.label ?? categoryLabel(key);
export const labFold = fold;
