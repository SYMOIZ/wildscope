import * as Cesium from "cesium";
import { cellToBoundary } from "h3-js";

/** One drawable value per H3 cell. `hatched` cells are drawn with the insufficient-effort pattern. */
export interface CellValues {
  ids: string[];
  colors: string[]; // CSS colour per cell, "" for hatched
  hatched: boolean[];
  /** fill: solid cells (global); fill-edged: cells with thin edges (regional); outline: edges only (local). */
  style: "fill" | "fill-edged" | "outline";
}

interface Poly {
  ring: Float64Array; // lon, lat pairs (lon unwrapped across the antimeridian)
  west: number;
  east: number;
  south: number;
  north: number;
  color: string;
  hatched: boolean;
}

const boundaryCache = new Map<string, { ring: Float64Array; west: number; east: number; south: number; north: number }>();

function boundary(id: string) {
  let b = boundaryCache.get(id);
  if (b) return b;
  const pts = cellToBoundary(id); // [lat, lng]
  const ring = new Float64Array(pts.length * 2);
  let crosses = false;
  for (let i = 0; i < pts.length; i++) {
    const d = Math.abs(pts[i][1] - pts[(i + 1) % pts.length][1]);
    if (d > 180) crosses = true;
  }
  let west = Infinity, east = -Infinity, south = Infinity, north = -Infinity;
  for (let i = 0; i < pts.length; i++) {
    let lon = pts[i][1];
    if (crosses && lon < 0) lon += 360;
    const lat = pts[i][0];
    ring[i * 2] = lon;
    ring[i * 2 + 1] = lat;
    west = Math.min(west, lon); east = Math.max(east, lon);
    south = Math.min(south, lat); north = Math.max(north, lat);
  }
  b = { ring, west, east, south, north };
  boundaryCache.set(id, b);
  return b;
}

const BUCKET_DEG = 10;

function hatchPattern(ctx: CanvasRenderingContext2D): CanvasPattern | null {
  // DESIGN_SYSTEM §1.2: 45° lines, bone-500 at 40%, 2 px lines spaced 6 px.
  const c = document.createElement("canvas");
  c.width = c.height = 6;
  const g = c.getContext("2d")!;
  g.strokeStyle = "rgba(124,136,127,0.4)";
  g.lineWidth = 2;
  g.beginPath();
  g.moveTo(0, 6); g.lineTo(6, 0);
  g.moveTo(-3, 3); g.lineTo(3, -3);
  g.moveTo(3, 9); g.lineTo(9, 3);
  g.stroke();
  return ctx.createPattern(c, "repeat");
}

/**
 * Cesium imagery provider that rasterises H3 cells per tile on a canvas (UD-03 default:
 * imagery-layer approach). Cesium drapes it over the globe and handles LOD tiling; cell picking is
 * done separately with h3-js from the picked coordinate, so no geometry is uploaded to the GPU.
 */
export class CellImageryProvider {
  readonly tilingScheme = new Cesium.GeographicTilingScheme();
  readonly tileWidth = 256;
  readonly tileHeight = 256;
  readonly minimumLevel = 0;
  readonly maximumLevel = 12;
  readonly rectangle = this.tilingScheme.rectangle;
  readonly tileDiscardPolicy = undefined;
  readonly errorEvent = new Cesium.Event();
  readonly credit = undefined;
  readonly proxy = undefined;
  readonly hasAlphaChannel = true;
  readonly ready = true;
  readonly readyPromise = Promise.resolve(true);
  private buckets = new Map<string, Poly[]>();
  private style: CellValues["style"];

  constructor(values: CellValues) {
    this.style = values.style;
    for (let i = 0; i < values.ids.length; i++) {
      const b = boundary(values.ids[i]);
      for (const shift of b.east > 180 ? [0, -360] : [0]) {
        const p: Poly = {
          ring: shift ? b.ring.map((v, j) => (j % 2 === 0 ? v + shift : v)) : b.ring,
          west: b.west + shift, east: b.east + shift, south: b.south, north: b.north,
          color: values.colors[i], hatched: values.hatched[i],
        };
        for (let bx = Math.floor(p.west / BUCKET_DEG); bx <= Math.floor(p.east / BUCKET_DEG); bx++) {
          for (let by = Math.floor(p.south / BUCKET_DEG); by <= Math.floor(p.north / BUCKET_DEG); by++) {
            const k = `${bx},${by}`;
            let arr = this.buckets.get(k);
            if (!arr) this.buckets.set(k, (arr = []));
            arr.push(p);
          }
        }
      }
    }
  }

  getTileCredits() {
    return [];
  }

  pickFeatures() {
    return undefined;
  }

  requestImage(x: number, y: number, level: number): Promise<HTMLCanvasElement> {
    const r = this.tilingScheme.tileXYToRectangle(x, y, level);
    const west = Cesium.Math.toDegrees(r.west), east = Cesium.Math.toDegrees(r.east);
    const south = Cesium.Math.toDegrees(r.south), north = Cesium.Math.toDegrees(r.north);
    const canvas = document.createElement("canvas");
    canvas.width = this.tileWidth;
    canvas.height = this.tileHeight;
    const ctx = canvas.getContext("2d")!;
    const sx = this.tileWidth / (east - west);
    const sy = this.tileHeight / (north - south);
    const seen = new Set<Poly>();
    let hatch: CanvasPattern | null = null;
    for (let bx = Math.floor(west / BUCKET_DEG); bx <= Math.floor((east - 1e-9) / BUCKET_DEG); bx++) {
      for (let by = Math.floor(south / BUCKET_DEG); by <= Math.floor((north - 1e-9) / BUCKET_DEG); by++) {
        for (const p of this.buckets.get(`${bx},${by}`) ?? []) {
          if (seen.has(p) || p.east < west || p.west > east || p.north < south || p.south > north) continue;
          seen.add(p);
          ctx.beginPath();
          for (let i = 0; i < p.ring.length; i += 2) {
            const px = (p.ring[i] - west) * sx;
            const py = (north - p.ring[i + 1]) * sy;
            if (i === 0) ctx.moveTo(px, py);
            else ctx.lineTo(px, py);
          }
          ctx.closePath();
          if (p.hatched) {
            hatch ??= hatchPattern(ctx);
            ctx.fillStyle = hatch ?? "rgba(124,136,127,0.25)";
            ctx.fill();
          } else if (this.style === "outline") {
            // Local level: faint tint plus a clear edge, so imagery and record points stay readable.
            ctx.globalAlpha = 0.12;
            ctx.fillStyle = p.color;
            ctx.fill();
            ctx.globalAlpha = 1;
            ctx.strokeStyle = p.color;
            ctx.lineWidth = 1.5;
            ctx.stroke();
          } else {
            ctx.fillStyle = p.color;
            ctx.fill();
            // Close hairline gaps from anti-aliasing; regional level adds a thin dark edge per cell.
            ctx.strokeStyle = this.style === "fill-edged" ? "rgba(6,16,13,0.45)" : p.color;
            ctx.lineWidth = this.style === "fill-edged" ? 0.75 : 0.6;
            ctx.stroke();
          }
        }
      }
    }
    return Promise.resolve(canvas);
  }
}
