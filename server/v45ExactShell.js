const fs = require("fs");
const path = require("path");
const zlib = require("zlib");
const crypto = require("crypto");

const DIR = path.join(__dirname, "v45_exact");
const EXPECTED_BYTES = 407262;
const EXPECTED_SHA256 = "06b85e828cb2404b830c648f0d6f3f5832ad15826ffd6f8446700c2683c7d669";

const REAL_BARS_PATCH_MARKER = "const REAL_BARS_SUPPORTED_TF = new Set(['1m','5m','15m','1h','1D']);";
const GENERATE_OHLC_ANCHOR = "function generateOHLC(sym,tf){";
const REAL_BARS_PATCH_BLOCK = [
  "// Real market data integration. 'tick' has no server-side equivalent, so it",
  "// intentionally always uses the synthetic generator below - everything",
  "// else prefers real bars from the same simulated-quote engine the rest of",
  "// the platform already uses, falling back to the exact original synthetic",
  "// behavior whenever real data isn't ready yet or the fetch fails. This",
  "// fallback is not a temporary measure - it's how the chart stays working",
  "// even if the bars endpoint is ever slow or unreachable.",
  "const REAL_BARS_SUPPORTED_TF = new Set(['1m','5m','15m','1h','1D']);",
  "const realBarsCache = {};",
  "const realBarsInFlight = {};",
  "function mapBarsToChartShape(bars){ return bars.map(b=>({o:b.open,h:b.high,l:b.low,c:b.close,v:b.volume})); }",
  "function ensureRealBars(sym,tf){",
  "  if(!REAL_BARS_SUPPORTED_TF.has(tf))return null;",
  "  const key=sym+':'+tf;",
  "  if(realBarsCache[key])return realBarsCache[key];",
  "  if(!realBarsInFlight[key]){",
  "    realBarsInFlight[key]=fetch(`/api/quotes/bars?symbol=${encodeURIComponent(sym)}&interval=${tf}`)",
  "      .then(r=>{ if(!r.ok)throw new Error('bars fetch failed'); return r.json(); })",
  "      .then(d=>{ realBarsCache[key]=mapBarsToChartShape(d.bars); delete realBarsInFlight[key];",
  "        if(typeof renderSymbolChart==='function')renderSymbolChart(); })",
  "      .catch(()=>{ delete realBarsInFlight[key]; });",
  "  }",
  "  return null;",
  "}",
  "",
].join("\n");

function read(name) {
  return fs.readFileSync(path.join(DIR, name), "utf8").trim();
}

function repairedChunk(index) {
  const n = String(index).padStart(2, "0");
  if (index === 6) {
    return read("fix06_0.b64")
      + read("fix06_1_0.b64") + read("fix06_1_1.b64") + read("fix06_1_2.b64")
      + read("fix06_1_3a.b64") + read("fix06_1_3b.b64")
      + read("fix06_2.b64");
  }
  if ([17, 18, 22].includes(index)) {
    return read(`fix${n}_0.b64`) + read(`fix${n}_1.b64`) + read(`fix${n}_2.b64`);
  }
  return read(`s${n}.b64`);
}

function countOccurrences(haystack, needle) {
  return haystack.split(needle).length - 1;
}

function applyRealChartDataPatch(html) {
  const source = Buffer.isBuffer(html) ? html.toString("utf8") : String(html);
  if (source.includes(REAL_BARS_PATCH_MARKER)) return Buffer.from(source, "utf8");

  const required = [GENERATE_OHLC_ANCHOR, "function timeframeBars", "function renderSymbolChart"];
  for (const token of required) {
    if (countOccurrences(source, token) !== 1) {
      throw new Error(`Exact V45 real-bars patch compatibility failure: expected one ${token}`);
    }
  }

  let patched = source.replace(GENERATE_OHLC_ANCHOR, REAL_BARS_PATCH_BLOCK + GENERATE_OHLC_ANCHOR);
  patched = patched.replace(
    GENERATE_OHLC_ANCHOR,
    GENERATE_OHLC_ANCHOR + "\n  const real=ensureRealBars(sym,tf);\n  if(real&&real.length)return real;"
  );

  if (countOccurrences(patched, REAL_BARS_PATCH_MARKER) !== 1 || countOccurrences(patched, "const real=ensureRealBars(sym,tf);") !== 1) {
    throw new Error("Exact V45 real-bars patch integrity failure");
  }
  if (countOccurrences(patched, "</html>") !== 1) {
    throw new Error("Exact V45 real-bars patch structural failure");
  }
  return Buffer.from(patched, "utf8");
}

function buildExactV45Shell() {
  const chunks = [];
  for (let i = 0; i <= 23; i += 1) chunks.push(repairedChunk(i));
  chunks.push(read("fix24_0.b64") + read("fix24_1.b64"));
  const gzip = Buffer.from(chunks.join(""), "base64");
  const html = zlib.gunzipSync(gzip);
  const sha256 = crypto.createHash("sha256").update(html).digest("hex");
  if (html.length !== EXPECTED_BYTES || sha256 !== EXPECTED_SHA256) {
    throw new Error(`Exact V45 integrity failure: ${html.length} bytes ${sha256}`);
  }
  return applyRealChartDataPatch(html);
}

const exactV45Shell = buildExactV45Shell();

module.exports = {
  exactV45Shell,
  EXPECTED_BYTES,
  EXPECTED_SHA256,
  applyRealChartDataPatch,
  REAL_BARS_PATCH_MARKER,
};
