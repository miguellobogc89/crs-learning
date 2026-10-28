import type { CellValue, Table } from "@/lib/analytics/compute";
import { catalog, QueryError, runQuery, type Query, type ResultColumn } from "./query";

/**
 * The assistant's access to the workspace's data: the tables of Analítica (base ones and those made from the
 * person's documents), described in the prompt, and one read-only tool to query them. What the model asks to show
 * comes back to the chat as a data block (a table under the answer).
 */
export type DataBlock = {
  id: string;
  titulo: string;
  columnas: ResultColumn[];
  filas: Record<string, CellValue>[];
  total: number;
  truncado: boolean;
  tablas: string[];
};

/** Rows of a result the model reads (enough to reason; the person sees up to DISPLAY_ROWS). */
const MODEL_ROWS = 100;
const DISPLAY_ROWS = 200;
export const DATA_TOOL_NAME = "consultar_datos";

export const CHANGES_TOOL_NAME = "proponer_cambios";

export const dataTool = {
  type: "function" as const,
  name: DATA_TOOL_NAME,
  strict: false,
  description: "Consulta (solo lectura) las tablas de datos del espacio de trabajo: filtrar, cruzar dos tablas, agrupar y calcular sumas, medias, recuentos, mínimos y máximos. Úsala para cualquier pregunta sobre facturas, gastos, ingresos, proveedores, clientes, productos, suministros, consumos o las tablas creadas desde documentos. Puedes llamarla varias veces.",
  parameters: {
    type: "object",
    additionalProperties: false,
    required: ["titulo", "consulta"],
    $defs: {
      join: {
        type: "object", required: ["tabla", "columna_local"],
        properties: {
          tabla: { type: "string" }, columna_local: { type: "string" }, columna_otra: { type: "string" },
          tipo: { type: "string", enum: ["interior", "izquierda"], description: "interior (por defecto): solo filas con pareja; izquierda: todas las de la tabla principal." },
        },
      },
    },
    properties: {
      titulo: { type: "string", description: "Título corto del resultado, en español, para mostrarlo al usuario (p. ej. «Gasto por proveedor en 2026»)." },
      mostrar: { type: "boolean", description: "true si el resultado debe mostrarse al usuario como tabla debajo de la respuesta (listados, rankings, desgloses). false para consultas intermedias o cuando basta con una cifra." },
      consulta: {
        type: "object",
        required: ["tabla"],
        properties: {
          tabla: { type: "string", description: "Clave de la tabla principal (campo «tabla» del catálogo)." },
          cruzar: {
            description: "Cruza con otra tabla (objeto) o con varias en cadena (lista, hasta 4). Une filas cuyo valor coincide (sin distinguir mayúsculas ni tildes); si «columna_local» es una columna de enlace que apunta a esa tabla, se cruza por el propio enlace y «columna_otra» sobra. Las columnas cruzadas se llaman «<tabla>.<columna>» y una tabla posterior puede cruzar por ellas (p. ej. «tabla:equivalencias.producto»).",
            anyOf: [{ $ref: "#/$defs/join" }, { type: "array", items: { $ref: "#/$defs/join" } }],
          },
          filtros: {
            type: "array",
            items: {
              type: "object", required: ["columna", "op"],
              properties: {
                columna: { type: "string", description: "Columna; para fechas también «<columna>:mes» (AAAA-MM), «:trimestre» (AAAA-T1) o «:año» (AAAA)." },
                op: { type: "string", enum: ["=", "!=", "contiene", "no_contiene", ">", ">=", "<", "<=", "entre", "en", "vacio", "no_vacio"] },
                valor: { description: "Valor a comparar. Fechas en formato AAAA-MM-DD." },
                valores: { type: "array", items: {}, description: "Para «entre» [desde, hasta] (incluidos) y para «en» la lista de valores." },
              },
            },
          },
          formulas: {
            type: "array", description: "Columnas calculadas fila a fila (tras cruzar): a op b, con b otra columna o «valor». P. ej. coste = cantidad * precio.",
            items: { type: "object", required: ["nombre", "a", "op"], properties: { nombre: { type: "string" }, a: { type: "string" }, op: { type: "string", enum: ["+", "-", "*", "/"] }, b: { type: "string" }, valor: { type: "number" }, importe: { type: "boolean" } } },
          },
          agrupar_por: { type: "array", items: { type: "string" }, description: "Columnas por las que agrupar (admite «fecha:mes», «fecha:año»…)." },
          calcular: {
            type: "array",
            items: {
              type: "object", required: ["funcion"],
              properties: {
                funcion: { type: "string", enum: ["suma", "media", "cuenta", "cuenta_distintos", "min", "max", "ultimo", "primero"], description: "«ultimo»/«primero»: el valor de la fila más reciente/antigua según «segun» (p. ej. último precio pagado)." },
                columna: { type: "string" },
                segun: { type: "string", description: "Columna de fecha para «ultimo» y «primero»." },
                nombre: { type: "string", description: "Nombre de la columna resultado." },
              },
            },
          },
          columnas: { type: "array", items: { type: "string" }, description: "Sin agrupar: columnas a devolver (por defecto todas las de la tabla principal)." },
          ordenar: { type: "array", items: { type: "object", required: ["columna"], properties: { columna: { type: "string" }, direccion: { type: "string", enum: ["asc", "desc"] } } } },
          limite: { type: "number", description: "Máximo de filas (por defecto 50, máximo 500)." },
        },
      },
    },
  },
};

const COLUMN_SCHEMA = {
  type: "object", required: ["columna", "nombre", "tipo"],
  properties: {
    columna: { type: "string", description: "Clave corta sin espacios (p. ej. «precio»)." },
    nombre: { type: "string", description: "Nombre visible." },
    tipo: { type: "string", enum: ["texto", "texto_largo", "numero", "entero", "importe", "fecha", "si_no", "enlace"] },
    tabla_enlazada: { type: "string", description: "Solo para «enlace»: clave de la tabla a la que apunta (también una creada antes en la misma propuesta, p. ej. «tabla:catalogo»)." },
    completar: { type: "boolean", description: "true si el usuario debe rellenarla cuando quede vacía (p. ej. el producto de una equivalencia que no se pudo enlazar sola). La app le avisará y le dejará completarla en Analítica." },
  },
};

export const changesTool = {
  type: "function" as const,
  name: CHANGES_TOOL_NAME,
  strict: false,
  description: "Propone cambios en las tablas del usuario: crear tablas, añadir columnas (también columnas que enlazan con otra tabla), crear o actualizar filas (a mano o desde una consulta), enlazar filas y borrar filas. NO aplica nada: devuelve una vista previa y el usuario la aplica con un botón. Si hay errores, corrígelos y vuelve a proponer.",
  parameters: {
    type: "object", additionalProperties: false, required: ["titulo", "operaciones"],
    properties: {
      titulo: { type: "string", description: "Título corto de lo que se crea, en lenguaje sencillo (p. ej. «Relación entre ingredientes y productos»)." },
      explicacion: { type: "string", description: "Una frase corta y sencilla: para qué sirve este paso (se muestra en la tarjeta)." },
      pasos_del_objetivo: { type: "array", items: { type: "string" }, description: "Si el objetivo necesita varios pasos: todos los pasos, en orden y en lenguaje sencillo (p. ej. [\"Catálogo de precios por proveedor\", \"Equivalencias entre …\", \"Coste por …\"]). Esta propuesta es solo uno de ellos." },
      paso_actual: { type: "number", description: "Qué paso de «pasos_del_objetivo» es esta propuesta (empezando en 1)." },
      operaciones: {
        type: "array", description: "Se aplican en orden; las siguientes pueden usar tablas y filas creadas por las anteriores.",
        items: {
          type: "object", required: ["op", "tabla"],
          properties: {
            op: { type: "string", enum: ["crear_tabla", "añadir_columnas", "crear_filas", "volcar_consulta", "actualizar_filas", "enlazar", "borrar_filas"] },
            tabla: { type: "string", description: "Tabla afectada. En «crear_tabla», el nombre corto de la nueva (su clave será «tabla:<nombre>»)." },
            nombre: { type: "string", description: "crear_tabla: nombre visible." },
            descripcion: { type: "string", description: "crear_tabla: para qué sirve." },
            titulo: { type: "string", description: "crear_tabla: la columna de texto que nombra cada fila (la que se usa para enlazar con ella)." },
            columnas: { description: "crear_tabla / añadir_columnas: lista de columnas. volcar_consulta: objeto {columna_destino: columna_del_resultado}; si se omite, se usan las columnas del resultado que se llaman igual que las de la tabla (pon en «calcular» el «nombre» de la columna de destino).", anyOf: [{ type: "array", items: COLUMN_SCHEMA }, { type: "object" }] },
            filas: { type: "array", items: { type: "object" }, description: "crear_filas: filas {columna: valor}. En columnas de enlace, el nombre de la fila enlazada." },
            clave: { type: "array", items: { type: "string" }, description: "crear_filas / volcar_consulta: columnas que identifican una fila; si ya existe, se actualiza en vez de duplicarse." },
            consulta: { type: "object", description: "volcar_consulta: una consulta como la de consultar_datos (puede agrupar, calcular «ultimo» precio, cruzar…)." },
            donde: { type: "array", items: { type: "object" }, description: "actualizar_filas / borrar_filas: filtros como los de consultar_datos." },
            valores: { type: "object", description: "actualizar_filas: {columna: valor nuevo}." },
            columna: { type: "string", description: "enlazar: la columna de enlace." },
            pares: { type: "array", items: { type: "object", properties: { fila: { type: "string" }, con: { type: "string" } } }, description: "enlazar: pares {fila: nombre de la fila, con: nombre de la fila enlazada}." },
            por: { type: "object", properties: { columna_origen: { type: "string" }, columna_destino: { type: "string" },
              modo: { type: "string", enum: ["exacto", "contiene", "parecido"], description: "exacto: mismo texto. contiene: todas las palabras del origen están en el destino (p. ej. «leche entera» → «LECHE ENTERA P6»). parecido: la mayoría de las palabras. Para nombres escritos a mano frente a descripciones de factura usa «contiene» y, para los que queden sin pareja, «parecido»." } },
              description: "enlazar: enlaza automáticamente comparando columna_origen con columna_destino de la tabla enlazada (sin distinguir mayúsculas ni tildes)." },
            solo_sin_enlace: { type: "boolean", description: "enlazar: no toca las filas que ya tienen enlace." },
          },
        },
      },
    },
  },
};

export function dataPrompt(tables: Table[], editable: Set<string> = new Set()) {
  return `
# Datos del espacio de trabajo

Además del conocimiento documental, tienes acceso de solo lectura a las tablas de datos del usuario (las mismas de Analítica) mediante la herramienta «${DATA_TOOL_NAME}».

Normas para los datos:
- Sé breve y cercano: respuestas cortas, en prosa, sin títulos ni listas salvo que el usuario pida detalle.
- Para cualquier pregunta sobre cifras, facturas, gastos, ingresos, proveedores, clientes, productos, suministros o consumos, consulta las tablas: nunca inventes ni estimes cifras.
- Puedes cruzar tablas (p. ej. facturas.emisor con empresas.empresa, compras.factura con facturas.numero) y hacer varias consultas seguidas.
- Usa los valores exactos que aparecen en «ejemplos» o en resultados anteriores para filtrar.
- Si el usuario pide ver datos, una lista, un ranking o un desglose, usa mostrar=true: la tabla aparecerá debajo de tu respuesta. No la repitas en markdown; comenta lo relevante (totales, mayores, tendencias) en pocas frases.
- Importes en euros con formato español (1.234,56 €). Fechas como DD/MM/AAAA.
- Si un resultado sale truncado, dilo e indica el total de filas.
- Las afirmaciones basadas en datos no llevan citas [F…]; las citas son solo para el conocimiento documental.
- Si la consulta devuelve un error, corrígela según el mensaje y vuelve a intentarlo.

Construir con los datos (herramienta «${CHANGES_TOOL_NAME}»):
Eres el constructor de datos de la app: la app se construye contigo. Cuando el usuario quiere saber o hacer algo que sus tablas todavía no permiten, piensas tú qué estructura falta, la construyes por pasos y le guías. Nunca esperes a que el usuario te diga qué tablas crear: eso lo decides tú.

Método (piénsalo antes de responder):
1. Objetivo: qué pregunta concreta quiere poder responder el usuario (p. ej. «cuánto cuesta X», «dónde me sale más barato Y», «quién me debe Z»).
2. Qué hace falta para responderla: entidades, relaciones y cifras. Compara con el catálogo de tablas: qué existe ya, qué falta. Si una tabla ya trae una cifra escrita en el documento (p. ej. un coste total impreso), dila como referencia aclarando de dónde sale, pero si la pregunta pide calcularla con datos vivos (precios actuales, comparación entre proveedores) eso no basta: hay que construir lo que falta.
3. Diseña las tablas puente que falten, de lo más básico a lo más elaborado. Tipos habituales:
   - Resumen o catálogo: una fila por entidad, sacada de las transacciones (p. ej. lo que vende cada proveedor y a qué precio).
   - Equivalencias: cuando dos listas nombran lo mismo de forma distinta (lo que escribe el usuario frente a lo que aparece en facturas o documentos); una fila por nombre distinto y una columna de enlace con «completar»: true.
   - Maestro: el concepto genérico que agrupa variantes (el mismo producto en distintos proveedores o formatos), para poder comparar.
   Una tabla por concepto, nombres claros en español; no copies datos que ya existen: enlázalos. Reutiliza lo que ya creaste («creada_con_asistente»).
4. Calidad de los datos, siempre, sin que te lo pidan: duplicados (quédate con el más reciente y dilo), ofertas y descuentos (usa lo que realmente se pagó, p. ej. «precio_pagado» = importe ÷ cantidad, y avisa de las compras con descuento), unidades y formatos de envase (para comparar precios hace falta el precio por kg, litro o unidad; si el formato no se puede deducir, deja una columna «completar»), datos que faltan.
5. Construye POR PASOS: propón SOLO el paso actual (con «pasos_del_objetivo» y «paso_actual»). Cuando el usuario aplique, la app le confirmará lo hecho y le preguntará si seguimos; si dice «sí», «ok», «adelante» o similar, propón el siguiente paso.
6. Prepara la propuesta directamente con «${CHANGES_TOOL_NAME}»; no preguntes antes si quiere que la prepares.
7. CÓMO RESPONDES cuando propones (muy importante):
   - Breve, cercano y positivo: 1-3 frases cortas, sin listas, sin títulos, sin negritas.
   - Empieza en positivo («¡Perfecto!», «¡Claro!», «Muy bien.»).
   - Di en una frase qué vas a crear en este paso y para qué, con palabras sencillas (sin nombres técnicos de columnas).
   - Si hay más pasos, menciónalo de pasada («después seguiremos con…»), sin detallarlos.
   - Si quedará algo por completar o hay una decisión de calidad importante, una frase como mucho.
   - Termina pidiendo su visto bueno: «¿Te parece bien que la cree?».
   - NO describas la tarjeta, ni enumeres tablas, columnas, filas o pasos: la tarjeta ya lo muestra.
   Ejemplo: «¡Perfecto! Para saber cuánto te cuesta cada receta, empezaremos con una tabla que relacione tus ingredientes con los productos que compras; después le añadiremos los precios de cada proveedor. ¿Te parece bien que la cree?»
8. Si para completar los datos haría falta información de fuera (p. ej. precios en webs de otros proveedores), proponlo como mejora futura: ahora mismo no puedes consultar internet.

Detalles técnicos:
- Usa «clave» para que repetir una propuesta actualice en vez de duplicar (así un catálogo se refresca con las compras nuevas).
- «calcular» con «segun»: «ultimo»/«primero» dan el valor de la fila más reciente/antigua (segun una fecha); «del_minimo»/«del_maximo» el de la fila con el valor mínimo/máximo (p. ej. el proveedor más barato: {funcion: "del_minimo", columna: "proveedor", segun: "precio_pagado"}).
- Enlazar por nombre: «enlazar» con «por» y modo «contiene» (todas las palabras) o «parecido»; lo que no se enlace queda para completar.
- Consultas en cadena: «cruzar» admite una lista; una columna de enlace se cruza por el propio enlace (sin «columna_otra»).
- Sintaxis de ejemplo (genérica):
  [{"op":"crear_tabla","tabla":"<nombre>","nombre":"<Nombre visible>","descripcion":"<para qué sirve>","titulo":"<columna que nombra cada fila>","columnas":[{"columna":"<a>","nombre":"<A>","tipo":"texto"},{"columna":"<b>","nombre":"<B>","tipo":"importe"},{"columna":"<c>","nombre":"<C>","tipo":"enlace","tabla_enlazada":"<clave de otra tabla>","completar":true}]},
   {"op":"volcar_consulta","tabla":"<nombre>","consulta":{"tabla":"<tabla origen>","agrupar_por":["<a>"],"calcular":[{"funcion":"ultimo","columna":"<importe>","segun":"<fecha>","nombre":"<b>"}]},"clave":["<a>"]},
   {"op":"enlazar","tabla":"<nombre>","columna":"<c>","por":{"columna_origen":"<a>","columna_destino":"<columna de la otra tabla>","modo":"contiene"}}]
- Solo las tablas creadas con el asistente admiten filas y columnas normales; a las de documentos y a las básicas solo se les pueden añadir columnas de enlace.
- Proponer NO aplica nada. Nunca digas que los cambios están hechos: di que la propuesta está lista para revisar y que se aplica con el botón «Aplicar» de la tarjeta que aparece bajo tu respuesta (y se puede deshacer).
- Una propuesta SOLO existe si en esta respuesta has llamado a «${CHANGES_TOOL_NAME}» y ha devuelto «propuesta mostrada». Si no la has llamado, no hables de ninguna propuesta: llámala.
- Tú no puedes aplicar ni ejecutar cambios. Nunca ofrezcas «continuar con la aplicación»: solo el usuario puede pulsar «Aplicar».
- Si la propuesta devuelve errores, corrígela y vuelve a proponer. Revisa los avisos (filas sin pareja…) y coméntalos.

Sobre qué tablas existen:
- Las tablas que existen son exactamente las del catálogo de abajo. Las preguntas sobre tablas, Analítica o datos se responden con este catálogo, nunca con el conocimiento documental.
- Si el usuario busca una tabla que no está en el catálogo, no existe todavía. Si en la conversación hubo una propuesta «pendiente» que la creaba, dile que pulse «Aplicar» en la tarjeta de ese mensaje (o vuelve a proponerla); si fue «descartada» o «deshecha», ofrécete a proponerla de nuevo.
- Cuando menciones una tabla, enlázala así: [Nombre de la tabla](/analytics?view=tablas&table=<clave de la tabla>).

Catálogo de tablas (JSON):
${JSON.stringify(catalog(tables, editable))}
`.trim();
}

/** Runs one tool call: the text for the model and, when asked to show it, the block for the chat. */
export function executeDataTool(tables: Table[], rawArguments: string, blockId: string): { output: string; block?: DataBlock } {
  let args: { titulo?: string; mostrar?: boolean; consulta?: Query };
  try { args = JSON.parse(rawArguments); } catch { return { output: JSON.stringify({ error: "Argumentos no válidos (JSON)." }) }; }
  if (!args.consulta || typeof args.consulta !== "object") return { output: JSON.stringify({ error: "Falta «consulta»." }) };
  try {
    const result = runQuery(tables, args.consulta);
    const output = JSON.stringify({
      columnas: result.columnas.map(c => ({ columna: c.key, nombre: c.label, tipo: c.kind ?? "text" })),
      filas: result.filas.slice(0, MODEL_ROWS),
      total: result.total,
      ...(result.filas.length > MODEL_ROWS || result.truncado ? { aviso: `Se muestran ${Math.min(result.filas.length, MODEL_ROWS)} de ${result.total} filas.` } : {}),
      ...(args.mostrar ? { mostrado_al_usuario: true } : {}),
    });
    const block = args.mostrar ? {
      id: blockId, titulo: String(args.titulo ?? "Resultado").slice(0, 120), columnas: result.columnas,
      filas: result.filas.slice(0, DISPLAY_ROWS), total: result.total,
      truncado: result.truncado || result.filas.length > DISPLAY_ROWS, tablas: result.tablas,
    } : undefined;
    return { output, block };
  } catch (error) {
    if (error instanceof QueryError) return { output: JSON.stringify({ error: error.message }) };
    throw error;
  }
}

/** Data blocks saved with a message (sources_json.dataBlocks), validated when read back. */
export function extractDataBlocks(value: unknown): DataBlock[] {
  const blocks = value && typeof value === "object" ? (value as { dataBlocks?: unknown }).dataBlocks : undefined;
  if (!Array.isArray(blocks)) return [];
  return blocks.filter((b): b is DataBlock => !!b && typeof b === "object" && typeof (b as DataBlock).id === "string"
    && Array.isArray((b as DataBlock).columnas) && Array.isArray((b as DataBlock).filas));
}
