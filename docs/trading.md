# Módulo de trading

Sección **Trading** (`/trading`): figuras chartistas en el IBEX 35, recomendaciones con plan completo
(entrada, stop, objetivo, tamaño) y una cartera virtual por espacio de trabajo con modo automático.

## Puesta en marcha

1. Aplicar la migración `prisma/migrations/20261110080000_trading/migration.sql` en Neon.
2. Entrar en `/trading` con un usuario owner/admin: la primera visita descarga solo 6 años de histórico
   de los 35 valores y del índice (1-2 minutos) y calcula el backtest.
3. El cron `/api/trading/cron` (lunes a viernes, 17:50 UTC) actualiza cotizaciones, recalcula el backtest,
   procesa las carteras (órdenes pendientes, stops, objetivos) y ejecuta el modo automático. Usa el mismo
   `CRON_SECRET` que el cron de licitaciones.

## Piezas

| Archivo | Qué hace |
|---|---|
| `lib/trading/indicators.ts` | SMA, EMA, RSI, ATR, MACD y tendencia de fondo. |
| `lib/trading/pivots.ts` | Zigzag adaptativo por ATR; cada pivote guarda cuándo quedó confirmado (sin mirar el futuro). |
| `lib/trading/patterns.ts` | Detectores: HCH y HCH invertido, doble techo/suelo, triángulos, banderas y rangos. Seguimiento de ruptura, anulación y caducidad. |
| `lib/trading/library.ts` | Fichas de cada figura: cómo se reconoce, entrada, stop, objetivo, tamaño y errores típicos. |
| `lib/trading/backtest.ts` | Backtest: señal al cierre de ruptura, entrada en la apertura siguiente, costes, una operación a la vez por valor. |
| `lib/trading/recommend.ts` | Puntuación (calidad 40 %, historial 25 %, tendencia 15 %, mercado 10 %, B/R 10 %) y plan en texto. |
| `lib/trading/risk.ts` / `paper.ts` | Tamaño por riesgo fijo, comisiones, deslizamiento y reglas de la cartera virtual. |
| `lib/trading/market-data.ts` | Proveedor de velas (endpoint público de Yahoo Finance) y composición inicial del IBEX 35. |
| `lib/trading/sync.ts` / `accounts.ts` / `service.ts` | Base de datos, proceso diario y lo que consume la API. |

Datos de mercado globales (`market_*`); cartera por espacio (`trading_*`, una por `workspace_id`).

## Notas

- Yahoo Finance no es una API oficial: si cambia o limita, solo hay que tocar `market-data.ts`.
- Las velas de la sesión en curso no se guardan hasta las 18:00 (Madrid) para no dar por vista una vela incompleta.
- Tests: `npm run test:trading`.
- Es una simulación con dinero ficticio; no es asesoramiento financiero.
