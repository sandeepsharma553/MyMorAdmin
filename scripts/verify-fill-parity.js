#!/usr/bin/env node
// verify-fill-parity — fails (exit 1) if the two contractFill.js copies are not byte-identical.
// The shared fill+assembly logic MUST be the same in the client (preview) and functions (PDF),
// otherwise preview and the generated PDF can silently diverge. Run in CI / pre-commit.
const fs = require("fs");
const path = require("path");

const CLIENT = path.join(__dirname, "../src/pages/restaurantgroup/contractFill.js");
const FUNCTIONS = path.join(__dirname, "../../../functions/lib/contractFill.js");

function main() {
  for (const p of [CLIENT, FUNCTIONS]) {
    if (!fs.existsSync(p)) { console.error("PARITY FAIL: missing file " + p); process.exit(1); }
  }
  const a = fs.readFileSync(CLIENT);
  const b = fs.readFileSync(FUNCTIONS);
  if (!a.equals(b)) {
    console.error("PARITY FAIL: contractFill.js copies differ —\n  " + CLIENT + "\n  " + FUNCTIONS +
      "\nEdit both copies identically (they are the single source of truth for preview ≡ PDF).");
    process.exit(1);
  }
  console.log("PARITY OK: contractFill.js byte-identical across client + functions (" + a.length + " bytes)");
}
main();
