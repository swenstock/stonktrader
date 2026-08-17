const crypto = require('crypto');
const {
  exactV45Shell,
  EXPECTED_BYTES,
  EXPECTED_SHA256,
} = require('./v45ExactShell');

const sha = crypto.createHash('sha256').update(exactV45Shell).digest('hex');
if (exactV45Shell.length !== EXPECTED_BYTES) {
  throw new Error(`V45 byte mismatch: ${exactV45Shell.length} != ${EXPECTED_BYTES}`);
}
if (sha !== EXPECTED_SHA256) {
  throw new Error(`V45 SHA mismatch: ${sha} != ${EXPECTED_SHA256}`);
}

const text = exactV45Shell.toString('utf8');
for (const marker of [
  'WELCOME TO STONK BROKER',
  'YOUR ENTRIES',
  'NOW VIEWING',
  'TEST CLOCK',
  "DON'T SHOW THIS INTRO AGAIN",
  'TICKET EXCHANGE',
  'MY CONTESTS',
]) {
  if (!text.includes(marker)) throw new Error(`V45 shell marker missing: ${marker}`);
}

console.log(`Exact V45 verified: ${EXPECTED_BYTES} bytes ${EXPECTED_SHA256}`);
