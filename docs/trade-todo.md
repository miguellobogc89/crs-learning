# Trade: pendientes

Lista única de lo que queda, por prioridad (revisada el 17/11/2026). Lo hecho y el historial de cada
cambio están en git; aquí solo va lo que falta.

## 1. Ahora: cortos y protegen lo demás
- [ ] Mínimo de liquidez en las ideas de FARO (hoy propone monedas con 20.000-90.000 € de volumen al día: el resultado virtual sería mejor que el real).
- [ ] Aviso cuando un exchange falla al leer el saldo aunque siga «activo» en Conexiones (le pasaba a Binance).
- [ ] Marcar las ideas de monedas que no están en tu exchange («No está en Bitvavo») y desactivar «Ejecutar». Comprobar que FARO no proponga monedas fuera (el filtro de `venueBases()` falla abierto si Bitvavo no responde).
- [ ] Mensajes claros cuando falla la conexión con un exchange (certificado o proxy de empresa, DNS, tiempo agotado) en vez del error técnico encadenado. La causa ya la detecta `networkCause()` en `lib/brokers/adapters/*/api.ts`.
- [ ] Coste en euros de la IA: añadir en Vercel `TRADING_AI_PRICE_IN_EUR` y `TRADING_AI_PRICE_OUT_EUR` (euros por millón de tokens). Lo hace el usuario.
- [ ] AVALANCHA (cortos en caídas bruscas, 21/11/2026): validarla en el laboratorio antes de copiarla con dinero real: `/api/trading/lab/swarm?regla=caidas&dias=365` y un año bajista (`&hasta=2022-12-31&dias=365`). Si sale bien, añadir AVALANCHA x2/x3.
- [ ] Gestor de agentes (idea, cuando los agentes estén validados): un agente que decida en cada momento qué agente mueve tu dinero (ahora ENJAMBRE, ahora AVALANCHA, ahora ninguno) según la fase y lo que cada uno haya rendido en ella.

## 2. FARO aprende (cuando haya 2-3 semanas de datos)
Base ya en marcha: versión (`FARO_VERSION`), foto completa del mercado en cada idea y todos los candidatos con su resultado (`trading_faro_candidates`).
- [ ] Convicción calibrada: ¿acierta más con 5 que con 3?
- [ ] Simulador de salidas: qué habría pasado con otro stop, objetivo o plazo; recalcular límites y duraciones por tipo.
- [ ] Qué indicadores separan las ideas que ganan de las que pierden (y lo que se le escapó entre los candidatos descartados).
- [ ] Memoria de FARO: un resumen de su propio historial en cada análisis.
- [ ] Analista de FARO: revisa los resultados cerrados y propone cambios; solo se aplican si pasan una prueba estadística (datos no usados para proponerlos y mejor que las ideas al azar de control).
- [ ] Repetir la prueba a ciegas (`scripts/trading/faro-ciego.mjs`) con 100+ ideas de días distintos.

## 3. Agentes y carta
- [ ] Salida parcial (mitad en el primer objetivo) en tendencia y ruptura: necesita cierres parciales en las cuentas.
- [ ] Límite de concentración cuando el mercado está en defensa.
- [ ] Familia de bolsa: FARO también en el IBEX; vigilancia de acciones con su horario en los agentes de ideas; los 3 niveles de riesgo en bolsa; ATLAS global (detector con el índice de la bolsa de cada acción).
- [ ] Un agente que tome las ideas de acciones de EE. UU. de FARO (hoy solo se publican y se miden).
- [ ] Pausar / reanudar, duplicar, crear de verdad (el formulario ya está, sin guardar) y eliminar agentes (solo los de usuarios).
- [ ] Idea sin diseñar: equipos de agentes con un selector que, según el ciclo del mercado, decide qué agente mueve tu cartera («se pasan la cartera»).

## 4. Dinero real y exchanges
- [ ] Una copia vive en un solo exchange: copia = agente + exchange + cantidad, con el modal «Copiar a X» mostrando los exchanges operativos y su saldo libre (hoy todas usan el marcado «Usar para la cartera» y lo que no está allí sale «omitida»).
- [ ] Comisiones reales de cada cuenta por API (Revolut X por niveles; Coinbase, Binance, Bitvavo y OKX con sus endpoints). Hoy «Mis operaciones» usa siempre la de Bitvavo (0,25 %).
- [ ] Cambiar a mano el stop o el objetivo de una operación abierta.
- [ ] «Volver a euros» con copias activas: avisar de las monedas que solo cotizan en USDC y ofrecer vender lo comprado.
- [ ] Avisar de euros nuevos sin cambiar fuera de «Ver cuenta».
- [ ] Precios de Binance/Coinbase para agentes que operen monedas que no están en Bitvavo; decidir el universo con varios exchanges (el de Bitvavo, el común a todos o uno por agente).
- [ ] Binance: el trading por API sigue sin estar permitido en la región del usuario.
- [ ] Trading 212 para copiar acciones (reactivar `NEXT_PUBLIC_TRADING212_UI` y conectarlo con la ejecución protegida). Trade Republic y Revolut acciones no tienen API.
- [ ] Kraken; valorar CCXT para el resto de exchanges.

## 5. Móvil y UX
- [ ] Decidir dónde van en el móvil Cartera virtual, Mercados y Análisis de FARO (hoy no tienen acceso desde el iPhone).
- [ ] Resto de pantallas adaptadas al móvil: Actividad, Mercados, Conexiones y las ventanas de comprar y gestionar (tablas como tarjetas, detalles al tocar, botones de 44 px).
- [ ] En las ideas abiertas, el «Resultado por 100 €» en gris o como «va: …» (no es un resultado hasta que termina).
- [ ] Tarjetas de agentes: el minigráfico se corta por la derecha en algunas.
- [ ] Script de capturas (iPhone, iPad vertical y horizontal) para revisar cada sección.

## 6. Más adelante (producto)
- [ ] Liga semanal entre usuarios y agentes.
- [ ] Páginas de usuarios con cartera pública (solo si el usuario la hace pública).
- [ ] Avisos de los movimientos de los agentes (y más adelante por WhatsApp).
- [ ] Revisar el programa de referidos de Trading 212.
