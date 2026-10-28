/**
 * Number formats used across analytics (Spanish style, euros). The thousands dot is ALWAYS shown ("1.234,50 €"):
 * the Spanish locale omits it below 10.000 by default, which makes amounts hard to read in a column.
 */
const grouped = (options: Intl.NumberFormatOptions) => {
  const es = new Intl.NumberFormat("es-ES", { ...options, useGrouping: "always" } as unknown as Intl.NumberFormatOptions);
  // Engines without useGrouping "always": de-DE prints numbers exactly like Spanish, with the dot from 1.000.
  return es.format(1234).includes(".") ? es : new Intl.NumberFormat("de-DE", options);
};
const money = grouped({ style: "currency", currency: "EUR", minimumFractionDigits: 2, maximumFractionDigits: 2 });
const moneyShort = new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR", notation: "compact", minimumFractionDigits: 0, maximumFractionDigits: 1 });
const plain = grouped({ maximumFractionDigits: 2 });

export const fmtMoney = (n: number) => money.format(n);
const moneyRound = grouped({ style: "currency", currency: "EUR", maximumFractionDigits: 0 });
export const fmtMoneyShort = (n: number) => Math.abs(n) < 10_000 ? moneyRound.format(Math.round(n)) : moneyShort.format(n);
export const fmtNumber = (n: number) => plain.format(n);
export const fmtDate = (iso: string) => {
  const [y, m, d] = iso.split("-");
  return d && m && y ? `${d}/${m}/${y}` : iso;
};

/** Fixed category → colour (categorical palette, slot order; colour follows the category, never its rank). */
export const CATEGORY_COLOR: Record<string, string> = {
  suministros: "#0A58FF", compras: "#eb6834", servicios: "#1baf7a", alquiler: "#eda100", rectificativas: "#e87ba4", otros: "#008300",
  personal: "#6250d6", impuestos: "#e34948",
};
export const SINGLE_SERIES_COLOR = "#0A58FF";
