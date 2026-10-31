import { CAMERA_MAX_HEIGHT_M, CAMERA_MIN_HEIGHT_M } from "../config/interaction";
import type { BinSel, Lens, Manifest } from "../data/types";
import { useStore, type Camera, type Mode, type Panel } from "./store";

// INTERACTION §1 URL format: ?lens=&group=&sp=&bin=&mode=&n=&cam=lat,lon,height&panel=&snap=

export interface UrlState {
  lens?: Lens;
  group?: string;
  sp?: string;
  bin?: BinSel;
  mode?: Mode;
  n?: boolean;
  cam?: Camera;
  panel?: Panel;
  snap?: string;
}

const BIN_RE = /^(B0[0-8]|all)$/;

export function readUrl(): UrlState {
  const q = new URLSearchParams(location.search);
  const out: UrlState = {};
  const lens = q.get("lens");
  if (lens === "animals") out.lens = lens; // Trees is not offered in this build; old links fall back to Animals
  const group = q.get("group");
  if (group && /^[a-z_]{2,32}$/.test(group)) out.group = group;
  const sp = q.get("sp");
  if (sp && /^[0-9A-Za-z]{1,16}$/.test(sp)) out.sp = sp;
  const bin = q.get("bin");
  if (bin && BIN_RE.test(bin)) out.bin = bin as BinSel;
  const mode = q.get("mode");
  if (mode === "density" || mode === "effort") out.mode = mode;
  if (q.get("n") === "1") out.n = true;
  const cam = q.get("cam")?.split(",").map(Number);
  if (cam && cam.length === 3 && cam.every(Number.isFinite) && Math.abs(cam[0]) <= 90 && Math.abs(cam[1]) <= 180) {
    out.cam = { lat: cam[0], lon: cam[1], height: Math.min(CAMERA_MAX_HEIGHT_M, Math.max(CAMERA_MIN_HEIGHT_M, cam[2])) };
  }
  const panel = q.get("panel");
  if (panel === "species" || panel === "notes") out.panel = panel;
  const snap = q.get("snap");
  if (snap && /^[0-9a-z-]{10,40}$/.test(snap)) out.snap = snap;
  return out;
}

/** Drop URL values that are syntactically valid but unknown to this manifest (fall back silently). */
export function validateAgainstManifest(u: UrlState, m: Manifest): UrlState {
  const out = { ...u };
  const lens = out.lens ?? "animals";
  const groups = m.lenses[lens].groups ?? [];
  if (out.group && !groups.some((g) => g.id === out.group)) delete out.group;
  return out;
}

export function buildUrl(): string {
  const s = useStore.getState();
  const q = new URLSearchParams();
  q.set("lens", s.lens);
  if (s.group !== "all") q.set("group", s.group);
  if (s.speciesKey) q.set("sp", s.speciesKey);
  if (s.bin !== "all") q.set("bin", s.bin);
  if (s.mode !== "density") q.set("mode", s.mode);
  if (s.normalised) q.set("n", "1");
  if (s.camera) q.set("cam", `${s.camera.lat.toFixed(3)},${s.camera.lon.toFixed(3)},${Math.round(s.camera.height)}`);
  if (s.panel === "species" || s.panel === "notes") q.set("panel", s.panel);
  if (s.manifest) q.set("snap", s.manifest.datasetId);
  return `${location.pathname}?${q.toString()}`;
}

/** Push history for lens/group/species/panel changes; replace for camera, bin and mode (INTERACTION §1). */
export function startUrlSync(): () => void {
  let last = { lens: "", group: "", sp: "", panel: "" };
  return useStore.subscribe((s) => {
    if (!s.manifest || !s.arrived) return;
    const key = { lens: s.lens, group: s.group, sp: s.speciesKey ?? "", panel: s.panel };
    const url = buildUrl();
    if (url === location.pathname + location.search) return;
    const push = key.lens !== last.lens || key.group !== last.group || key.sp !== last.sp || key.panel !== last.panel;
    last = key;
    if (push) history.pushState(null, "", url);
    else history.replaceState(null, "", url);
  });
}
