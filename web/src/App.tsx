import { useEffect, useMemo, useState } from "react";
import * as K from "./config/interaction";
import { AssetError, loadConfig, loadLatest, loadManifest } from "./data/assets";
import { globeApi, Globe } from "./globe/Globe";
import { buildLayer, layerKey, type Layer, type LayerParams } from "./globe/layerModel";
import { selectSpecies } from "./state/actions";
import { groupsFor, useStore } from "./state/store";
import { readUrl, startUrlSync, validateAgainstManifest } from "./state/url";
import { CameraControls } from "./components/CameraControls";
import { DataNotes } from "./components/DataNotes";
import { GroupRail } from "./components/GroupRail";
import { Legend } from "./components/Legend";
import { CellPanel, SpeciesPanel } from "./components/Panels";
import { Timeline } from "./components/Timeline";
import { TopBar } from "./components/TopBar";

function hasWebGL2() {
  try {
    return !!document.createElement("canvas").getContext("webgl2");
  } catch {
    return false;
  }
}

async function boot() {
  const s = useStore.getState();
  const url = readUrl();
  const [config, latest] = await Promise.all([loadConfig(), loadLatest()]);
  let datasetId = latest.datasetId;
  let manifest;
  if (url.snap && url.snap !== latest.datasetId) {
    try {
      manifest = await loadManifest(url.snap);
      datasetId = url.snap;
    } catch {
      s.set({ banner: { text: `This link was made with data from ${url.snap}. Showing ${latest.datasetId}.` } });
    }
  }
  manifest ??= await loadManifest(datasetId);
  const u = validateAgainstManifest(url, manifest);
  s.set({
    config,
    manifest,
    lens: u.lens ?? "animals",
    group: u.group ?? "all",
    bin: u.bin ?? "all",
    mode: u.mode ?? "density",
    normalised: u.n ?? false,
    camera: u.cam ?? null,
    notesOpen: u.panel === "notes",
  });
  if (u.sp) void selectSpecies(u.sp, { fly: !u.cam });
}

export default function App() {
  const [fatal, setFatal] = useState<string | null>(hasWebGL2() ? null : "webgl");
  const st = useStore();
  const [layer, setLayer] = useState<Layer | null>(null);
  const [layerLoading, setLayerLoading] = useState(false);
  const [landing, setLanding] = useState(true);

  useEffect(() => {
    if (fatal) return;
    boot().catch((e) => {
      const what = e instanceof AssetError ? e.what : "the data";
      useStore.getState().set({ banner: { text: `Could not load ${what}. Retry`, retry: () => location.reload() } });
    });
    return startUrlSync();
  }, [fatal]);

  // Arrival sequence (S01): settles after 3 s or on any input.
  useEffect(() => {
    if (!landing) return;
    const settle = () => {
      setLanding(false);
      useStore.getState().set({ arrived: true });
    };
    const u = readUrl();
    if (u.cam || u.sp) settle(); // shared links open straight into the view
    const t = window.setTimeout(settle, K.ARRIVAL_MS);
    const opts = { once: true, capture: true } as const;
    window.addEventListener("pointerdown", settle, opts);
    window.addEventListener("keydown", settle, opts);
    window.addEventListener("wheel", settle, opts);
    return () => {
      window.clearTimeout(t);
      window.removeEventListener("pointerdown", settle, opts);
      window.removeEventListener("keydown", settle, opts);
      window.removeEventListener("wheel", settle, opts);
    };
  }, [landing]);

  const params: LayerParams | null = useMemo(
    () => (st.manifest ? { manifest: st.manifest, lens: st.lens, group: st.group, bin: st.bin, lod: st.lod, normalised: st.normalised, mode: st.mode, species: st.species } : null),
    [st.manifest, st.lens, st.group, st.bin, st.lod, st.normalised, st.mode, st.species],
  );

  useEffect(() => {
    if (!params) return;
    if (!params.manifest.lenses[params.lens].built) {
      setLayer(null);
      return;
    }
    let cancelled = false;
    const key = layerKey(params);
    setLayerLoading(true);
    buildLayer(params)
      .then((l) => {
        if (!cancelled && l.key === key) {
          setLayer(l);
          useStore.getState().set({ banner: null });
        }
      })
      .catch(() => {
        if (!cancelled) useStore.getState().set({ banner: { text: "Could not load the record density layer. Retry", retry: () => setLayer(null) } });
      })
      .finally(() => !cancelled && setLayerLoading(false));
    return () => {
      cancelled = true;
    };
  }, [params]);

  // Keyboard map (INTERACTION §13).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA" || e.ctrlKey || e.metaKey || e.altKey) return;
      const s = useStore.getState();
      const onCanvas = (e.target as HTMLElement)?.tagName === "CANVAS";
      switch (e.key) {
        case "t": case "T": s.setLens("trees"); break;
        case "a": case "A": s.setLens("animals"); break;
        case "i": case "I": s.set({ notesOpen: !s.notesOpen }); break;
        case "n": case "N": globeApi.resetNorth(); break;
        case "+": case "=": globeApi.zoom(1 - K.ZOOM_STEP); break;
        case "-": globeApi.zoom(1 + K.ZOOM_STEP); break;
        case "g": case "G": document.querySelector<HTMLButtonElement>("#group-rail button")?.focus(); break;
        case "Escape":
          if (s.notesOpen) s.set({ notesOpen: false });
          else if (s.panel !== "none") s.set({ panel: "none", selectedCell: null });
          break;
        case "Backspace":
          if (onCanvas && s.species) s.clearSpecies();
          break;
        default:
          if (onCanvas && e.key.startsWith("Arrow")) {
            e.preventDefault();
            const d = K.ROTATE_STEP_DEG;
            globeApi.rotate(e.key === "ArrowLeft" ? -d : e.key === "ArrowRight" ? d : 0, e.key === "ArrowUp" ? d : e.key === "ArrowDown" ? -d : 0);
          } else if (/^[1-8]$/.test(e.key)) {
            const g = groupsFor(s.manifest, s.lens)[Number(e.key) - 1];
            if (g) s.setGroup(g.id);
          }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    const onPop = () => location.reload();
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  if (fatal === "webgl") {
    return (
      <div className="fatal">
        <div>
          <h1 className="sci" style={{ fontStyle: "normal" }}>WildScope needs WebGL2</h1>
          <p className="muted">Your browser or device does not provide WebGL2, which the 3D globe requires. Try a current version of Chrome, Edge, Firefox or Safari.</p>
        </div>
      </div>
    );
  }

  const groupLabel = groupsFor(st.manifest, st.lens).find((g) => g.id === st.group)?.label ?? "All";
  const binLabel = st.bin === "all" ? "All years" : st.manifest?.bins.find((b) => b.id === st.bin)?.label;
  const panelOpen = st.panel === "species" || st.panel === "cell";

  return (
    <div data-lens={st.lens} style={{ position: "absolute", inset: 0 }} onError={() => setFatal("render")}>
      <Globe layer={layer} />
      {(layerLoading || st.loading > 0) && <div className="progress" role="progressbar" aria-label="Loading data" />}
      <div className={`landing${landing ? "" : " gone"}`} aria-hidden={!landing}>
        <h1>Where life has been recorded.</h1>
        <p>Trees and animals across the planet, from open biodiversity records.</p>
        <button className="btn" onClick={() => setLanding(false)}>Begin</button>
      </div>
      <div className={`chrome${landing ? " hidden" : ""}`}>
        <TopBar />
        <GroupRail />
        <Legend layer={layer} loading={layerLoading} />
        <CameraControls shifted={panelOpen} />
        <Timeline effortByBin={layer?.effortByBin ?? st.manifest?.lenses[st.lens].totalsByBin?.[st.group] ?? new Array(9).fill(0)} />
        {st.panel === "species" && <SpeciesPanel />}
        {st.panel === "cell" && <CellPanel layer={layer} />}
        <DataNotes />
      </div>
      {st.banner && (
        <div className="banner glass" role="alert">
          {st.banner.text}
          {st.banner.retry && <button className="btn" onClick={st.banner.retry}>Retry</button>}
          <button className="icon-btn" aria-label="Dismiss" onClick={() => st.set({ banner: null })}>×</button>
        </div>
      )}
      <div className="toasts" aria-live="polite">
        {st.toasts.map((t) => (
          <div key={t.id} className="toast glass" role={t.kind === "error" ? "alert" : "status"}>
            {t.text} {t.action && <button className="btn" onClick={t.action.run}>{t.action.label}</button>}
          </div>
        ))}
      </div>
      <div className="sr-only" aria-live="polite">
        Showing {st.lens === "animals" ? "Animals" : "Trees"}, {groupLabel}, {binLabel}{st.species ? `, species ${st.species.canonicalName}` : ""}.
      </div>
    </div>
  );
}
