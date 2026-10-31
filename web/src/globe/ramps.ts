import type { Lens } from "../data/types";

// DESIGN_SYSTEM §1.2: 7-stop sequential ramps (lightness increases with value).
export const RAMPS: Record<Lens, string[]> = {
  trees: ["#16352A", "#1F5B3D", "#3A8450", "#69A85A", "#9CC96B", "#C9E58B", "#EFF8B8"],
  animals: ["#2A2144", "#4A2B6B", "#7A3A86", "#B04D83", "#DE7A7E", "#F5AC85", "#FFE0A8"],
};

/**
 * Seven classes on a log scale from the active layer's quantiles (Legend: "breaks computed from the
 * active layer quantiles"). Returns ascending lower bounds; class k holds values >= breaks[k].
 */
export function computeBreaks(values: number[]): number[] {
  const v = values.filter((x) => x > 0).sort((a, b) => a - b);
  if (!v.length) return [];
  const logs = v.map(Math.log);
  const lo = logs[0];
  const hi = logs[logs.length - 1];
  if (hi - lo < 1e-9) return [v[0]];
  // Equal steps in log space between the 2nd and 98th percentile keep outliers from flattening the ramp.
  const q = (p: number) => logs[Math.min(logs.length - 1, Math.floor(p * (logs.length - 1)))];
  const a = q(0.02);
  const b = q(0.98) > a ? q(0.98) : hi;
  const breaks = [v[0]];
  for (let k = 1; k < 7; k++) breaks.push(Math.exp(a + ((b - a) * k) / 7));
  // Integers for counts; keep strictly increasing.
  const isCount = v.every(Number.isInteger);
  const out: number[] = [];
  for (const x of breaks) {
    const y = isCount ? Math.max(1, Math.round(x)) : x;
    if (!out.length || y > out[out.length - 1]) out.push(y);
  }
  return out;
}

export function classOf(value: number, breaks: number[]): number {
  let k = 0;
  for (let i = 0; i < breaks.length; i++) if (value >= breaks[i]) k = i;
  // Spread classes over the 7 stops when there are fewer breaks than stops.
  return breaks.length >= 7 ? k : Math.round((k * 6) / Math.max(1, breaks.length - 1));
}
