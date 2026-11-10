// lib/trading/news/sources.ts
// De dónde salen las noticias y qué activos se reconocen en ellas.

export type NewsMarket = "bolsa" | "crypto";

export type FeedSource = {
  /** Identificador estable (se guarda con cada noticia y en el estado de lectura). */
  key: string;
  label: string;
  market: NewsMarket;
  url: string;
  /** Activo al que se refiere la búsqueda, como pista para la clasificación. */
  hint?: string;
};

/** Criptomonedas que se reconocen en las noticias (la parte de cotizaciones llegará después). */
export const CRYPTO_ASSETS: { symbol: string; name: string; aliases: string[] }[] = [
  { symbol: "BTC", name: "Bitcoin", aliases: ["bitcoin", "btc"] },
  { symbol: "ETH", name: "Ethereum", aliases: ["ethereum", "ether", "eth"] },
  { symbol: "SOL", name: "Solana", aliases: ["solana", "sol"] },
  { symbol: "XRP", name: "XRP", aliases: ["xrp", "ripple"] },
  { symbol: "BNB", name: "BNB", aliases: ["bnb", "binance coin"] },
  { symbol: "ADA", name: "Cardano", aliases: ["cardano", "ada"] },
  { symbol: "DOGE", name: "Dogecoin", aliases: ["dogecoin", "doge"] },
  { symbol: "AVAX", name: "Avalanche", aliases: ["avalanche", "avax"] },
  { symbol: "DOT", name: "Polkadot", aliases: ["polkadot", "dot"] },
  { symbol: "LINK", name: "Chainlink", aliases: ["chainlink", "link"] },
  { symbol: "LTC", name: "Litecoin", aliases: ["litecoin", "ltc"] },
  { symbol: "TRX", name: "Tron", aliases: ["tron", "trx"] },
  { symbol: "TON", name: "Toncoin", aliases: ["toncoin", "ton"] },
  { symbol: "USDT", name: "Tether", aliases: ["tether", "usdt"] },
  { symbol: "USDC", name: "USD Coin", aliases: ["usdc", "circle"] },
];

/** Etiquetas para noticias que afectan a todo un mercado y no a un valor concreto. */
export const MARKET_TAGS = {
  MERCADO_ES: "Bolsa española (general)",
  CRYPTO: "Mercado crypto (general)",
} as const;

const CRYPTO_FEEDS: FeedSource[] = [
  { key: "coindesk", label: "CoinDesk", market: "crypto", url: "https://www.coindesk.com/arc/outboundfeeds/rss/" },
  { key: "cointelegraph", label: "Cointelegraph", market: "crypto", url: "https://cointelegraph.com/rss" },
  { key: "decrypt", label: "Decrypt", market: "crypto", url: "https://decrypt.co/feed" },
  { key: "theblock", label: "The Block", market: "crypto", url: "https://www.theblock.co/rss.xml" },
  { key: "beincrypto-es", label: "BeInCrypto (es)", market: "crypto", url: "https://es.beincrypto.com/feed/" },
];

/** Búsqueda de Google Noticias en español de España, limitada a los últimos días. */
export function googleNews(query: string, days = 2) {
  const q = encodeURIComponent(`${query} when:${days}d`);
  return `https://news.google.com/rss/search?q=${q}&hl=es&gl=ES&ceid=ES:es`;
}

/** Fuentes a leer: una búsqueda por valor de bolsa, una general del IBEX y los medios crypto. */
export function buildSources(instruments: { symbol: string; name: string; isIndex: boolean }[]): FeedSource[] {
  const bolsa: FeedSource[] = [
    {
      key: "gn:ibex",
      label: "Google Noticias · IBEX 35",
      market: "bolsa",
      url: googleNews('"Ibex 35" OR "Bolsa española" OR CNMV'),
      hint: "MERCADO_ES",
    },
  ];
  for (const i of instruments) {
    if (i.isIndex) continue;
    bolsa.push({
      key: `gn:${i.symbol}`,
      label: `Google Noticias · ${i.name}`,
      market: "bolsa",
      url: googleNews(`"${i.name}" (acciones OR bolsa OR resultados OR CNMV OR dividendo)`),
      hint: i.symbol,
    });
  }
  return [...bolsa, ...CRYPTO_FEEDS];
}

export const NEWS_CATEGORIES = [
  "resultados",
  "previsiones",
  "dividendo",
  "opa_fusion",
  "ampliacion_capital",
  "deuda_rating",
  "contrato_negocio",
  "directivos",
  "regulacion",
  "judicial",
  "macro",
  "analistas",
  "seguridad_hackeo",
  "adopcion_institucional",
  "etf_productos",
  "tecnologia",
  "otro",
] as const;
export type NewsCategory = (typeof NEWS_CATEGORIES)[number];

export const CATEGORY_LABEL: Record<NewsCategory, string> = {
  resultados: "Resultados",
  previsiones: "Previsiones",
  dividendo: "Dividendo",
  opa_fusion: "OPA / fusión",
  ampliacion_capital: "Ampliación de capital",
  deuda_rating: "Deuda / rating",
  contrato_negocio: "Contrato / negocio",
  directivos: "Directivos",
  regulacion: "Regulación",
  judicial: "Judicial",
  macro: "Macro",
  analistas: "Analistas",
  seguridad_hackeo: "Hackeo / seguridad",
  adopcion_institucional: "Adopción institucional",
  etf_productos: "ETF / productos",
  tecnologia: "Tecnología",
  otro: "Otro",
};
