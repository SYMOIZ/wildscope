import * as K from "../config/interaction";
import { editDistanceAtMost1, fold } from "./format";
import type { SearchEntry } from "./types";

/** INTERACTION §7 precedence: exact scientific, exact vernacular, prefix, fuzzy (edit distance <= 1). */
export function rankSpecies(entries: SearchEntry[], query: string): SearchEntry[] {
  const q = fold(query.trim());
  const scored: { e: SearchEntry; s: number }[] = [];
  for (const e of entries) {
    const sci = fold(e[1]);
    const verns = e[2].map(fold);
    let s = -1;
    if (sci === q) s = 0;
    else if (verns.includes(q)) s = 1;
    else if (sci.startsWith(q) || verns.some((v) => v.startsWith(q))) s = 2;
    else if ([sci, ...verns].some((n) => n.split(/[\s-]+/).some((w) => w.startsWith(q)))) s = 3;
    else if (q.length >= 4 && [sci, ...verns].some((n) => editDistanceAtMost1(n, q))) s = 4;
    if (s >= 0) scored.push({ e, s });
  }
  scored.sort((a, b) => a.s - b.s || b.e[5] - a.e[5] || a.e[1].localeCompare(b.e[1]));
  return scored.slice(0, K.MAX_SPECIES_RESULTS).map((x) => x.e);
}
