// lib/trading/news/feed.ts
// Lector mínimo de RSS 2.0 y Atom, sin dependencias. Solo extrae lo que hace falta:
// titular, enlace, fecha, entradilla y medio. Incluye el formato de Google Noticias
// ("Titular - Medio" y la etiqueta <source>).

export type FeedItem = {
  title: string;
  url: string;
  publishedAt: Date | null;
  snippet: string;
  publisher: string | null;
};

const ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  laquo: "«",
  raquo: "»",
  hellip: "…",
  mdash: "—",
  ndash: "–",
  euro: "€",
  rsquo: "’",
  lsquo: "‘",
  rdquo: "”",
  ldquo: "“",
};

export function decodeEntities(s: string) {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, code: string) => {
    if (code[0] === "#") {
      const n = code[1].toLowerCase() === "x" ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
      return Number.isFinite(n) && n > 0 && n < 0x110000 ? String.fromCodePoint(n) : m;
    }
    const known = ENTITIES[code.toLowerCase()];
    if (known !== undefined) return known;
    // Letras acentuadas habituales (&aacute; …).
    const acc = /^([aeiouAEIOUnN])(acute|tilde|uml|grave)$/.exec(code);
    if (acc) {
      const map: Record<string, string> = { acute: "́", tilde: "̃", uml: "̈", grave: "̀" };
      return (acc[1] + map[acc[2]]).normalize("NFC");
    }
    return m;
  });
}

/** Texto plano: quita CDATA, etiquetas HTML y espacios sobrantes. */
export function plain(s: string | null | undefined) {
  if (!s) return "";
  let t = s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1");
  t = decodeEntities(t); // Algunas entradillas vienen con el HTML escapado.
  t = t.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ");
  return decodeEntities(t).replace(/\s+/g, " ").trim();
}

function tag(block: string, name: string) {
  const re = new RegExp(`<(?:[a-z0-9]+:)?${name}(?:\\s[^>]*)?>([\\s\\S]*?)</(?:[a-z0-9]+:)?${name}>`, "i");
  return re.exec(block)?.[1] ?? null;
}
function attr(block: string, name: string, attribute: string, where?: (tagText: string) => boolean) {
  const re = new RegExp(`<(?:[a-z0-9]+:)?${name}\\b[^>]*>`, "gi");
  for (const m of block.matchAll(re)) {
    if (where && !where(m[0])) continue;
    const a = new RegExp(`${attribute}\\s*=\\s*"([^"]*)"|${attribute}\\s*=\\s*'([^']*)'`, "i").exec(m[0]);
    if (a) return a[1] ?? a[2] ?? null;
  }
  return null;
}

function date(s: string | null) {
  if (!s) return null;
  const d = new Date(plain(s));
  return Number.isNaN(d.getTime()) ? null : d;
}

export function parseFeed(xml: string): FeedItem[] {
  const out: FeedItem[] = [];
  const blocks = [...xml.matchAll(/<item\b[\s\S]*?<\/item>/gi)].map((m) => m[0]);
  const atom = blocks.length === 0;
  const entries = atom ? [...xml.matchAll(/<entry\b[\s\S]*?<\/entry>/gi)].map((m) => m[0]) : blocks;
  for (const b of entries) {
    let title = plain(tag(b, "title"));
    let url = atom
      ? attr(b, "link", "href", (t) => !/rel\s*=\s*["'](?!alternate)/i.test(t)) ?? ""
      : plain(tag(b, "link")) || plain(tag(b, "guid"));
    url = decodeEntities(url.trim());
    if (!title || !/^https?:\/\//i.test(url)) continue;
    let publisher = plain(tag(b, "source")) || null;
    // Google Noticias: «Titular - Medio».
    if (publisher && title.endsWith(` - ${publisher}`)) title = title.slice(0, -publisher.length - 3).trim();
    const snippetRaw = plain(tag(b, "description") ?? tag(b, "summary") ?? tag(b, "content"));
    let snippet = snippetRaw;
    // En Google Noticias la entradilla repite el titular y el medio: no aporta.
    if (publisher && snippet.startsWith(title)) snippet = "";
    if (snippet.length > 600) snippet = `${snippet.slice(0, 597).trimEnd()}…`;
    if (!publisher) publisher = plain(tag(b, "creator")) || null;
    out.push({
      title: title.slice(0, 500),
      url: url.slice(0, 2000),
      publishedAt: date(tag(b, "pubDate") ?? tag(b, "published") ?? tag(b, "updated") ?? tag(b, "date")),
      snippet,
      publisher: publisher ? publisher.slice(0, 120) : null,
    });
  }
  return out;
}

/** Clave para detectar la misma noticia publicada por varias búsquedas. */
export function titleKey(title: string) {
  return title
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .slice(0, 160);
}
