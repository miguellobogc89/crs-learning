/** Number formats used across analytics (Spanish locale, euros). */
const money = new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR", maximumFractionDigits: 2 });
const moneyShort = new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR", notation: "compact", maximumFractionDigits: 1 });
const plain = new Intl.NumberFormat("es-ES", { maximumFractionDigits: 2 });

export const fmtMoney = (n: number) => money.format(n);
export const fmtMoneyShort = (n: number) => Math.abs(n) < 1000 ? money.format(Math.round(n)).replace(/,00\s/, " ") : moneyShort.format(n);
export const fmtNumber = (n: number) => plain.format(n);
export const fmtDate = (iso: string) => {
  const [y, m, d] = iso.split("-");
  return d && m && y ? `${d}/${m}/${y}` : iso;
};

/** Fixed category → colour (categorical palette, slot order; colour follows the category, never its rank). */
export const CATEGORY_COLOR: Record<string, string> = {
  suministros: "#2a78d6", compras: "#eb6834", servicios: "#1baf7a", alquiler: "#eda100", rectificativas: "#e87ba4", otros: "#008300",
};
export const SINGLE_SERIES_COLOR = "#2a78d6";
