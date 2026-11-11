"use client";
// Icono de cada valor: logo de la empresa (favicon de su web) o de la criptomoneda.
// Si no hay logo o no carga, se muestran las iniciales en un círculo de color.
import { useState } from "react";
import { CRYPTO, IBEX35, INDEX_SYMBOL } from "@/lib/trading/market-data";

/** Web de cada empresa del IBEX 35, para sacar su logo. */
const DOMAIN: Record<string, string> = {
  "ACS.MC": "grupoacs.com",
  "ACX.MC": "acerinox.com",
  "AENA.MC": "aena.es",
  "AMS.MC": "amadeus.com",
  "ANA.MC": "acciona.com",
  "ANE.MC": "acciona-energia.com",
  "BBVA.MC": "bbva.com",
  "BKT.MC": "bankinter.com",
  "CABK.MC": "caixabank.com",
  "CLNX.MC": "cellnex.com",
  "COL.MC": "inmocolonial.com",
  "ELE.MC": "endesa.com",
  "ENG.MC": "enagas.es",
  "FDR.MC": "fluidra.com",
  "FER.MC": "ferrovial.com",
  "GRF.MC": "grifols.com",
  "IAG.MC": "iairgroup.com",
  "IBE.MC": "iberdrola.com",
  "IDR.MC": "indracompany.com",
  "ITX.MC": "inditex.com",
  "LOG.MC": "logista.com",
  "MAP.MC": "mapfre.com",
  "MRL.MC": "merlinproperties.com",
  "MTS.MC": "arcelormittal.com",
  "NTGY.MC": "naturgy.com",
  "PUIG.MC": "puig.com",
  "RED.MC": "redeia.com",
  "REP.MC": "repsol.com",
  "ROVI.MC": "rovi.es",
  "SAB.MC": "bancsabadell.com",
  "SAN.MC": "santander.com",
  "SCYR.MC": "sacyr.com",
  "SLR.MC": "solariaenergia.com",
  "TEF.MC": "telefonica.com",
  "UNI.MC": "unicajabanco.es",
  [INDEX_SYMBOL]: "bolsasymercados.es",
};

/** Para los sitios donde solo llega el nombre del valor. */
const BY_NAME = new Map([...IBEX35, ...CRYPTO].map((i) => [i.name.toLowerCase(), i.symbol]));

const PALETTE = ["bg-blue-100 text-blue-700", "bg-emerald-100 text-emerald-700", "bg-violet-100 text-violet-700", "bg-orange-100 text-orange-700", "bg-rose-100 text-rose-700", "bg-cyan-100 text-cyan-700", "bg-amber-100 text-amber-800"];

const SIZES = { xs: "h-5 w-5 text-[8px]", sm: "h-6 w-6 text-[9px]", md: "h-8 w-8 text-[11px]", lg: "h-10 w-10 text-xs" } as const;

/** Las noticias etiquetan las crypto sin «-EUR» (BTC); aquí se reconocen igual. */
const CRYPTO_BASES = new Set(CRYPTO.map((c) => c.symbol.replace(/-EUR$/, "")));

function logoUrl(symbol: string) {
  if (CRYPTO_BASES.has(symbol)) symbol = `${symbol}-EUR`;
  if (symbol.endsWith("-EUR")) return `https://assets.coincap.io/assets/icons/${symbol.replace(/-EUR$/, "").toLowerCase()}@2x.png`;
  const domain = DOMAIN[symbol];
  return domain ? `https://www.google.com/s2/favicons?domain=${domain}&sz=64` : null;
}

function initials(label: string) {
  const clean = label.replace(/^\^/, "").replace(/\.MC$|-EUR$/, "");
  const words = clean.split(/\s+/).filter(Boolean);
  return (words.length > 1 ? words[0][0] + words[1][0] : clean.slice(0, 3)).toUpperCase();
}

export function AssetIcon({ symbol, name, size = "md", className = "" }: { symbol?: string | null; name?: string | null; size?: keyof typeof SIZES; className?: string }) {
  const sym = symbol ?? (name ? BY_NAME.get(name.toLowerCase()) : undefined) ?? null;
  const url = sym ? logoUrl(sym) : null;
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const failed = !!url && failedUrl === url;
  const label = name ?? sym ?? "?";
  const hue = PALETTE[[...label].reduce((s, c) => s + c.charCodeAt(0), 0) % PALETTE.length];
  const box = `inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full ${SIZES[size]} ${className}`;
  if (url && !failed)
    return (
      <span className={`${box} border border-slate-100 bg-white`}>
        {/* eslint-disable-next-line @next/next/no-img-element -- logos externos pequeños, sin optimizar */}
        <img src={url} alt="" loading="lazy" className="h-[70%] w-[70%] object-contain" onError={() => setFailedUrl(url)} />
      </span>
    );
  return (
    <span className={`${box} font-bold ${hue}`} aria-hidden="true">
      {initials(label)}
    </span>
  );
}

/** Icono + nombre del valor, en una línea. */
export function AssetName({ symbol, name, sub, size = "md" }: { symbol?: string | null; name: string; sub?: React.ReactNode; size?: keyof typeof SIZES }) {
  return (
    <span className="flex min-w-0 items-center gap-2.5">
      <AssetIcon symbol={symbol} name={name} size={size} />
      <span className="min-w-0">
        <span className="block truncate font-medium text-slate-900">{name}</span>
        {sub && <span className="block truncate text-xs font-normal text-slate-500">{sub}</span>}
      </span>
    </span>
  );
}
