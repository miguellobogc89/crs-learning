import type { SchemaDiscoveryProposal } from "@/lib/engine/schema-discovery/validation";

export const STRESS_DOCUMENT = `CATÁLOGO: Producto LEC-001 leche entera comprada. Producto AZU-001 azúcar comprado. Producto BAS-001 base blanca fabricada. Producto HEL-001 helado vainilla fabricado. Producto CAC-001 cacao comprado. Producto ARO-001 aroma vainilla comprado.
RECETAS: Receta RB-01 produce BAS-001 con LEC-001 0,75 litros y AZU-001 0,25 kg. Receta RV-01 produce HEL-001 con BAS-001 0,90 kg y ARO-001 0,10 kg. Cada componente tiene cantidad y unidad propias. BAS-001 es producto fabricado y también ingrediente de otra receta.
PROVEEDORES: Lácteos Sur SL NIF B12345678 código PROV-01. Distribuciones Atlántico SL NIF B87654321 código PROV-02. Ambos venden LEC-001.
OFERTAS: OF-LS-01 de PROV-01 para LEC-001 precio 1,40 EUR/litro, vigencia 2026-10-01 a 2026-12-31. Rápel OF-LS-01 desde 10 litros descuento 3%, desde 100 litros descuento 8%, desde 500 litros descuento 12%.
OF-DA-01 de PROV-02 para LEC-001 precio 1,35 EUR/litro, vigencia 2026-10-15 a 2026-11-30. Rápel OF-DA-01 desde 20 litros descuento 2%, desde 200 litros descuento 9%.
OF-DA-02 de PROV-02 para AZU-001 precio 0,90 EUR/kg, vigencia 2026-10-15 a 2026-11-30. Rápel OF-DA-02 desde 50 kg descuento 5%.
CONTEXTO CRS: Ya existen LEC-001 y el proveedor B12345678 como Lácteos Sur SL. Otro documento llama al mismo NIF Lacteos Norte SL: conflicto de identidad que requiere revisión. Los registros independientes no deben bloquearse.`;

export function evaluateStressSchema(proposal: SchemaDiscoveryProposal) {
  const entities = proposal.entities;
  const relations = proposal.relations;
  const label = (e: typeof entities[number]) => [e.key, e.name, e.description].join(" ").toLowerCase();
  const find = (regex: RegExp) => entities.filter(e => regex.test(label(e)));
  const product = find(/producto|product|material|art[ií]culo/);
  const recipe = find(/receta|recipe|f[oó]rmula/)[0];
  const component = find(/componente|component|l[ií]nea.*receta|recipe.*line|ingrediente.*receta/)[0];
  const supplier = find(/proveedor|supplier/).find(e => !/oferta|offer/.test(label(e)));
  const offer = find(/oferta|offer|cotizaci[oó]n|tarifa/)[0];
  const tier = find(/tramo|tier|escal[oó]n|rapel|rappel|descuento.*volumen/)[0];
  const fields = (e: typeof entities[number] | undefined) => e?.fields.map(f => f.key + " " + f.name).join(" ").toLowerCase() ?? "";
  const connected = (a: typeof entities[number] | undefined, b: typeof entities[number] | undefined) =>
    !!a && !!b && relations.some(r => (r.fromEntity === a.key && r.toEntity === b.key) ||
      (r.fromEntity === b.key && r.toEntity === a.key));
  const checks = [
    { name: "Una entidad canónica de producto", pass: product.length === 1 },
    { name: "Sin catálogo separado de ingredientes", pass: !entities.some(e => /^(ingrediente|ingredient|materia_prima|raw_material)$/.test(e.key)) },
    { name: "Entidad receta", pass: !!recipe },
    { name: "Componente intermedio con cantidad y unidad", pass: !!component && /cantidad|quantity/.test(fields(component)) && /unidad|unit/.test(fields(component)) },
    { name: "Proveedor con identidad fiscal", pass: !!supplier && /nif|cif|tax|fiscal/.test(fields(supplier)) },
    { name: "Oferta con precio", pass: !!offer && /precio|price/.test(fields(offer)) },
    { name: "Rápel por tramos y descuentos", pass: !!tier && /cantidad|quantity|m[ií]nim|minimum|desde/.test(fields(tier)) && /descuento|discount|porcentaje|percent/.test(fields(tier)) },
    { name: "Receta vinculada a componentes", pass: connected(recipe, component) },
    { name: "Componente vinculado a producto", pass: connected(component, product[0]) },
    { name: "Receta vinculada al producto resultante", pass: connected(recipe, product[0]) },
    { name: "Proveedor vinculado a oferta", pass: connected(supplier, offer) },
    { name: "Oferta vinculada a producto", pass: connected(offer, product[0]) },
    { name: "Oferta vinculada a tramos", pass: connected(offer, tier) },
  ];
  return { passed: checks.filter(c => c.pass).length, total: checks.length, checks };
}
