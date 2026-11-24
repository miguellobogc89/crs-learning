// Laboratorio de CRS Finance (24/11/2026): datasets de prueba para usuarios ficticios. Seis meses de movimientos con
// conceptos como los de un extracto de verdad (TPV, recibos, Bizums, traspasos, comercios crípticos), para probar la
// clasificación con IA y el plan de ahorro con perfiles distintos sin tocar datos reales. Deterministas: el mismo
// perfil y el mismo día dan siempre los mismos movimientos.

export type LabTx = { date: string; amount: number; description: string; counterparty: string | null };
export type LabProfile = { key: string; label: string; detail: string; holder: string; generate: (today: string) => LabTx[] };

/** Usuario ficticio de un perfil, ligado al dueño (solo él puede usarlo). */
export const labEmail = (profile: string, ownerId: string) => `lab-${profile}+${ownerId}@lab.crussader.local`;

function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const iso = (d: Date) => d.toISOString().slice(0, 10);
const r2 = (n: number) => Math.round(n * 100) / 100;

/** Meses del dataset: los 6 anteriores y el actual hasta hoy. */
function months(today: string) {
  const [y, m] = today.split("-").map(Number);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(Date.UTC(y, m - 1 - (6 - i), 1));
    return { y: d.getUTCFullYear(), m: d.getUTCMonth(), len: new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate() };
  });
}

/** Utilidades para montar un perfil: cargos fijos, compras sueltas repartidas por el mes, ruido. */
function builder(today: string, seed: number) {
  const rand = rng(seed);
  const out: LabTx[] = [];
  const ms = months(today);
  const day = (mo: { y: number; m: number; len: number }, d: number) => iso(new Date(Date.UTC(mo.y, mo.m, Math.min(Math.max(1, d), mo.len))));
  const add = (date: string, amount: number, description: string, counterparty: string | null = null) => {
    if (date <= today) out.push({ date, amount: r2(amount), description, counterparty });
  };
  const between = (a: number, b: number) => a + rand() * (b - a);
  const pick = <T,>(xs: T[]) => xs[Math.floor(rand() * xs.length)];
  return {
    rand, between, pick, out, ms,
    /** Cada mes, el día indicado (± unos días si jitter). */
    monthly(d: number, amount: number | (() => number), description: string | (() => string), counterparty: string | null = null, jitter = 0, fromMonth = 0) {
      ms.forEach((mo, i) => {
        if (i < fromMonth) return;
        const a = typeof amount === "function" ? amount() : amount;
        add(day(mo, d + Math.round(between(-jitter, jitter))), a, typeof description === "function" ? description() : description, counterparty);
      });
    },
    /** Entre min y max veces al mes, en días al azar. */
    scattered(min: number, max: number, amount: () => number, description: () => string, counterparty: () => string | null = () => null) {
      ms.forEach((mo) => {
        const n = Math.round(between(min, max));
        for (let k = 0; k < n; k++) add(day(mo, 1 + Math.floor(rand() * mo.len)), amount(), description(), counterparty());
      });
    },
    once(monthIndex: number, d: number, amount: number, description: string, counterparty: string | null = null) {
      const mo = ms[Math.min(ms.length - 1, Math.max(0, monthIndex))];
      add(day(mo, d), amount, description, counterparty);
    },
    tpv: () => String(1000 + Math.floor(rand() * 8999)),
  };
}

const FRIENDS = ["ANA LOPEZ MARTIN", "PABLO RUIZ GOMEZ", "LUCIA FERNANDEZ DIAZ", "JAVIER MORENO SANZ", "MARTA GIL ORTEGA"];
const WHY = ["CENA", "REGALO", "", "COMPRA", "BOTE", "PADEL", ""];

function joven(today: string): LabTx[] {
  const b = builder(today, 11);
  const holder = "CARLOS NAVARRO PEREZ";
  b.monthly(28, () => b.between(1640, 1660), "NOMINA ACME SERVICIOS DIGITALES SL", "ACME SERVICIOS DIGITALES SL", 2);
  b.monthly(1, -650, "TRANSFERENCIA A JUAN PEREZ GARCIA CONCEPTO ALQUILER PISO", "JUAN PEREZ GARCIA", 1);
  b.monthly(6, () => -b.between(32, 58), "RECIBO IBERDROLA CLIENTES SAU REF 88213", "IBERDROLA CLIENTES SAU", 2);
  b.monthly(3, -30, "RECIBO DIGI SPAIN TELECOM SLU", "DIGI SPAIN TELECOM SLU");
  b.monthly(12, -12.99, "COMPRA INTERNET NETFLIX.COM", null);
  b.monthly(15, -10.99, "COMPRA INTERNET SPOTIFY P2F8A91C", null);
  b.monthly(20, -9.99, "COMPRA INTERNET HBOMAX.COM", null, 0, 2);
  b.monthly(5, -29.99, "RECIBO BASIC FIT SPAIN SAU", "BASIC FIT SPAIN SAU");
  b.monthly(29, -100, `TRANSFERENCIA A ${holder} AHORRO`, holder, 1);
  b.scattered(6, 8, () => -b.between(10, 48), () => `COMPRA TPV ${b.tpv()} MERCADONA S.A.`);
  b.scattered(1, 3, () => -b.between(8, 35), () => `COMPRA TPV ${b.tpv()} LIDL SUPERMERCADOS`);
  b.scattered(2, 4, () => -b.between(14, 30), () => b.pick(["COMPRA INTERNET UBER *EATS", "COMPRA INTERNET GLOVO APP 23"]));
  b.scattered(3, 6, () => -b.between(3, 24), () => b.pick([`COMPRA TPV ${b.tpv()} BAR LA ESQUINA`, `COMPRA TPV ${b.tpv()} CERVECERIA EL PUERTO`, `COMPRA TPV ${b.tpv()} 100 MONTADITOS`]));
  b.scattered(2, 5, () => -b.between(6, 18), () => b.pick(["COMPRA INTERNET CABIFY", "COMPRA INTERNET UBER *TRIP"]));
  b.scattered(2, 4, () => -b.between(5, 45), () => `BIZUM A ${b.pick(FRIENDS)} ${b.pick(WHY)}`.trim());
  b.scattered(1, 2, () => b.between(5, 30), () => `BIZUM DE ${b.pick(FRIENDS)} ${b.pick(WHY)}`.trim());
  b.scattered(1, 2, () => -b.between(12, 90), () => `AMAZON.ES*${b.tpv()}K4L`);
  b.scattered(0, 2, () => -b.between(19, 79), () => b.pick([`COMPRA TPV ${b.tpv()} ZARA ESPANA`, `COMPRA TPV ${b.tpv()} PULL AND BEAR`]));
  b.scattered(1, 2, () => -b.between(6, 40), () => `COMPRA TPV ${b.tpv()} GRUPO DIMAR SL`);
  b.scattered(0, 1, () => -b.pick([20, 50]), () => "RETIRADA CAJERO SANTANDER 4421");
  b.once(2, 14, -386.4, "COMPRA INTERNET RYANAIR FR9X2K");
  b.once(2, 16, -212, "COMPRA INTERNET BOOKING.COM HOTEL");
  return b.out;
}

function familia(today: string): LabTx[] {
  const b = builder(today, 23);
  b.monthly(27, () => b.between(2390, 2410), "NOMINA TRANSPORTES DEL SUR SA", "TRANSPORTES DEL SUR SA", 1);
  b.monthly(30, 1312.5, "ABONO NOMINA CONSEJERIA EDUCACION", "CONSEJERIA DE EDUCACION", 1);
  b.monthly(1, -893.2, "CARGO POR AMORTIZACION DE PRESTAMO 0182-3311-85-0832211", null);
  b.monthly(4, -65, "RECIBO COMUNIDAD PROPIETARIOS C OLMO 12", "COMUNIDAD PROPIETARIOS C OLMO 12");
  b.monthly(8, () => -b.between(70, 120), "RECIBO ENDESA ENERGIA SAU", "ENDESA ENERGIA SAU", 2);
  b.monthly(10, () => -b.between(25, 60), "RECIBO NATURGY IBERIA SA GAS", "NATURGY IBERIA SA", 2);
  b.monthly(18, () => -b.between(28, 36), "RECIBO EMASESA AGUA", "EMASESA", 1);
  b.monthly(2, -55, "RECIBO MOVISTAR FIBRA Y MOVIL", "TELEFONICA DE ESPANA SAU");
  b.monthly(5, -180, "RECIBO COLEGIO SAN JOSE MENSUALIDAD", "COLEGIO SAN JOSE");
  b.monthly(6, -45, "RECIBO CLUB DEPORTIVO NATACION INFANTIL", "CLUB DEPORTIVO TRITON");
  b.monthly(12, -13.99, "COMPRA INTERNET NETFLIX.COM", null);
  b.monthly(14, -8.99, "COMPRA INTERNET DISNEYPLUS", null);
  b.monthly(16, -9.99, "COMPRA INTERNET HBOMAX.COM", null);
  b.monthly(20, -150, "TRASPASO A CUENTA AHORRO 4821", null, 1);
  [0, 3, 6].forEach((i) => b.once(i, 9, -96.3, "RECIBO MAPFRE ESPANA SEGURO HOGAR", "MAPFRE ESPANA"));
  b.once(3, 22, -412.8, "RECIBO LINEA DIRECTA ASEGURADORA SEGURO AUTO", "LINEA DIRECTA ASEGURADORA");
  b.once(4, 15, -486.2, "RECIBO AYUNTAMIENTO IBI URBANA 2026", "AYUNTAMIENTO");
  b.once(1, 11, -640, "TALLER MECANICO HNOS RUIZ REPARACION");
  b.scattered(4, 5, () => -b.between(85, 160), () => `COMPRA TPV ${b.tpv()} CARREFOUR HIPER`);
  b.scattered(3, 6, () => -b.between(6, 30), () => `COMPRA TPV ${b.tpv()} PANADERIA HNOS GARCIA`);
  b.scattered(3, 4, () => -b.between(45, 70), () => `COMPRA TPV ${b.tpv()} REPSOL E S 2231`);
  b.scattered(1, 3, () => -b.between(8, 40), () => `COMPRA TPV ${b.tpv()} FARMACIA LDA M CASTRO`);
  b.scattered(2, 4, () => -b.between(30, 95), () => b.pick([`COMPRA TPV ${b.tpv()} FOSTERS HOLLYWOOD`, `COMPRA TPV ${b.tpv()} TELEPIZZA`, `COMPRA TPV ${b.tpv()} RESTAURANTE CASA PEPE`]));
  b.scattered(1, 3, () => -b.between(15, 120), () => `AMAZON.ES*${b.tpv()}M2P`);
  b.scattered(1, 2, () => -b.between(20, 140), () => b.pick([`COMPRA TPV ${b.tpv()} DECATHLON`, `COMPRA TPV ${b.tpv()} PRIMARK`, `COMPRA TPV ${b.tpv()} EL CORTE INGLES`]));
  b.scattered(0, 2, () => -b.between(10, 60), () => `BIZUM A ${b.pick(FRIENDS)} ${b.pick(WHY)}`.trim());
  b.scattered(1, 2, () => -b.between(10, 45), () => `COMPRA TPV ${b.tpv()} SERV Y COM ALJARAFE SL`);
  b.once(1, 3, -1180, "COMPRA INTERNET VIAJES EL CORTE INGLES");
  return b.out;
}

function justo(today: string): LabTx[] {
  const b = builder(today, 37);
  b.monthly(30, () => b.between(1240, 1260), "NOMINA LIMPIEZAS INTEGRALES DEL ESTE SL", "LIMPIEZAS INTEGRALES DEL ESTE SL", 1);
  b.monthly(2, -700, "TRANSFERENCIA A INMOBILIARIA SOL Y MAR ALQUILER", "INMOBILIARIA SOL Y MAR SL", 1);
  b.monthly(5, -212.4, "RECIBO SANTANDER CONSUMER FINANCE PRESTAMO", "SANTANDER CONSUMER FINANCE");
  b.monthly(9, -36.5, "RECIBO CETELEM FINANCIACION TERMINAL", "BANCO CETELEM SA");
  b.monthly(7, () => -b.between(40, 75), "RECIBO TOTALENERGIES CLIENTES", "TOTALENERGIES CLIENTES SAU", 2);
  b.monthly(3, -25, "RECIBO LOWI MOVIL", "VODAFONE ENABLER ESPANA");
  b.monthly(12, -7.99, "COMPRA INTERNET SPOTIFY P2F8A91C", null);
  b.monthly(18, -4.99, "COMPRA INTERNET AMAZON PRIME", null);
  b.scattered(7, 10, () => -b.between(6, 28), () => `COMPRA TPV ${b.tpv()} SUPERMERCADOS DIA`);
  b.scattered(4, 6, () => -b.between(12, 24), () => b.pick(["COMPRA INTERNET JUST EAT SPAIN", "COMPRA INTERNET GLOVO APP 23", "COMPRA INTERNET UBER *EATS"]));
  b.scattered(4, 7, () => -b.between(2, 9), () => b.pick([`COMPRA TPV ${b.tpv()} ESTANCO N 14`, `COMPRA TPV ${b.tpv()} CAFETERIA LA PARADA`]));
  b.scattered(2, 5, () => -b.between(10, 50), () => `BIZUM A ${b.pick(FRIENDS)} ${b.pick(WHY)}`.trim());
  b.scattered(1, 3, () => b.between(10, 60), () => `BIZUM DE ${b.pick(FRIENDS)} ${b.pick(WHY)}`.trim());
  b.scattered(1, 2, () => -b.pick([20, 40, 60]), () => "RETIRADA CAJERO EURONET 8812");
  b.scattered(0, 2, () => -b.between(15, 45), () => `COMPRA INTERNET SHEIN.COM`);
  b.scattered(0, 2, () => -b.between(5, 30), () => `COMPRA TPV ${b.tpv()} INVERSIONES MAMEN 2019 SL`);
  b.scattered(0, 1, () => -15, () => "COMISION DESCUBIERTO EN CUENTA");
  b.once(3, 12, -289, "COMPRA TPV MEDIAMARKT SEVILLA");
  return b.out;
}

export const LAB_PROFILES: LabProfile[] = [
  { key: "joven", label: "Joven de alquiler", detail: "1.650 € de nómina, alquiler, suscripciones, sale bastante, ahorra 100 € al mes a otra cuenta", holder: "CARLOS NAVARRO PEREZ", generate: joven },
  { key: "familia", label: "Familia con hipoteca", detail: "Dos sueldos, hipoteca, colegio, seguros anuales, IBI, una avería, traspaso a ahorro", holder: "ELENA MARTIN ROJAS", generate: familia },
  { key: "justo", label: "No llega a fin de mes", detail: "1.250 € de nómina, alquiler, préstamo y financiación, mucha comida a domicilio, comisiones", holder: "DAVID SORIANO LUQUE", generate: justo },
];
export const labProfile = (key: string) => LAB_PROFILES.find((p) => p.key === key) ?? null;
