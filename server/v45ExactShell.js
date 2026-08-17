const fs = require("fs");
const path = require("path");
const zlib = require("zlib");
const crypto = require("crypto");

const DIR = path.join(__dirname, "v45_exact");
const EXPECTED_BYTES = 407262;
const EXPECTED_SHA256 = "06b85e828cb2404b830c648f0d6f3f5832ad15826ffd6f8446700c2683c7d669";

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
  return html;
}

const exactV45Shell = buildExactV45Shell();

module.exports = {
  exactV45Shell,
  EXPECTED_BYTES,
  EXPECTED_SHA256,
};
