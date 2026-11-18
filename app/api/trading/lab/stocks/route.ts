// Simulación del enjambre de bolsa: radar de países (índice de cada bolsa) y rupturas de 20 días en sus mayores
// empresas, con velas diarias de Yahoo Finance. Guarda el resultado en trading_lab_results. Solo con sesión.
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { fetchDailyCandles } from "@/lib/trading/market-data";
import { simulateStocks, type DBar, type Market } from "@/lib/trading/lab/stocks";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** Bolsas: índice de referencia y sus 15 mayores empresas (lista de hoy: hay sesgo de supervivencia). */
const MARKETS: { key: string; name: string; index: string; stocks: string[] }[] = [
  { key: "US", name: "EE. UU.", index: "^GSPC", stocks: ["AAPL", "MSFT", "NVDA", "AMZN", "GOOGL", "META", "AVGO", "TSLA", "JPM", "LLY", "V", "XOM", "UNH", "MA", "COST"] },
  { key: "CA", name: "Canadá", index: "^GSPTSE", stocks: ["RY.TO", "TD.TO", "SHOP.TO", "ENB.TO", "CNR.TO", "CP.TO", "BMO.TO", "BNS.TO", "CNQ.TO", "TRI.TO", "SU.TO", "MFC.TO", "ATD.TO", "CSU.TO", "BN.TO"] },
  { key: "BR", name: "Brasil", index: "^BVSP", stocks: ["VALE3.SA", "PETR4.SA", "ITUB4.SA", "BBDC4.SA", "BBAS3.SA", "ABEV3.SA", "WEGE3.SA", "B3SA3.SA", "RENT3.SA", "SUZB3.SA", "ITSA4.SA", "PRIO3.SA", "EQTL3.SA", "RADL3.SA", "GGBR4.SA"] },
  { key: "UK", name: "Reino Unido", index: "^FTSE", stocks: ["SHEL.L", "AZN.L", "HSBA.L", "ULVR.L", "BP.L", "GSK.L", "RIO.L", "REL.L", "DGE.L", "BATS.L", "LSEG.L", "BARC.L", "LLOY.L", "NG.L", "RR.L"] },
  { key: "DE", name: "Alemania", index: "^GDAXI", stocks: ["SAP.DE", "SIE.DE", "ALV.DE", "DTE.DE", "MBG.DE", "BAS.DE", "BMW.DE", "MUV2.DE", "IFX.DE", "DB1.DE", "ADS.DE", "RWE.DE", "DBK.DE", "VOW3.DE", "AIR.DE"] },
  { key: "ES", name: "España", index: "^IBEX", stocks: ["SAN.MC", "IBE.MC", "ITX.MC", "BBVA.MC", "CABK.MC", "TEF.MC", "REP.MC", "AMS.MC", "FER.MC", "CLNX.MC", "ACS.MC", "AENA.MC", "IAG.MC", "MAP.MC", "GRF.MC"] },
  { key: "JP", name: "Japón", index: "^N225", stocks: ["7203.T", "6758.T", "9984.T", "6861.T", "8306.T", "9432.T", "6098.T", "8035.T", "4063.T", "6501.T", "7974.T", "9983.T", "8058.T", "6367.T", "4568.T"] },
  { key: "KR", name: "Corea", index: "^KS11", stocks: ["005930.KS", "000660.KS", "373220.KS", "207940.KS", "005380.KS", "000270.KS", "068270.KS", "035420.KS", "105560.KS", "055550.KS", "012330.KS", "051910.KS", "006400.KS", "035720.KS", "028260.KS"] },
  { key: "HK", name: "Hong Kong", index: "^HSI", stocks: ["0700.HK", "9988.HK", "0005.HK", "1299.HK", "0941.HK", "3690.HK", "1810.HK", "0388.HK", "2318.HK", "0939.HK", "1398.HK", "0883.HK", "9618.HK", "2020.HK", "0016.HK"] },
  { key: "IN", name: "India", index: "^NSEI", stocks: ["RELIANCE.NS", "TCS.NS", "HDFCBANK.NS", "INFY.NS", "ICICIBANK.NS", "HINDUNILVR.NS", "ITC.NS", "SBIN.NS", "BHARTIARTL.NS", "LT.NS", "KOTAKBANK.NS", "AXISBANK.NS", "BAJFINANCE.NS", "MARUTI.NS", "SUNPHARMA.NS"] },
  { key: "AU", name: "Australia", index: "^AXJO", stocks: ["BHP.AX", "CBA.AX", "CSL.AX", "NAB.AX", "WBC.AX", "ANZ.AX", "WES.AX", "MQG.AX", "FMG.AX", "WDS.AX", "TLS.AX", "RIO.AX", "GMG.AX", "WOW.AX", "TCL.AX"] },
];

const clean = (c: { t: number; o: number; h: number; l: number; c: number }[]): DBar[] =>
  c.filter((b) => b.o > 0 && b.h > 0 && b.l > 0 && b.c > 0).map((b) => ({ t: b.t, o: b.o, h: b.h, l: b.l, c: b.c }));

export async function GET(req: Request) {
  if (!(await auth())?.user?.id) return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  const years = Math.min(6, Math.max(1, Number(new URL(req.url).searchParams.get("anios")) || 3));
  // Un año más de datos para el radar (media de 200 sesiones).
  const fetchYears = years + 1.2;
  const failed: string[] = [];
  const jobs = MARKETS.flatMap((m) => [m.index, ...m.stocks].map((sym) => ({ m: m.key, sym })));
  const got = new Map<string, DBar[]>();
  for (let i = 0; i < jobs.length; i += 10) {
    await Promise.all(jobs.slice(i, i + 10).map(async (j) => {
      try {
        const { candles } = await fetchDailyCandles(j.sym, { years: fetchYears });
        const bars = clean(candles);
        if (bars.length > 250) got.set(j.sym, bars);
        else failed.push(j.sym);
      } catch {
        failed.push(j.sym);
      }
    }));
  }
  const markets: Market[] = MARKETS.filter((m) => got.has(m.index)).map((m) => ({
    key: m.key,
    name: m.name,
    index: got.get(m.index)!,
    stocks: new Map(m.stocks.filter((s) => got.has(s)).map((s) => [s, got.get(s)!])),
  }));
  const from = Date.now() - Math.round(years * 365.25 * 86_400_000);
  const result = simulateStocks(markets, from);
  // Referencia: lo que hizo cada índice en el periodo.
  const indexPct = Object.fromEntries(markets.map((m) => {
    const first = m.index.find((b) => b.t >= from);
    const last = m.index[m.index.length - 1];
    return [m.key, first ? Math.round((last.c / first.c - 1) * 10_000) / 100 : null];
  }));
  const summary = { years, from: new Date(from).toISOString(), markets: markets.map((m) => `${m.key}:${m.stocks.size}`), failed, indexPct, result };
  await prisma.$executeRaw`INSERT INTO trading_lab_results (name, params, result) VALUES ('enjambre-bolsa', ${JSON.stringify({ years })}::jsonb, ${JSON.stringify(summary)}::jsonb)`;
  return NextResponse.json(summary);
}
