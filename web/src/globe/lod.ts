import * as K from "../config/interaction";
import type { Lod } from "../state/store";

/** Zoom level from camera height with 10% hysteresis around each threshold (INTERACTION §2). */
export function heightToLod(height: number, current: Lod): Lod {
  const up = (t: number) => height < t * (1 - K.LOD_HYSTERESIS);
  const down = (t: number) => height > t * (1 + K.LOD_HYSTERESIS);
  const target: Lod = height >= K.LOD_L0_MIN_HEIGHT_M ? 0 : height >= K.LOD_L2_MAX_HEIGHT_M ? 1 : 2;
  if (target === current) return current;
  if (current === 0) return up(K.LOD_L0_MIN_HEIGHT_M) ? (up(K.LOD_L2_MAX_HEIGHT_M) ? 2 : 1) : 0;
  if (current === 2) return down(K.LOD_L2_MAX_HEIGHT_M) ? (down(K.LOD_L0_MIN_HEIGHT_M) ? 0 : 1) : 2;
  if (down(K.LOD_L0_MIN_HEIGHT_M)) return 0;
  if (up(K.LOD_L2_MAX_HEIGHT_M)) return 2;
  return 1;
}
