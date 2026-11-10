// lib/trading/library.ts
// Biblioteca de figuras: qué son, cómo se reconocen y cómo se opera cada una.
// Las reglas descritas aquí son exactamente las que aplica el detector (lib/trading/patterns.ts).
import type { Direction, PatternKey } from "./types";

export type PatternCard = {
  key: PatternKey;
  name: string;
  family: "Giro" | "Continuación" | "Neutral";
  direction: Direction;
  summary: string;
  identify: string[];
  entry: string;
  stop: string;
  target: string;
  sizing: string;
  pitfalls: string[];
  /** Puntos del esquema para el dibujo de la ficha (x 0-100, y 0-100, 0 arriba). */
  sketch: [number, number][];
  /** Línea de disparo del esquema. */
  sketchTrigger: [[number, number], [number, number]];
};

const SIZING =
  "Arriesga un porcentaje fijo de la cartera (por defecto el 1 %). Acciones = (capital × riesgo %) ÷ (entrada − stop). Así el tamaño lo decide la distancia al stop, no la intuición, y ninguna operación por sí sola puede hacer mucho daño.";

export const PATTERN_LIBRARY: PatternCard[] = [
  {
    key: "hch",
    name: "Hombro-cabeza-hombro",
    family: "Giro",
    direction: "short",
    summary:
      "Techo en tres empujes: un máximo (hombro izquierdo), uno más alto (cabeza) y otro más bajo (hombro derecho). Indica que los compradores ya no consiguen nuevos máximos y la tendencia alcista puede girar.",
    identify: [
      "Viene precedido de una subida: es una figura de techo.",
      "La cabeza supera a los dos hombros; los hombros quedan a alturas parecidas (diferencia menor que la mitad de la altura de la figura).",
      "Los dos valles forman la línea clavicular, horizontal o algo inclinada.",
      "Tiempos razonablemente simétricos: ningún lado dura más del triple que el otro.",
      "Mejor si el volumen del hombro derecho es menor que el del izquierdo.",
    ],
    entry: "Vender (o cerrar largos) cuando una sesión cierra por debajo de la línea clavicular. Los más conservadores esperan al pullback: que el precio vuelva a tocar la clavicular desde abajo.",
    stop: "Por encima del hombro derecho. Si el precio lo supera, la figura queda anulada.",
    target: "La altura cabeza → clavicular, proyectada hacia abajo desde el punto de ruptura.",
    sizing: SIZING,
    pitfalls: [
      "Vender antes de que rompa la clavicular: muchas figuras no llegan a completarse.",
      "Confundirla con un simple retroceso dentro de una tendencia alcista fuerte.",
      "En acciones, operar en corto tiene costes y limitaciones; muchas veces el uso práctico es salir de los largos.",
    ],
    sketch: [[0, 85], [18, 40], [32, 62], [50, 12], [66, 62], [80, 40], [100, 90]],
    sketchTrigger: [[25, 62], [95, 62]],
  },
  {
    key: "hch_inv",
    name: "Hombro-cabeza-hombro invertido",
    family: "Giro",
    direction: "long",
    summary:
      "La versión de suelo: tres mínimos con el central más profundo. Los vendedores pierden fuerza y el precio empieza a hacer mínimos más altos.",
    identify: [
      "Viene precedido de una bajada.",
      "La cabeza (el mínimo central) queda por debajo de los dos hombros, que están a alturas parecidas.",
      "Los dos picos intermedios forman la línea clavicular.",
      "Mejor si la ruptura llega con volumen por encima de la media.",
    ],
    entry: "Comprar cuando una sesión cierra por encima de la línea clavicular, o en el pullback a la clavicular ya rota.",
    stop: "Por debajo del hombro derecho.",
    target: "La altura de la figura (cabeza → clavicular) proyectada hacia arriba desde la ruptura.",
    sizing: SIZING,
    pitfalls: [
      "Las rupturas sin volumen fallan más a menudo.",
      "Si el mercado general (IBEX) está en tendencia bajista, la tasa de acierto baja mucho.",
    ],
    sketch: [[0, 15], [18, 60], [32, 38], [50, 88], [66, 38], [80, 60], [100, 10]],
    sketchTrigger: [[25, 38], [95, 38]],
  },
  {
    key: "double_top",
    name: "Doble techo",
    family: "Giro",
    direction: "short",
    summary: "Dos máximos casi iguales separados por un valle. El precio fracasa dos veces en la misma resistencia.",
    identify: [
      "Subida previa al menos tan larga como la propia figura.",
      "Los dos techos difieren menos del 22 % de la altura de la figura.",
      "Entre techo y techo pasan entre 8 y 160 sesiones.",
      "Refuerzan la señal un RSI más bajo en el segundo techo (divergencia) y menos volumen en el segundo techo.",
    ],
    entry: "Vender al cierre por debajo del valle intermedio.",
    stop: "Por encima del techo más alto.",
    target: "La altura (techo → valle) proyectada hacia abajo desde el valle.",
    sizing: SIZING,
    pitfalls: ["Hasta que no pierde el valle es solo un rango; muchos dobles techos acaban siendo triples techos o rupturas al alza."],
    sketch: [[0, 90], [25, 15], [50, 60], [75, 17], [100, 95]],
    sketchTrigger: [[40, 60], [95, 60]],
  },
  {
    key: "double_bottom",
    name: "Doble suelo",
    family: "Giro",
    direction: "long",
    summary: "Dos mínimos casi iguales separados por un pico. El soporte aguanta dos veces y los compradores toman el control.",
    identify: [
      "Bajada previa al menos tan larga como la figura.",
      "Los dos suelos están a alturas casi iguales.",
      "Mejor con divergencia alcista del RSI (el segundo suelo con RSI más alto) y menos volumen en el segundo suelo.",
    ],
    entry: "Comprar al cierre por encima del pico intermedio.",
    stop: "Por debajo del suelo más bajo.",
    target: "La altura (pico → suelo) proyectada hacia arriba desde el pico.",
    sizing: SIZING,
    pitfalls: ["Comprar en el segundo suelo «por si acaso» antes de la ruptura: si pierde el soporte, la caída suele acelerarse."],
    sketch: [[0, 10], [25, 85], [50, 40], [75, 83], [100, 5]],
    sketchTrigger: [[40, 40], [95, 40]],
  },
  {
    key: "triangle_asc",
    name: "Triángulo ascendente",
    family: "Continuación",
    direction: "long",
    summary: "Resistencia horizontal y mínimos cada vez más altos: los compradores presionan una y otra vez el mismo nivel.",
    identify: [
      "Al menos dos máximos a la misma altura y dos mínimos crecientes.",
      "La figura se estrecha: al final mide como mucho el 75 % de su anchura inicial.",
      "El volumen suele secarse dentro del triángulo.",
    ],
    entry: "Comprar al cierre por encima de la resistencia horizontal.",
    stop: "Por debajo del último mínimo dentro del triángulo.",
    target: "La altura de la parte más ancha del triángulo, proyectada desde la ruptura.",
    sizing: SIZING,
    pitfalls: ["Las rupturas cerca del ápice pierden fuerza; las mejores llegan entre la mitad y las tres cuartas partes del triángulo."],
    sketch: [[0, 85], [20, 20], [40, 65], [60, 20], [78, 45], [90, 20], [100, 5]],
    sketchTrigger: [[15, 20], [100, 20]],
  },
  {
    key: "triangle_desc",
    name: "Triángulo descendente",
    family: "Continuación",
    direction: "short",
    summary: "Soporte horizontal y máximos cada vez más bajos: los vendedores presionan el soporte hasta romperlo.",
    identify: [
      "Al menos dos mínimos a la misma altura y dos máximos decrecientes.",
      "La figura se estrecha hacia el ápice.",
    ],
    entry: "Vender al cierre por debajo del soporte horizontal.",
    stop: "Por encima del último máximo dentro del triángulo.",
    target: "La altura de la parte más ancha proyectada hacia abajo.",
    sizing: SIZING,
    pitfalls: ["En tendencia alcista de fondo estos triángulos fallan a menudo: mira el filtro de tendencia."],
    sketch: [[0, 15], [20, 80], [40, 35], [60, 80], [78, 55], [90, 80], [100, 95]],
    sketchTrigger: [[15, 80], [100, 80]],
  },
  {
    key: "triangle_sym",
    name: "Triángulo simétrico",
    family: "Neutral",
    direction: "long",
    summary: "Máximos decrecientes y mínimos crecientes: compresión del precio. Suele resolverse a favor de la tendencia previa.",
    identify: [
      "Dos líneas convergentes, una bajista por arriba y otra alcista por abajo.",
      "Al menos cuatro toques en total.",
      "La dirección esperada es la de la tendencia anterior a la figura (el detector la toma de ahí).",
    ],
    entry: "Al cierre fuera del triángulo en la dirección de la tendencia previa.",
    stop: "Al otro lado del último pivote dentro del triángulo.",
    target: "La altura de la parte más ancha, proyectada desde la ruptura.",
    sizing: SIZING,
    pitfalls: ["Las rupturas falsas son frecuentes; la confirmación por volumen ayuda mucho."],
    sketch: [[0, 50], [15, 10], [35, 85], [55, 25], [72, 68], [86, 40], [100, 15]],
    sketchTrigger: [[15, 10], [100, 48]],
  },
  {
    key: "flag_bull",
    name: "Bandera alcista",
    family: "Continuación",
    direction: "long",
    summary: "Subida fuerte y rápida (mástil) seguida de una pausa corta y suave en contra (bandera). El mercado coge aire para seguir.",
    identify: [
      "Mástil de al menos 3,5 ATR y un 6 % en 25 sesiones o menos.",
      "La bandera corrige entre el 12 % y el 50 % del mástil, en 3 a 25 sesiones.",
      "El volumen baja durante la bandera.",
    ],
    entry: "Comprar al cierre por encima del máximo del mástil.",
    stop: "Por debajo del mínimo de la bandera.",
    target: "La longitud del mástil proyectada desde la ruptura.",
    sizing: SIZING,
    pitfalls: ["Si la bandera corrige más de la mitad del mástil, ya no es una bandera: es un giro."],
    sketch: [[0, 95], [35, 15], [50, 35], [62, 25], [72, 42], [85, 12], [100, 0]],
    sketchTrigger: [[35, 15], [100, 15]],
  },
  {
    key: "flag_bear",
    name: "Bandera bajista",
    family: "Continuación",
    direction: "short",
    summary: "Caída fuerte y rápida seguida de un rebote corto y suave. Suele preceder a otra pierna bajista.",
    identify: [
      "Mástil bajista de al menos 3,5 ATR y un 6 % en 25 sesiones o menos.",
      "El rebote recupera entre el 12 % y el 50 % de la caída.",
    ],
    entry: "Vender al cierre por debajo del mínimo del mástil.",
    stop: "Por encima del máximo del rebote.",
    target: "La longitud del mástil proyectada hacia abajo desde la ruptura.",
    sizing: SIZING,
    pitfalls: ["Tras caídas por noticias puntuales (resultados, regulación) el rebote puede convertirse en suelo."],
    sketch: [[0, 5], [35, 85], [50, 65], [62, 75], [72, 58], [85, 88], [100, 100]],
    sketchTrigger: [[35, 85], [100, 85]],
  },
  {
    key: "range_up",
    name: "Rango lateral · ruptura al alza",
    family: "Neutral",
    direction: "long",
    summary: "El precio oscila entre un techo y un suelo claros (rectángulo). Cuando rompe el techo, el rango se convierte en la base de una nueva subida.",
    identify: [
      "Al menos cuatro toques entre techo y suelo, con los bordes bien definidos (poca dispersión).",
      "El rango dura 15 sesiones o más y mide al menos 2,5 ATR.",
    ],
    entry: "Comprar al cierre por encima del techo del rango.",
    stop: "A mitad de rango: si vuelve tan adentro, la ruptura ha fallado.",
    target: "La altura del rango proyectada desde el techo.",
    sizing: SIZING,
    pitfalls: ["Dentro del rango no hay señal: comprar en el suelo y vender en el techo es otra estrategia distinta."],
    sketch: [[0, 70], [15, 25], [30, 70], [45, 25], [60, 70], [75, 25], [100, 0]],
    sketchTrigger: [[10, 25], [100, 25]],
  },
  {
    key: "range_down",
    name: "Rango lateral · ruptura a la baja",
    family: "Neutral",
    direction: "short",
    summary: "Mismo rectángulo, pero el precio pierde el suelo: el rango se convierte en techo de una caída.",
    identify: ["Mismos criterios que el rango alcista."],
    entry: "Vender al cierre por debajo del suelo del rango.",
    stop: "A mitad de rango.",
    target: "La altura del rango proyectada hacia abajo desde el suelo.",
    sizing: SIZING,
    pitfalls: ["Si el IBEX está fuerte, muchas pérdidas de soporte se recuperan enseguida."],
    sketch: [[0, 30], [15, 75], [30, 30], [45, 75], [60, 30], [75, 75], [100, 100]],
    sketchTrigger: [[10, 75], [100, 75]],
  },
];

export const PATTERN_NAMES: Record<PatternKey, string> = Object.fromEntries(
  PATTERN_LIBRARY.map((p) => [p.key, p.name]),
) as Record<PatternKey, string>;
