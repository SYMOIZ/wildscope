// Scientific-integrity wording lint (SI-01..SI-04, AC-041/AC-043/AC-046).
// Fails if UI or API source contains forbidden words. The conservation chip (EX/EW) is cut from
// this release, so "extinct" is forbidden everywhere.
import fs from "node:fs";
import path from "node:path";

const roots = ["src", "index.html", "../lambda"];
const rules = [
  { re: /extinct/i, why: "SI-02: only an IUCN EX/EW chip may say this" },
  { re: /vanish/i, why: "SI-01/UN-03: records are not presence or absence" },
  { re: /\brange\b/i, why: "SI-04: computed extents are never called a range" },
  { re: /\bdistribution\b/i, why: "SI-04" },
  { re: /\bhabitat\b/i, why: "SI-04" },
  { re: /\bdisappeared\b|\bnone live\b|\bfirst appeared\b|\bdiscovered\b|\bpopulation\b/i, why: "content style / SI-07" },
];
// SI-02: IUCN category names (incl. EX/EW) may appear only in the conservation chip module.
const allowExtinct = /components[\\/]Conservation\.tsx$/;
let bad = 0;

function check(p) {
  fs.readFileSync(p, "utf8").split(/\r?\n/).forEach((line, i) => {
    for (const r of rules) {
      if (r.re === rules[0].re && allowExtinct.test(p)) continue;
      if (r.re.test(line)) {
        console.error(`${p}:${i + 1}: "${line.trim()}" (${r.why})`);
        bad++;
      }
    }
  });
}

function walk(p) {
  if (!fs.existsSync(p)) return;
  if (fs.statSync(p).isFile()) return check(p);
  for (const e of fs.readdirSync(p, { withFileTypes: true })) {
    const q = path.join(p, e.name);
    if (e.isDirectory()) {
      if (!["node_modules", "dist", "__pycache__", ".build"].includes(e.name)) walk(q);
    } else if (/\.(tsx?|py|css|html)$/.test(e.name)) {
      check(q);
    }
  }
}

roots.forEach(walk);
if (bad) {
  console.error(`wording lint: ${bad} problem(s)`);
  process.exit(1);
}
console.log("wording lint: ok");
