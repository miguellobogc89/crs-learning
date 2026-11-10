import test from "node:test";
import assert from "node:assert/strict";
import { load } from "./helpers.mjs";

const { parseFeed, titleKey, plain } = load("lib/trading/news/feed.ts");
const { normalizeClassification, classifyInstructions, classifyInput } = load("lib/trading/news/classify.ts");
const { buildSources, googleNews } = load("lib/trading/news/sources.ts");

const GOOGLE = `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel><title>"Iberdrola" - Google Noticias</title>
<item><title>Iberdrola gana un 12% más hasta septiembre - Expansión</title><link>https://news.google.com/rss/articles/CBMiAAA?oc=5</link>
<guid isPermaLink="false">CBMiAAA</guid><pubDate>Mon, 09 Nov 2026 07:30:00 GMT</pubDate>
<description>&lt;a href="https://news.google.com/rss/articles/CBMiAAA?oc=5" target="_blank"&gt;Iberdrola gana un 12% más hasta septiembre&lt;/a&gt;&amp;nbsp;&amp;nbsp;&lt;font color="#6f6f6f"&gt;Expansión&lt;/font&gt;</description>
<source url="https://www.expansion.com">Expansión</source></item>
<item><title>Sin enlace</title></item>
</channel></rss>`;

const RSS = `<rss><channel><item><title><![CDATA[Bitcoin tops $100K as ETF inflows surge]]></title>
<link>https://www.coindesk.com/markets/2026/11/09/bitcoin</link><pubDate>Mon, 09 Nov 2026 10:00:00 +0000</pubDate>
<dc:creator><![CDATA[Jane Doe]]></dc:creator><description><![CDATA[<p>Spot <b>bitcoin</b> ETFs drew &#36;1.2B &amp; more.</p>]]></description></item></channel></rss>`;

const ATOM = `<feed xmlns="http://www.w3.org/2005/Atom"><entry><title>Ethereum upgrade goes live</title>
<link rel="alternate" href="https://example.com/eth"/><link rel="enclosure" href="https://example.com/img.png"/>
<updated>2026-11-09T12:00:00Z</updated><summary>Ether &amp;lt;3 devs</summary></entry></feed>`;

test("lee Google Noticias: quita el medio del titular y la entradilla repetida", () => {
  const [a, ...rest] = parseFeed(GOOGLE);
  assert.equal(rest.length, 0, "descarta lo que no tiene enlace");
  assert.equal(a.title, "Iberdrola gana un 12% más hasta septiembre");
  assert.equal(a.publisher, "Expansión");
  assert.equal(a.snippet, "");
  assert.equal(a.publishedAt.toISOString(), "2026-11-09T07:30:00.000Z");
});

test("lee RSS con CDATA y HTML, y Atom", () => {
  const [b] = parseFeed(RSS);
  assert.equal(b.title, "Bitcoin tops $100K as ETF inflows surge");
  assert.equal(b.snippet, "Spot bitcoin ETFs drew $1.2B & more.");
  assert.equal(b.publisher, "Jane Doe");
  const [c] = parseFeed(ATOM);
  assert.equal(c.url, "https://example.com/eth");
  assert.equal(c.title, "Ethereum upgrade goes live");
  assert.equal(plain("Caf&eacute; &amp; t&#233;"), "Café & té");
  assert.equal(titleKey("¡Iberdrola GANA un 12%!"), titleKey("iberdrola gana un 12"));
});

test("fuentes: una búsqueda por valor, la general y las de crypto", () => {
  const s = buildSources([
    { symbol: "^IBEX", name: "IBEX 35", isIndex: true },
    { symbol: "SAN.MC", name: "Banco Santander", isIndex: false },
  ]);
  assert.ok(s.some((x) => x.hint === "SAN.MC" && x.url.includes("news.google.com")));
  assert.ok(!s.some((x) => x.hint === "^IBEX"));
  assert.ok(s.filter((x) => x.market === "crypto").length >= 4);
  assert.match(googleNews("x"), /when%3A2d/);
});

test("clasificación: se limpian símbolos, rangos y respuestas que faltan", () => {
  const items = [
    { id: "a", market: "bolsa", title: "t", snippet: "", publisher: null, hints: ["SAN.MC"] },
    { id: "b", market: "crypto", title: "t", snippet: "", publisher: null, hints: [] },
    { id: "c", market: "crypto", title: "t", snippet: "", publisher: null, hints: [] },
  ];
  const raw = {
    items: [
      { id: "a", relevant: true, symbols: ["san.mc", "INVENTADO", "SAN.MC"], category: "resultados", sentiment: 5, impact: 7, summary: "  Santander   gana más ". padEnd(10) },
      { id: "b", relevant: true, symbols: ["NOEXISTE"], category: "rara", sentiment: -1, impact: 2, summary: "x" },
      { id: "zzz", relevant: true, symbols: ["BTC"], category: "otro", sentiment: 0, impact: 1, summary: "x" },
    ],
  };
  const { results, missing } = normalizeClassification(raw, items, new Set(["SAN.MC", "BTC", "CRYPTO"]));
  const a = results.find((r) => r.id === "a");
  assert.deepEqual(a.symbols, ["SAN.MC"]);
  assert.equal(a.sentiment, 2);
  assert.equal(a.impact, 3);
  assert.equal(a.summary, "Santander gana más");
  const b = results.find((r) => r.id === "b");
  assert.equal(b.relevant, false, "sin símbolos válidos no es relevante");
  assert.equal(b.category, "otro");
  assert.deepEqual(missing, ["c"]);
  assert.match(classifyInstructions([{ symbol: "SAN.MC", name: "Banco Santander" }]), /SAN\.MC: Banco Santander/);
  assert.ok(JSON.parse(classifyInput(items)).length === 3);
});
