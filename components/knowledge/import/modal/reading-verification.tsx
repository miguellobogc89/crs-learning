import type { VerificationReport } from "@/lib/knowledge/intake/verifier/contract";
import type { ValuesReport } from "@/lib/knowledge/intake/verifier/values";

/** Targeted batches: only the extracted values were checked against the base reading of their pages. */
function ValuesVerification({ report }: { report: ValuesReport }) {
  const { resumen } = report;
  return <section aria-label="Revisión de los datos extraídos" className="space-y-3 rounded border p-4 text-sm">
    <h3 className="font-medium">Revisión de los datos extraídos contra el documento</h3>
    <p>{resumen.comprobados} valores comprobados: {resumen.distintos + resumen.noEncontrados === 0 ? "todos coinciden con el documento." :
      `${resumen.distintos} distintos y ${resumen.noEncontrados} no encontrados en su página.`}
      {resumen.faltan > 0 && ` ${resumen.faltan} campo(s) obligatorio(s) no aparecen.`}
      {resumen.aRevisar > 0 && " Las marcadas «a revisar» se comparan con un reconocimiento de imagen, que también puede equivocarse."}</p>
    {report.archivos.filter(f => f.hallazgos.length || f.faltan.length || f.avisos.length).map(file => <div key={file.archivoId} className="space-y-1">
      <h4 className="font-medium">{file.archivo}</h4>
      <ul className="list-disc pl-5">{file.hallazgos.map((h, i) => <li key={i}>{h.parte} {h.campo}: {h.estado === "no_encontrado"
        ? `«${h.valor}» no aparece en ${h.pagina ? `la página ${h.pagina}` : "sus páginas"}`
        : `la extracción dice «${h.valor}» y el documento «${h.documento ?? (h.diferencias ?? []).map(d => d.documento).join(" ")}»`} · {h.severidad === "probable_error" ? "probable error" : "a revisar"}</li>)}</ul>
      {file.faltan.length > 0 && <p className="text-muted-foreground">No aparecen: {file.faltan.map(f => `${f.parte} ${f.campo}`).join(", ")}</p>}
      {file.avisos.length > 0 && <ul className="list-disc pl-5 text-muted-foreground">{file.avisos.map((a, i) => <li key={i}>{a}</li>)}</ul>}
    </div>)}
  </section>;
}

/** Plain-language view of the reading verification. The reading JSON is shown separately and unchanged. */
export function ReadingVerification({ report: input }: { report: VerificationReport | ValuesReport }) {
  if ("modo" in input && input.modo === "valores") return <ValuesVerification report={input} />;
  const report = input as VerificationReport;
  const { resumen } = report;
  const clean = !resumen.literales && !resumen.columnas && !resumen.omisiones && !resumen.paginasDesordenadas;
  return <section aria-label="Revisión de la lectura" className="space-y-3 rounded border p-4 text-sm">
    <h3 className="font-medium">Revisión de la lectura contra el documento original</h3>
    <p>{clean ? "No se han encontrado diferencias entre la lectura y el documento." :
      `${resumen.literales} valores distintos o no encontrados, ${resumen.columnas} en otra columna y ${resumen.omisiones} textos del documento que faltan en la lectura.`}
      {resumen.aRevisar > 0 && " Las marcadas «a revisar» proceden de un reconocimiento de imagen, que también puede equivocarse."}
      {resumen.paginasSinReferencia > 0 && ` ${resumen.paginasSinReferencia} página(s) sin verificar.`}
      {resumen.paginasDesordenadas > 0 && ` La lectura ha cambiado el orden de ${resumen.paginasDesordenadas} página(s).`}</p>
    {report.archivos.map(file => <div key={file.archivoId} className="space-y-2">
      <h4 className="font-medium">{file.archivo}</h4>
      {file.paginas.map(page => {
        const tag = page.referencia === "capa_texto" ? "probable error" : "a revisar";
        const items = [
          ...page.literales.map(l => l.estado === "no_encontrado" ? `${l.donde}: «${l.modelo}» no aparece en el documento`
            : l.documento === undefined
              ? `${l.donde}: ${(l.diferencias ?? []).map(d => d.documento ? `la lectura dice «${d.modelo}» y el documento «${d.documento}»` : `«${d.modelo}» no aparece en el documento`).join("; ")}`
              : `${l.donde}: la lectura dice «${l.modelo}» y el documento «${l.documento}»`),
          ...page.columnas.map(c => `${c.donde}: «${c.valor}» está bajo «${c.columnaDocumento}», no bajo «${c.columnaLectura}»`),
          ...page.omisiones.map(o => `Falta en la lectura: «${o.textoDocumento}»`),
        ];
        const source = page.referencia === "capa_texto" ? "texto del PDF" : page.referencia === "ocr" ? "reconocimiento de imagen" : "sin lectura independiente";
        return <div key={page.numero}>
          <p className="text-muted-foreground">Página {page.numero} · comparada con {source}{items.length ? ` · ${tag}` : ""}</p>
          {items.length > 0 && <ul className="list-disc pl-5">{items.map((text, i) => <li key={i}>{text}</li>)}</ul>}
          {page.avisos.length > 0 && <ul className="list-disc pl-5 text-muted-foreground">{page.avisos.map((text, i) => <li key={i}>{text}</li>)}</ul>}
        </div>;
      })}
    </div>)}
  </section>;
}
