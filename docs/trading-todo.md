# Trading: pendiente (To Do)

Apuntado el 10/11/2026. Sin empezar.

## Universo
- [ ] Ampliar crypto a ~25 monedas.
- [ ] Reuniones de los agentes también en fin de semana (solo pueden operar crypto).
- [ ] Añadir EE. UU.: 30-50 empresas más grandes y conocidas.
  - [ ] Mover cotizaciones y reuniones a ~22:30 (Madrid), después del cierre de Wall Street.
  - [ ] Convertir dólares a euros con el cambio del día y enseñar el efecto divisa.
  - [ ] Fuentes de noticias de EE. UU.

## Agentes estándar para todos
- [x] Los agentes son globales, no por espacio de trabajo: mismo historial para todo el mundo y un espacio nuevo no los reinicia.
  - Coste de IA fijo (3 reuniones al día en total, no 3 por espacio).

## Abrir cuenta
- [x] Al entrar por primera vez no se crea una cartera de 10.000 €: aparece «Abrir cuenta» y el usuario elige el capital inicial (rango 500 € - 100.000 €).
- [x] Comisiones por defecto como un bróker sin comisiones (si no, con 500 € el mínimo de 3 € distorsiona).

## Copiar a un agente (copy trading)
- [x] Asignar a cada agente un peso: % del capital que replica (la suma no pasa del 100 %; el resto queda para operar a mano).
- [x] Réplica proporcional: si el agente mete el 25 % de su cartera en Repsol, tú metes el 25 % de la parte asignada.
- [x] Una subcartera por agente seguido (resultado separado por agente y sin conflictos si dos compran lo mismo).
- [x] Al empezar a seguir: solo operaciones nuevas, con opción de «igualar su cartera actual».
- [x] Copiar automáticamente (virtual).
- [ ] Avisar y ejecutar con un botón (dinero real).
- [x] Permitir fracciones de acción en las copias (con poco capital no salen acciones enteras).

## Que se sienta viva
- [ ] Precios durante el día (crypto en tiempo real, bolsa con ~15 min de retraso).
- [ ] Avisos de movimientos de los agentes (y más adelante WhatsApp).
- [ ] Liga semanal entre usuarios y agentes.

## Dinero real (más adelante)
- [ ] Reactivar Trading 212 (NEXT_PUBLIC_TRADING212_UI) y conectar la copia con la ejecución protegida.
- [ ] Revisar el programa de referidos de Trading 212.

## UX (12/11/2026)
- [ ] Quitar la sección «Reglas y riesgo»: aquí se opera por copia (sin ajustes de riesgo propios ni modo automático por figuras).
- [ ] Nueva sección «Mercados» (debajo de Mi cartera) que unifica Valores seguidos, Gráficos, Noticias y Aprende, con pestañas horizontales: Valores (lista; al pulsar, su gráfico), Noticias y Aprende. Cada pestaña con su URL (`/trading/mercados?tab=…`); en móvil, fila desplazable.

## Agentes (12/11/2026)
- [x] Página propia de cada agente (`/trading/agentes/<clave>`, miga «Inicio > X» o «Agentes > X»).
- [x] Tarjetas con menú de tres puntos, puesto junto al nombre y estado de tus copias.
- [ ] Pausar / reanudar agente (en el menú como «Pronto»).
- [ ] Duplicar agente y crear agente de verdad (el formulario ya está, sin guardar).
- [ ] Eliminar (solo agentes de usuarios).
- [ ] Páginas de usuarios con cartera pública (p. ej. Paco_Gomez), solo si el usuario la hace pública.

## Ideas (12/11/2026)
- [ ] **Equipos de agentes con selector**: el detector de mercado avisa de cambios de ciclo y un selector decide qué agente del equipo mueve tu cartera en cada momento. Al cambiar, se liquida lo del agente saliente y entra el nuevo («se pasan la cartera»). Solo idea, sin diseñar.
- [ ] Tarjetas de agentes: el minigráfico se corta por la derecha en algunas.

## Oportunidades y Mis operaciones (12/11/2026)
- [ ] Marcar en Oportunidades las ideas de monedas que **no existen en Bitvavo** (p. ej. SOPH-EUR: «Bitvavo no tiene SOPH-EUR: no se puede copiar»): etiqueta «No está en Bitvavo» y «Ejecutar» desactivado. Comprobar también que FARO no proponga monedas fuera de Bitvavo (el filtro de `venueBases()` falla abierto si Bitvavo no responde).
- [ ] En ideas abiertas, el «Resultado por 100 €» en gris o como «va: …» (no es un resultado hasta que termina).
- [ ] Repetir la prueba a ciegas de FARO (`scripts/trading/faro-ciego.mjs`) con 100+ ideas de días distintos, midiendo también si la convicción alta acierta más; probar kamikaze «repartido» (hasta 3 ideas a la vez).

## Integraciones (13/11/2026)
- [ ] Aviso claro cuando el fallo al conectar un bróker es de red, en lugar del mensaje técnico encadenado (hoy: «No se pudieron comprobar los permisos… (No se pudo conectar con Binance (certificado no válido: posible proxy de empresa))»). Por ejemplo, certificado: «Tu conexión a internet no permite conectar con Binance de forma segura. Parece una red de empresa o con proxy que intercepta las conexiones. Prueba desde otra red»; DNS: «no se encuentra Binance (red o DNS bloqueados)»; tiempo agotado: «Binance no responde, inténtalo en un rato». Igual para Bitvavo. La causa ya la detecta `networkCause()` en `lib/brokers/adapters/*/api.ts`.

## Varios exchanges, Coinbase y USDC (14/11/2026)
- [x] **Coinbase conectado** (Advanced Trade, solo real): clave ECDSA con «View» y «Trade»; se rechazan las claves con «Transfer». Pares en euros y en USDC.
- [x] **Cambio a USDC** en Coinbase y Binance (en el EEE no hay USDT al contado por MiCA): en «Ver cuenta», bloque «Efectivo» con «Cambiar a USDC» y «Volver a euros» (orden a mercado con auditoría e idempotencia). Al conectar Coinbase o Binance se abre la cuenta para ofrecer el cambio. Aviso de comisión y del efecto del dólar.
  - [x] Cada moneda se compra con el efectivo que tengas (USDC → BTC-USDC; euros → BTC-EUR; si solo cotiza en una, esa). Todo se enseña en euros; los precios de las copias se guardan en euros.
  - [ ] Con copias activas, «Volver a euros» no avisa de que se saltarán las monedas que solo cotizan en USDC ni ofrece vender lo comprado.
  - [ ] Detectar euros nuevos sin cambiar y avisar fuera de «Ver cuenta» (hoy solo se ve allí).
  - [ ] Precios de Binance/Coinbase para agentes que operen monedas que no están en Bitvavo (hoy los kamikazes y FARO se filtran a Bitvavo).
- [x] **Pills en los agentes** (tarjeta, lista y página): qué operan (Crypto / Valores) y dónde se les puede copiar, sobre su universo (no sobre lo que tienen): verde si están todas, ámbar «Coinbase 10/12» si solo parte, gris si aún no hay dinero real (Trading 212 Demo). Listas públicas de Bitvavo, Coinbase y Binance, guardadas 6 h.
- [ ] **Una copia vive en un solo exchange**: copia = agente + exchange + cantidad. Hoy todas las copias usan el exchange marcado «Usar para la cartera» y lo que no está allí sale «omitida». Falta el modal «Copiar a X» con los exchanges operativos, su saldo libre y cuánto usar en cada uno (una subcartera independiente por exchange).
- [ ] Comisión de «Mis operaciones» fija a la de Bitvavo (0,25 %): en Coinbase es más alta (~0,5 % a mercado).
- [ ] Decidir el universo cuando haya más exchanges: el de Bitvavo, las monedas comunes de todos o uno propio por agente.
- [ ] Binance: el trading por API sigue sin estar permitido en tu región.

## Mi cartera y conexiones (14/11/2026)
- [x] Al conectar una cuenta real queda operativa: permisos «Leer», «Operar» y «Automático» marcados por defecto y, si la cartera no tenía exchange activo, pasa a ser el de la cartera.
- [x] Mi cartera: saldo, Disponible / Trabajando para ti / En oportunidades / Ganado dentro del bloque de la gráfica, con botón «Actualizar».
- [x] «Mis oportunidades»: abiertas e historial en una sola lista (filtros Todas / Abiertas / Historial), con stop y objetivo, resultado en € y %, «Seguir si sube» activable en las abiertas y «Cerrar» (vende ya).
- [x] Tus agentes en pequeño al lado (clic → Gestionar); fuera el panel de detalle del agente seleccionado.
- [ ] Cambiar stop u objetivo de una oportunidad abierta a mano.

## FARO: análisis y aprendizaje (14/11/2026)
- [x] Oportunidades → pestaña **Análisis** (`?vista=analisis`): resultado total con 100 € por idea, por idea, acierto, ganan/pierden, factor de beneficio, peor caída; curva acumulada; semana a semana; acierto en media móvil (últimas 50); por tipo, convicción, franja horaria y fase del mercado; máxima subida frente a máxima bajada (¿falla al elegir o al gestionar?) y qué habría pasado con un objetivo fijo más corto.
- [x] Cada idea nueva guarda lo que veía FARO al publicarla (`features`: cambios 1 h/4 h/24 h, distancia a máximos/mínimos de 3 días, volumen, riesgo y recorrido, hora y día, fase del mercado, Bitcoin 24 h, noticias). **Aplicar en Neon la migración `20261114160000_trading_faro_features`** (sin ella todo sigue funcionando, pero no se guarda el contexto).
- [x] Rebotes apagados (0/58 aciertos, −2,1 % de media del 11 al 14/11). Configurable con `TRADING_FARO_OFF` (lista de tipos; vacío = ninguno).
- [x] Contexto reconstruido de las ideas antiguas con velas públicas de Binance, fase del mercado de ese día y noticias de entonces (unas 10 por revisión del cron).
- [x] **FARO-2 en pruebas**: mismas ideas, solo las que pasan filtros fijos (sin rebotes, sin perseguir +12 % 24 h / +4 % 1 h, sin impulsos en máximos, Bitcoin > −2 % 24 h, mercado no en defensa, objetivo ≥ 1,5 × riesgo). Comparado en Análisis (todas / pasa / descarta, motivos) y marcado «F2» en cada idea. No cambia lo que se publica.
- [x] Aviso al ejecutar una idea que FARO-2 descarta (con el motivo).
- [x] **Control al azar**: en cada análisis, tantas ideas como publica la IA, con monedas al azar entre las mismas candidatas y el mismo riesgo, recorrido y validez. No se enseñan ni se operan. En Análisis: «¿Elige mejor que el azar?» (FARO, FARO-2, azar y azar que pasa FARO-2 en el mismo periodo) y segmento «Al azar». **Aplicar en Neon la migración `20261114220000_trading_faro_controls`.**
- [x] Kamikazes solo con ideas que pasan FARO-2 (las que no tienen contexto, también); se desactiva con `TRADING_KAMIKAZE_FARO2=false`. Si no entran, el motivo dice cuántas descartó FARO-2.
- [ ] FÉNIX (estilo rebotes) se queda sin ideas al estar apagados los rebotes: decidir si cambia de estilo o se para.
- [ ] Si FARO-2 gana unos días: publicar solo sus ideas.
- [x] Stop y objetivo según la volatilidad, **probado con las ideas pasadas**: ATR de 1 h guardado con cada idea (y añadido a las antiguas) y simulación de 4 stops × 5 objetivos (1–4 ATR) con las velas de 5 min de cada idea resuelta. En Análisis: rejilla, mejor combinación y si aguanta en las dos mitades del periodo.
- [ ] Si una combinación aguanta: usarla en FARO-2 (niveles por ATR en vez de los de la IA).
- [ ] Memoria de FARO: resumen de su propio historial en cada análisis.
- [ ] FARO-2 en paralelo y comparación en Análisis.
- [ ] Filtro estadístico con ~300 ideas con contexto.

## Móvil y tablet (15/11/2026)
- [x] **Fase 0 — Trading separado de Crussader**: grupo de rutas propio `app/(trading)` (mismas URLs `/trading/...`, mismo login y base de datos) sin la barra superior, el menú, el chat ni las colas de la app general. «Ir a Crussader» en el menú.
- [x] **Fase 1 — estructura propia** (`components/trading/shell.tsx`): móvil con barra fina (hamburguesa + título) y menú a pantalla completa (secciones, Mi dinero, mercado); tablet en vertical con barra de iconos; tablet en horizontal y ordenador con la barra lateral completa. Fuera las píldoras de secciones. En móvil y tablet, scroll normal de página; «sin scroll, solo las tablas» solo en ordenador.
- [ ] Fase 2 — reglas de pantalla pequeña: tablas como tarjetas en todas partes, sub-pestañas fijas arriba, ventanas a pantalla completa o desde abajo, detalles al tocar (no al pasar el ratón), botones de 44 px.
- [ ] Fase 3 — rediseño por pantalla: Mi cartera, Oportunidades, Análisis, Inicio, Agentes, Integraciones y Mercados.
- [ ] Fase 4 — instalable (manifest, icono, pantalla completa) y avisos.
- [ ] Script de capturas (iPhone, iPad vertical y horizontal) para revisar cada sección.
- [x] Fase 2/3 (primera tanda, 15/11): instalable como app (manifest e iconos en `public/trading-app`), menú a pantalla completa, secciones «sin panel» en móvil (`flat`), ventanas desde abajo; Mi cartera (lista de oportunidades con detalle y acciones), Oportunidades (lista compacta con «Ver más» y detalle con Ejecutar), Inicio (filas de dos líneas), Agentes (barra mínima, solo tarjetas), Análisis (secciones a todo el ancho). Tablas comunes en móvil: sin páginas ni scroll interno, orden en desplegable y fila compacta opcional (`mobileRow`).
- [ ] Siguiente tanda móvil: Actividad, Mercados, Integraciones, página de agente, ventanas de comprar/gestionar.
- [x] Agentes sin scroll horizontal en móvil; la cabecera de la página de un agente ya no sale cortada (la rejilla de alto fijo solo en ordenador).
- [x] Esqueletos de carga (web y app) en vez del panel con el círculo girando; la barra y el menú se quedan montados al cambiar de sección (layout de /trading + loading.tsx).
- [x] Esqueleto a pantalla completa y sin marco (forma de tabla); cambiar Operadores/Actividad y las pestañas de Oportunidades ya no va al servidor; precarga en segundo plano de Inicio, Oportunidades, Cartera y Agentes.
- [x] Actividad rediseñada: Operador (abre su página) · Operación (pastilla con icono) · Activo · Precio entrada → salida/ahora · Resultado (€ y %) · Cuándo; al pulsar un movimiento, panel lateral con el detalle. Tablas y Análisis sin recuadros.
- [x] Búfer: las lecturas se guardan en memoria y en sessionStorage; al volver a una pantalla se ve al instante lo último conocido y se actualiza por detrás.

## Panorama e indicadores (16/11/2026)
- [x] Inicio → nueva pestaña **Panorama** (la primera): resumen en frases, Bitcoin (precio, 24 h / 7 / 30 días), estado de FARO-2, miedo y codicia, tendencia (media de 200 días), RSI, liquidez y actividad (volumen frente a lo normal, valor del mercado, peso de Bitcoin), funding de futuros, índice del dólar y fase del detector de CAMALEÓN. Cada uno con «Cómo se lee» y su gráfica.
- [x] Foto diaria en `trading_market_pulse` (migración 20261116100000, aplicada en Neon el 16/11).
- [ ] Usar la foto diaria como contexto de las ideas de FARO y medir qué indicadores separan las que ganan de las que pierden.
- [x] Inventario de agentes (consultado en Neon) y archivados ARGO, NOVA, FÉNIX, FÉNIX AJUSTADO, COHETE, MECHA 2 BALAS y MECHA CORRE: no operan ni se ven; su historial se conserva (ARCHIVED_* en los rosters). Quedan CAMALEÓN, VÉRTIGO, COHETE PERSIGUE y MECHA.
- [x] La IA no invierte, solo informa (FARO). Comité entero archivado; VÉRTIGO vuelve sin número y sin IA como agente «Selectivo» (ideas de FARO-2 con convicción ≥ 4), clave `vertigo-faro`. CAMALEÓN pierde el «-4».
- [x] FARO con su filtro (antes «FARO-2»): solo se publica lo que pasa; las descartadas no se ven ni las coge ningún agente, y siguen en Análisis para comparar.
- [x] La carta: ideas que publica FARO + escáner de rupturas de 20 días + contexto (fase). Agentes = combinación de la carta y su gestión del dinero.
- [x] Todos con 1.000 €, sin rondas ni metas, empezando de cero (lo anterior se archiva con la clave «agente~fecha», lib/trading/agents/restart.ts). COHETE y MECHA hasta 4 operaciones a la vez; VÉRTIGO una (todo a una carta); CAMALEÓN hasta 3.
- [x] Ficha «Cómo opera» igual para todos (qué ideas coge, cuándo, cuánto pone, cuándo sale) y una sola pastilla de estilo. Fuera rondas, número de ranking y pastillas de exchanges (solo en «Copiar con dinero real»).
- [x] Referencias (no agentes): «Bitcoin guardado» y «Bitcoin cada día» desde que empezaron los agentes, en Operadores (con 1.000 €) y en la página de cada agente. HORMIGA retirado.
- [x] Menú de agentes: ver su ficha, copiar con dinero real, eliminar (desactivado). Fuera la copia virtual.
- [x] Panel lateral al pulsar un agente (Agentes y Operadores), con enlace a la ficha completa.
- [x] Copia al instante: en cuanto un agente compra o vende, sus copias en el exchange lo repiten (el cron queda de red de seguridad).
- [x] Revolut X conectado (lib/brokers/adapters/revolutx): firma Ed25519, saldos, pares en euros, órdenes a mercado y limitadas, estado y cancelación. Sin retiradas en su API.
- [x] Comisiones de la tarifa pública de cada exchange en Conexiones (Revolut X 0 / 0,09 %, OKX 0,08 / 0,10 %, Binance 0,10 %, Bitvavo 0,15 / 0,25 %, Coinbase 0,40 / 0,60 %).
- [ ] Leer la comisión real de cada cuenta por API (Revolut X: niveles; Coinbase, Binance, Bitvavo, OKX: sus endpoints de comisiones).
- [ ] Kraken; valorar CCXT para el resto de exchanges.
- [x] Bolsa de EE. UU. (16/11): 40 grandes (Nvidia, Apple, Microsoft, Amazon…) y los ETF QQQ y SPY, guardadas en euros al cambio de cada día; horario de Nueva York; fracciones; filtro España / EE. UU. / Crypto en Mercados.
- [x] ATLAS: las reglas de CAMALEÓN sobre EE. UU. (detector sobre el Nasdaq 100, rupturas 20/10, hasta 3), 1.000 €.
- [ ] FARO analizando acciones de EE. UU. (velas de 1 h de Yahoo, horario de mercado).
- [ ] Copiar acciones con dinero real: completar Trading 212 (Trade Republic y Revolut acciones no tienen API).

