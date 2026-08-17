const fs = require("fs");
const path = require("path");
const zlib = require("zlib");
const crypto = require("crypto");

// Exact approved SBC_INTERACTIVE_GUI_V45_TEST_CLOCK_HANDOFF shell.
// These five base64 chunks are a gzip stream produced directly from the
// original saved V45 HTML. Do not edit the shell here. Any intentional visual
// change should start from the original V45 source artifact and update the
// integrity constants deliberately.
const DIR = path.join(__dirname, "v45_exact_fresh");
const EXPECTED_BYTES = 407262;
const EXPECTED_SHA256 = "06b85e828cb2404b830c648f0d6f3f5832ad15826ffd6f8446700c2683c7d669";

function buildExactV45Shell() {
  const base64 = [0, 1, 2, 3, 4]
    .map((i) => fs.readFileSync(path.join(DIR, `c${i}.b64`), "utf8").trim())
    .join("");

  const gzip = Buffer.from(base64, "base64");
  const html = zlib.gunzipSync(gzip);
  const sha256 = crypto.createHash("sha256").update(html).digest("hex");

  if (html.length !== EXPECTED_BYTES || sha256 !== EXPECTED_SHA256) {
    throw new Error(
      `Exact V45 integrity failure: got ${html.length} bytes ${sha256}; ` +
      `expected ${EXPECTED_BYTES} bytes ${EXPECTED_SHA256}`
    );
  }

  return html;
}

const exactV45Shell = buildExactV45Shell();

module.exports = {
  exactV45Shell,
  EXPECTED_BYTES,
  EXPECTED_SHA256,
};
