import { LIVE_DEBOUNCE_MS } from "../config/interaction";
import { fetchRecordsInView, matchSpecies, type Bbox } from "../data/gbif";
import { globeApi } from "../globe/Globe";
import { useStore } from "./store";

/** Round outward to 3 decimals so tiny camera jitter does not trigger new requests. */
function snap(b: Bbox): Bbox {
  const r = (x: number, up: boolean) => (up ? Math.ceil(x * 1000) : Math.floor(x * 1000)) / 1000;
  return { west: r(b.west, false), south: r(b.south, false), east: r(b.east, true), north: r(b.north, true) };
}

/**
 * Keeps `live` in the store in step with the view at the local zoom level (L2): records of the active
 * lens/group/bin (or species) inside the view rectangle, from the GBIF occurrence API.
 */
export function startLiveSync(): () => void {
  let timer = 0;
  let ctrl: AbortController | null = null;
  let lastKey = "";

  const run = async () => {
    const s = useStore.getState();
    if (s.lod !== 2 || !s.manifest || s.lens !== "animals") {
      if (s.live.status !== "idle") s.set({ live: { status: "idle", result: null, error: null, bbox: null } });
      lastKey = "";
      return;
    }
    const cam = s.camera;
    if (!cam) return;
    // Below 1,200 km the visible ground cannot span more than a few tens of degrees, but Cesium can report
    // the whole globe before its first frame or when tilted to the horizon. Then use a box around the camera.
    const half = Math.min(20, (cam.height / 111_000) * 1.2);
    const around = { west: cam.lon - half / Math.max(0.2, Math.cos((cam.lat * Math.PI) / 180)), east: cam.lon + half / Math.max(0.2, Math.cos((cam.lat * Math.PI) / 180)), south: cam.lat - half, north: cam.lat + half };
    let rect = globeApi.viewRect();
    if (!rect || rect.west > rect.east || rect.north - rect.south > half * 6 || rect.east - rect.west > half * 12) rect = around; // west > east: wraps the antimeridian
    const bbox = snap(rect);
    let taxonKey: number | null = null;
    if (s.species) {
      taxonKey = await matchSpecies(s.species.canonicalName, s.species.taxonomy.class).catch(() => null);
      if (!taxonKey) {
        s.set({ live: { status: "error", result: null, error: "This species could not be matched to GBIF's live index.", bbox } });
        return;
      }
    }
    const key = JSON.stringify([bbox, s.group, s.bin, taxonKey]);
    if (key === lastKey) return;
    lastKey = key;
    ctrl?.abort();
    ctrl = new AbortController();
    const signal = ctrl.signal;
    s.set({ live: { ...useStore.getState().live, status: "loading", error: null } });
    try {
      const result = await fetchRecordsInView({ bbox, group: s.group, bin: s.bin, bins: s.manifest.bins, taxonKey }, s.manifest.lenses.animals.groups, signal);
      if (!signal.aborted) useStore.getState().set({ live: { status: "ok", result, error: null, bbox, taxonKey } });
    } catch (e) {
      if (signal.aborted) return;
      lastKey = "";
      useStore.getState().set({ live: { status: "error", result: null, error: String(e), bbox } });
    }
  };

  const schedule = () => {
    window.clearTimeout(timer);
    timer = window.setTimeout(() => void run(), LIVE_DEBOUNCE_MS);
  };

  const unsub = useStore.subscribe((s, prev) => {
    if (s.camera !== prev.camera || s.lod !== prev.lod || s.group !== prev.group || s.bin !== prev.bin || s.species !== prev.species || s.lens !== prev.lens || s.manifest !== prev.manifest) {
      schedule();
    }
  });
  return () => {
    unsub();
    window.clearTimeout(timer);
    ctrl?.abort();
  };
}

/** Force a refetch (Retry button). */
export function retryLive() {
  const s = useStore.getState();
  s.set({ camera: s.camera ? { ...s.camera } : s.camera });
}
