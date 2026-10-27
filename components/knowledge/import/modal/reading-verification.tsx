import type { VerificationReport } from "@/lib/knowledge/intake/verifier/contract";

/** Plain-language view of the reading verification. The reading JSON is shown separately and unchanged. */
export function ReadingVerification({ report }: { report: VerificationReport }) {
  const { resumen } = report;
  const clean = !resumen.literales && !resumen.columnas && !resumen.omisiones;
  return <section aria-label="Revisión de la lectura" className="space-y-3 rounded border p-4 text-sm">
    <h3 className="font-medium">Revisión de la lectura contra el documento original</h3>
    <p>{clean ? "No se han encontrado diferencias entre la lectura y el documento." :
      `${resumen.literales} valores distintos o no encontrados, ${resumen.columnas} en otra columna y ${resumen.omisiones} textos del documento que faltan en la lectura.`}
      {resumen.aRevisar > 0 && " Las marcadas «a revisar» proceden de un reconocimiento de imagen, que también puede equivocarse."}
      {resumen.paginasSinReferencia > 0 && ` ${resumen.paginasSinReferencia} página(s) sin verificar.`}</p>
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
