/* Compare the catalogue browser's EXACT readiness/price calculations using real
 * read-only template snapshots. Input JSON on stdin:
 * { full: [...], compact: [...], printOptions: [...] }
 * Use via: NODE_ENV=test node scripts/check-catalogue-parity.cjs < /tmp/...json
 */
process.env.NODE_ENV = process.env.NODE_ENV || "test";
require("@babel/register")({
  presets: ["react-app"],
  extensions: [".js", ".jsx"],
  ignore: [/node_modules/],
});
const fs = require("fs");
const { templateReadiness, templateImage } = require("../src/lib/templateReadiness");
const { creatorCatalogueColours, creatorCatalogueSizes, creatorCataloguePrintMethods } = require("../src/lib/creatorCatalogue");

const { full = [], compact = [], printOptions = [] } = JSON.parse(fs.readFileSync(0, "utf8"));
const byId = new Map(compact.map((row) => [String(row.id), row]));
const failures = [];
const summarise = (row) => {
  const readiness = templateReadiness(row, printOptions);
  return {
    isLaunchReady: readiness.isLaunchReady,
    blankCost: readiness.blankCost,
    checks: readiness.checks,
    pricingReady: readiness.pricingReady,
    methods: creatorCataloguePrintMethods(row, printOptions),
    sizes: creatorCatalogueSizes(row),
    colours: creatorCatalogueColours(row),
    image: templateImage(row),
    bands: readiness.bands.map((b) => [b.size_band, b.method, b.estimated_print_cost]),
  };
};

for (const original of full) {
  const current = byId.get(String(original.id));
  if (!current) { failures.push({ id: original.id, field: "missing" }); continue; }
  const before = summarise(original);
  const after = summarise(current);
  for (const key of Object.keys(before)) {
    if (JSON.stringify(before[key]) !== JSON.stringify(after[key])) {
      failures.push({ id: original.id, field: key });
    }
  }
}
console.log("Templates checked:", full.length);
console.log("Mismatch count:", failures.length);
if (failures.length) {
  console.log("Mismatches (template ID + field):", JSON.stringify(failures.slice(0, 60), null, 2));
  process.exitCode = 1;
} else {
  console.log("EXACT BROWSER READINESS, PRICING AND CARD PARITY: PASS");
}
