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
    properties: {
      titulo: { type: "string", description: "Título corto del resultado, en español, para mostrarlo al usuario (p. ej. «Gasto por proveedor en 2026»)." },
      mostrar: { type: "boolean", description: "true si el resultado debe mostrarse al usuario como tabla debajo de la respuesta (listados, rankings, desgloses). false para consultas intermedias o cuando basta con una cifra." },
      consulta: {
        type: "object",
        required: ["tabla"],
        properties: {
          tabla: { type: "string", description: "Clave de la tabla principal (campo «tabla» del catálogo)." },
          cruzar: {
            type: "object", required: ["tabla", "columna_local", "columna_otra"],
            description: "Cruza con otra tabla uniendo filas cuyo valor coincide (sin distinguir mayúsculas ni tildes). Sus columnas pasan a llamarse «<tabla>.<columna>».",
            properties: {
              tabla: { type: "string" }, columna_local: { type: "string" }, columna_otra: { type: "string" },
              tipo: { type: "string", enum: ["interior", "izquierda"], description: "interior (por defecto): solo filas con pareja; izquierda: todas las de la tabla principal." },
            },
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
      titulo: { type: "string", description: "Título corto de la propuesta (p. ej. «Catálogo de productos desde tus compras»)." },
      explicacion: { type: "string", description: "Una o dos frases: qué se consigue." },
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
            columnas: { description: "crear_tabla / añadir_columnas: lista de columnas. volcar_consulta: objeto {columna_destino: columna_del_resultado}.", anyOf: [{ type: "array", items: COLUMN_SCHEMA }, { type: "object" }] },
            filas: { type: "array", items: { type: "object" }, description: "crear_filas: filas {columna: valor}. En columnas de enlace, el nombre de la fila enlazada." },
            clave: { type: "array", items: { type: "string" }, description: "crear_filas / volcar_consulta: columnas que identifican una fila; si ya existe, se actualiza en vez de duplicarse." },
            consulta: { type: "object", description: "volcar_consulta: una consulta como la de consultar_datos (puede agrupar, calcular «ultimo» precio, cruzar…)." },
            donde: { type: "array", items: { type: "object" }, description: "actualizar_filas / borrar_filas: filtros como los de consultar_datos." },
            valores: { type: "object", description: "actualizar_filas: {columna: valor nuevo}." },
            columna: { type: "string", description: "enlazar: la columna de enlace." },
            pares: { type: "array", items: { type: "object", properties: { fila: { type: "string" }, con: { type: "string" } } }, description: "enlazar: pares {fila: nombre de la fila, con: nombre de la fila enlazada}." },
            por: { type: "object", properties: { columna_origen: { type: "string" }, columna_destino: { type: "string" } }, description: "enlazar: enlaza automáticamente cuando el valor de columna_origen coincide con columna_destino de la tabla enlazada (sin distinguir mayúsculas ni tildes)." },
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
- Para cualquier pregunta sobre cifras, facturas, gastos, ingresos, proveedores, clientes, productos, suministros o consumos, consulta las tablas: nunca inventes ni estimes cifras.
- Puedes cruzar tablas (p. ej. facturas.emisor con empresas.empresa, compras.factura con facturas.numero) y hacer varias consultas seguidas.
- Usa los valores exactos que aparecen en «ejemplos» o en resultados anteriores para filtrar.
- Si el usuario pide ver datos, una lista, un ranking o un desglose, usa mostrar=true: la tabla aparecerá debajo de tu respuesta. No la repitas en markdown; comenta lo relevante (totales, mayores, tendencias) en pocas frases.
- Importes en euros con formato español (1.234,56 €). Fechas como DD/MM/AAAA.
- Si un resultado sale truncado, dilo e indica el total de filas.
- Las afirmaciones basadas en datos no llevan citas [F…]; las citas son solo para el conocimiento documental.
- Si la consulta devuelve un error, corrígela según el mensaje y vuelve a intentarlo.

Cambios en los datos (herramienta «${CHANGES_TOOL_NAME}»):
- Puedes proponer reorganizar los datos: crear tablas nuevas (p. ej. un catálogo de productos por proveedor con su último precio, sacado de las compras con «volcar_consulta»), añadir columnas que enlazan una tabla con otra (p. ej. cada ingrediente de una receta con su producto del catálogo) y crear, actualizar, enlazar o borrar filas.
- Antes de proponer, consulta los datos para conocer los valores reales. Usa «clave» para que repetir la propuesta actualice en vez de duplicar.
- Solo las tablas creadas con el asistente admiten filas y columnas normales; a las de documentos y a las básicas solo se les pueden añadir columnas de enlace.
- Proponer NO aplica nada. Nunca digas que los cambios están hechos: di que la propuesta está lista para revisar y que se aplica con el botón «Aplicar» (y se puede deshacer).
- Si la propuesta devuelve errores, corrígela y vuelve a proponer. Revisa los avisos (filas sin pareja…) y coméntalos.

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
