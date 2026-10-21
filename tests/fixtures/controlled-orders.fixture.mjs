// Frozen controlled case reconstructed from CRS_Prueba_Controlada_Pedidos.pdf.
// Synthetic identifiers only. No API, Prisma, network or database needed.
const customers = [
  ["C-01","Ferretería Sol","Sevilla"],
  ["C-02","Taller Norte","Córdoba"],
  ["C-03","Obras Vega","Huelva"],
];
const products = [
  ["A-10","Tornillo M6"],["A-20","Arandela M6"],
  ["A-30","Guante de trabajo"],["A-40","Cinta aislante"],
];
const orders = [
  ["P-1001","05/10/2026","C-01",[["A-10","0.25",40,"10.00"],["A-20","0.10",40,"4.00"]],"14.00"],
  ["P-1002","06/10/2026","C-02",[["A-30","3.50",6,"21.00"],["A-40","1.80",4,"7.20"]],"28.20"],
  ["P-1003","07/10/2026","C-01",[["A-40","1.80",10,"18.00"],["A-10","0.25",100,"25.00"]],"43.00"],
  ["P-1004","08/10/2026","C-03",[["A-20","0.10",200,"20.00"],["A-30","3.50",10,"35.00"]],"55.00"],
  ["P-1005","09/10/2026","C-02",[["A-10","0.25",80,"20.00"],["A-30","3.50",2,"7.00"],["A-40","1.80",5,"9.00"]],"36.00"],
];
const sourceParts = ["Comercial Albor - Copias de pedidos"];
const rows = [{entity:"business",values:{name:"Comercial Albor"},evidence:sourceParts[0]}];
for (const [code,name,locality] of customers) {
  const evidence = `Destinatario: ${name} | Código cliente: ${code} | Localidad: ${locality}`;
  rows.push({entity:"customer",values:{code,name,locality},evidence});
}
for (const [ref,name] of products) {
  const evidence = orders.flatMap(o=>o[3]).map(item=>[item[0],products.find(p=>p[0]===item[0])?.[1],...item.slice(1)].join(" ")).find(s=>s.startsWith(ref+" ")) ;
  rows.push({entity:"product",values:{name},evidence});
}
for (const [number,date,customerCode,items,total] of orders) {
  const [code,name,locality] = customers.find(c=>c[0]===customerCode);
  const lines = items.map(([ref,price,qty,subtotal])=>`${ref} ${products.find(p=>p[0]===ref)[1]} ${price} ${qty} ${subtotal}`);
  const evidence = [`Pedido ${number} | ${date}`,
    `Destinatario: ${name} | Código cliente: ${code} | Localidad: ${locality}`,
    "Ref. Artículo Precio unitario Unidades Subtotal",...lines,`TOTAL ${total}`].join("\n");
  sourceParts.push(evidence);
  rows.push({entity:"order",values:{number,date,customer_code:code,recipient_name:name,locality,total,currency:"euros"},evidence});
  items.forEach(([ref,price,qty,subtotal],i)=>{
    rows.push({entity:"order_line",values:{order_number:number,ref,product_name:products.find(p=>p[0]===ref)[1],
      unit_price:price,quantity:String(qty),subtotal,currency:"euros"},evidence:lines[i]});
  });
}
const note = "Documentos comerciales emitidos en octubre de 2026. Importes en euros.";
sourceParts.push(note);
rows.push({entity:"order_context",values:{period_label:"octubre de 2026",currency_note:"Importes en euros."},evidence:note});
export const source = sourceParts.join("\n");
export const extractedRows = rows;
export const proposal = { entities:[], warnings:[], relations:[
  ["business_to_order","business","order"],
  ["customer_to_order","customer","order"],
  ["order_to_order_line","order","order_line"],
  ["order_line_to_product","order_line","product"],
  ["business_to_customer","business","customer"],
].map(([key,fromEntity,toEntity])=>({key,fromEntity,toEntity,cardinality:"one_to_many",description:"fixture",evidence:[]})) };
export const expected = {
  customer_to_order:5, order_to_order_line:11, order_line_to_product:11,
  business_to_order:0,business_to_customer:0,
};
