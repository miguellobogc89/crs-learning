# Módulo de trading

Sección **Trading** (`/trading/<sección>`, con panel lateral: Qué hacer hoy, Mi cartera, ¿Cómo me habría ido?, Gráficos, Patrones, Reglas y Valores): figuras chartistas en el IBEX 35, recomendaciones con plan completo
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
| `lib/trading/recommend.ts` | Puntuación (calidad 30 %, historial 35 %, tendencia 15 %, mercado 10 %, B/R 10 %; veto a figuras con R medio negativo y 30+ operaciones) y plan en texto. |
| `lib/trading/simulate.ts` | Simulador histórico de la cartera con las reglas del usuario, sin mirar el futuro (el historial de cada figura solo cuenta operaciones ya cerradas en cada fecha). |
| `lib/trading/risk.ts` / `paper.ts` | Tamaño por riesgo fijo, comisiones, deslizamiento y reglas de la cartera virtual. |
| `lib/trading/market-data.ts` | Proveedor de velas (endpoint público de Yahoo Finance) y composición inicial del IBEX 35. |
| `lib/trading/sync.ts` / `accounts.ts` / `service.ts` | Base de datos, proceso diario y lo que consume la API. |

Datos de mercado globales (`market_*`); cartera por espacio (`trading_*`, una por `workspace_id`).

## Notas

- Yahoo Finance no es una API oficial: si cambia o limita, solo hay que tocar `market-data.ts`.
- Las velas de la sesión en curso no se guardan hasta las 18:00 (Madrid) para no dar por vista una vela incompleta.
- El simulador usa la composición actual del índice (sesgo de supervivencia leve, avisado en pantalla).
- Tests: `npm run test:trading`.
- Es una simulación con dinero ficticio; no es asesoramiento financiero.

## Noticias (agentes de bolsa y crypto)

- Migración: `prisma/migrations/20261110120000_trading_news/migration.sql`.
- Fuentes: Google Noticias (una búsqueda por valor del IBEX 35 y una general) y los RSS de CoinDesk,
  Cointelegraph, Decrypt, The Block y BeInCrypto (es). Lectura en `lib/trading/news/feed.ts`, sin dependencias.
- Cada feed se lee como mucho cada 30 minutos; se guardan las noticias de los últimos 3 días y se borran a los 60.
- La IA (`lib/trading/ai.ts`, modelo barato) clasifica en lotes de 20: activos afectados, tipo, tono (−2…2),
  importancia (0…3) y una frase de resumen. Las no relevantes quedan como «descartada».
- Se actualizan al entrar en la sección (si hace más de 30 min), con el botón «Actualizar» y con el tiempo que
  sobre en el cron diario.
- Variables opcionales: `TRADING_AI_PROVIDER` (openai), `TRADING_AI_FAST_MODEL`, `TRADING_AI_SMART_MODEL`,
  `TRADING_AI_DAILY_CALLS` (tope diario, 300 por defecto).

## Crypto

- 12 criptomonedas en euros (`CRYPTO` en `market-data.ts`), mercado `CRYPTO` en `market_instruments`; se siembran solas.
- Velas diarias 24/7 (la del día en curso no se guarda hasta las 00:00 UTC), cantidades fraccionarias,
  backtest y estadísticas propios (`crypto` en `market_backtests.stats`), Bitcoin como referencia del mercado.
- Gráficos, biblioteca y simulador tienen selector Bolsa / Crypto.

## Comité de inversión (coordinador)

- Migración: `prisma/migrations/20261110150000_trading_committee/migration.sql` (también pasa `trading_positions.quantity` a decimal).
- `lib/trading/committee/service.ts` reúne para cada activo candidato (posiciones, señales, noticias importantes,
  BTC y ETH; máx. 24) técnico, figuras con su historial, noticias de 72 h y la cartera, y consulta al modelo bueno
  (`TRADING_AI_SMART_MODEL`, esfuerzo `TRADING_AI_SMART_EFFORT`, «low» por defecto para no pasar del minuto).
- `committee/prompt.ts` aplica reglas duras a la respuesta: pruebas citadas que existan, stop y objetivo coherentes,
  distancia del stop (0,5 ATR – 15 % en bolsa, 25 % en crypto), beneficio/riesgo ≥ 1,5, máximo de posiciones,
  tamaño por riesgo fijo. Lo que no pasa se guarda como «rechazada» con el motivo.
- Se reúne solo al entrar en «Qué hacer hoy» si aún no lo ha hecho ese día (o con «Volver a convocar»).
- `committee/outcome.ts` mide cada propuesta como si se hubiera seguido; «Historial del comité» lo compara con el mercado.

## Estrategia de tendencia y perfiles de riesgo

- `lib/trading/strategy.ts`: rotación por fuerza relativa (subida en N sesiones, por encima de la media de 200),
  `topN` activos, revisión periódica, stop de protección por ATR y salida total si el IBEX / Bitcoin pierde su media de 200.
- Los parámetros se eligen con `chooseTrendParams` usando solo los 3 años anteriores al inicio de la simulación
  (mejor rentabilidad / caída máxima); el periodo simulado no se usa para elegir.
- Perfiles: Prudente (50 % invertido; 0,5 % de riesgo en figuras), Equilibrado (80 %; 1 %), Agresivo (100 %; 2 %).
- La fuerza relativa entra también en el comité (pruebas `F:`) y en «Los que más fuerza tienen» del Inicio.

## Navegación

Inicio · Oportunidades · Mi cartera · Noticias · Simulador · Gráficos · Aprende; en «Más»: Historial del comité,
Reglas y riesgo, Valores seguidos. `/trading/hoy` redirige a Oportunidades.

## Trading 212 Demo (bróker)

Solo funciona en local (`NODE_ENV=development`) con `TRADING212_ENV=demo`, `TRADING212_API_KEY` y `TRADING212_API_SECRET`.

- **Vinculación** (`lib/trading/broker/logic.ts` → `matchInstrument`): cada valor de bolsa se busca en el catálogo de Trading 212 por ISIN, luego por ticker `XXXe_EQ` y luego por nombre corto. Solo acciones en EUR. El resultado se guarda en `market_instruments.broker_ticker / isin / broker_note`. Las crypto no se vinculan.
- **Compra protegida** (`executeProtectedBuy`): compra a mercado y crea una fila en `trading_broker_brackets`. Tamaño = mínimo entre riesgo por operación de la cuenta, 20 % del patrimonio Demo y 98 % del efectivo. Rechaza si ya hay posición, órdenes pendientes u operación activa en ese valor. Nunca reintenta un POST.
- **Vigilancia** (`runBrokerGuardian`, `decideBracket`): Trading 212 no tiene OCO y solo admite una orden de venta por valor, así que el **stop** se deja puesto en el bróker y el **objetivo** lo vigila la app. Al tocarlo: cancela el stop y vende a mercado. Si el stop desaparece, lo vuelve a poner. Si el precio abre por debajo del stop, vende. Estados: `esperando_entrada → protegida → vendiendo → cerrada` (o `error`).
- La pantalla *Mi cartera → Trading 212 Demo* ejecuta la vigilancia cada minuto mientras está abierta (`POST broker/guardian`). Con la app cerrada, solo protege el stop.
- **Autonomía del comité** (`trading_accounts.broker_autonomy`): `nada` (no toca el bróker), `aprobacion` (botón «Trading 212 Demo» al ejecutar una propuesta) o `automatico` (al reunirse, el comité envía solo sus compras de bolsa válidas).
- API: `GET broker`, `POST broker/link`, `POST broker/guardian`, `POST broker/autonomy`, `POST committee/execute-broker` (`{ proposalId, confirmDemo: true }`).
- Migración: `prisma/migrations/20261110180000_trading_broker/migration.sql`.

## Agentes

Sección *Agentes* (`/trading/agentes`), que sustituye al simulador histórico en el menú (el endpoint `simulate` sigue existiendo).

- Tres agentes (`lib/trading/agents/roster.ts`), cada uno con **5.000 € virtuales** y su propia cartera (`trading_accounts.agent`; la del usuario es `agent = ''`):
  - **ARGO-1**, precavido: 0,5 % de riesgo por operación, máx. 15 % por valor, 1 compra por reunión, convicción ≥ 4, beneficio/riesgo ≥ 2, no compra en mercado bajista.
  - **NOVA-2**, equilibrado: 1 %, 25 %, 2 compras, convicción ≥ 3, beneficio/riesgo ≥ 1,5.
  - **VÉRTIGO-3**, arriesgado: 2 %, 35 %, 3 compras, convicción ≥ 3, puede comprar en mercado bajista con convicción 5.
  - Sin comisiones (como Trading 212), con 8 pb de deslizamiento.
- Todos reciben **la misma información** que el comité (`buildContext`); cambian su carácter (se añade a las instrucciones), sus reglas duras (`ctx.rules` en `validateCommittee`) y su cartera.
- **Autonomía total**: al acabar la reunión, `executeAgentRun` ejecuta en su cartera ventas, subidas de stop y compras (a la próxima apertura). Lo que no se puede ejecutar queda como «descartada» con el motivo.
- Reunión diaria: cron `/api/trading/cron/agents` (lunes a viernes, 18:15 UTC, después del cron de datos), los tres en paralelo. También a mano con «Reunir a los agentes ahora» (una petición por agente).
- API: `GET agents`, `POST agents/run { agent }`, `POST agents/reset { agent }`.
- Migración: `prisma/migrations/20261110200000_trading_agents/migration.sql`.

## Navegación (desde el 10/11/2026)

- **Inicio** (`home-panel.tsx`): tu cartera virtual y su gráfico, tabla «Tú y los agentes» y últimos movimientos de los agentes (`getAgents().moves`).
- **Oportunidades** (`opportunities-panel.tsx`, `GET opportunities` → `lib/trading/agents/opportunities.ts`): las compras de la última reunión de cada agente (últimos 4 días), agrupadas por valor, con el tamaño recalculado para tu cartera y el plan del agente más convencido. Avisa si un agente vende algo que tú tienes. Se ejecutan en tu cartera virtual (`source = "agente"`).
- **Agentes**: una tarjeta por agente y su ficha.
- **Mi cartera**: solo la cartera virtual. Trading 212 Demo queda oculto; se vuelve a mostrar con `NEXT_PUBLIC_TRADING212_UI=1` en local.
- **Explorar**: Gráficos, Noticias, Aprende. **Ajustes**: Reglas y riesgo, Valores seguidos.
- Se han quitado el comité suelto (Oportunidades e Historial del comité) y las señales técnicas sueltas. El código del comité sigue en el servidor porque lo usan los agentes.

## Agentes globales, abrir cuenta y copias (migración 20261110220000_trading_open_copy)

- **Agentes globales**: viven en el espacio ficticio `AGENTS_WORKSPACE` (`00000000-0000-4000-8000-000000000001`), iguales para todos. La migración mueve allí los del primer espacio que los creó. Solo los reúne/reinicia a mano quien está en `TRADING_AGENTS_ADMIN_WORKSPACES` (ids de espacio separados por comas) o cualquiera en local; el cron los reúne una vez al día para toda la plataforma.
- **Abrir cuenta**: `trading_accounts.opened_at`. Sin abrir, Inicio, Oportunidades y Mi cartera muestran «Abre tu cuenta» (500 € - 100.000 €). `openAccount` reinicia la cartera sin comisiones y borra las copias. Las cuentas existentes quedan abiertas.
- **Copias** (`lib/trading/agents/copy.ts`): subcartera `agent = 'copia:<agente>'` en el espacio del usuario con `copy_weight_pct` (% del patrimonio total). Al asignar o cambiar el peso se traspasa efectivo entre la cartera principal y la copia (ajustando el capital inicial de ambas). `replicate` se llama tras cada decisión ejecutada de un agente: compras en proporción (mismo % de su patrimonio, con fracciones), ventas y subidas de stop. «Igualar cartera» replica sus posiciones actuales al seguirle. Dejar de copiar vende al último precio y devuelve el dinero.
- API: `GET portfolio`, `POST account/open { capital }`, `POST copy/set { agent, weightPct, mirror }`, `POST copy/stop { agent }`.

## Agentes de dos modos («chip»): CAMALEÓN-4

- Reglas fijas, sin IA, las mismas que se probaron en el laboratorio (`scripts/trading/lab.mjs`, estrategia `chip-b-rupt`):
  - **Detector B**: ataque si Bitcoin está por encima de su media de 200 días, de su media de 50 y de su precio de hace 10 días. Si falla una, defensa (todo a efectivo).
  - **Ataque**: compra las crypto que superan su máximo de 20 días (hasta 3, a partes iguales) y las vende si pierden su mínimo de 10 (stop que sube cada día).
- `lib/trading/chip/roster.ts` (definición) y `lib/trading/chip/engine.ts` (`chipTick`): una decisión al día con la vela de ayer cerrada, desde el cron `agents-tick`. Compra y vende al precio de ahora (crypto no cierra), deja una «reunión» con el modo y las condiciones (`context.chip`) y sus compras/ventas como propuestas ejecutadas (salen en su página, en Inicio y en Oportunidades). Las copias virtuales replican compras, ventas y subidas de stop; la copia en el exchange funciona igual que con los kamikazes.
- 5.000 € virtuales, comisión 0,25 % por orden (como Bitvavo). En el laboratorio (5 años): +153,8 % frente a +17,5 % de mantener Bitcoin, peor caída −42,7 % frente a −73,3 %.
