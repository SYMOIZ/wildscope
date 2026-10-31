import * as Cesium from "cesium";
import "cesium/Build/Cesium/Widgets/widgets.css";
import { cellToBoundary, latLngToCell } from "h3-js";
import { useEffect, useRef, useState } from "react";
import * as K from "../config/interaction";
import { fmtExact, fmtShare } from "../data/format";
import { densityTileUrl, groupOfClass, type LiveRecord } from "../data/gbif";
import { useStore } from "../state/store";
import { readUrl } from "../state/url";
import { CellImageryProvider } from "./cellLayer";
import { heightToLod } from "./lod";
import type { Layer } from "./layerModel";

Cesium.Ion.defaultAccessToken = ""; // No Cesium ion imagery or terrain (DATA §13).

let viewer: Cesium.Viewer | null = null;

/** Imperative camera API used by search, species mode and the camera controls. */
export const globeApi = {
  flyToBounds(west: number, south: number, east: number, north: number) {
    if (!viewer) return;
    const padX = (east - west) * K.FIT_PADDING, padY = (north - south) * K.FIT_PADDING;
    const rect = Cesium.Rectangle.fromDegrees(
      Math.max(-180, west - padX), Math.max(-89, south - padY), Math.min(180, east + padX), Math.min(89, north + padY));
    viewer.camera.flyTo({ destination: rect, duration: flyDuration() });
  },
  flyToPoint(lat: number, lon: number, height = K.FLY_TO_POINT_HEIGHT_M) {
    viewer?.camera.flyTo({ destination: Cesium.Cartesian3.fromDegrees(lon, lat, height), duration: flyDuration() });
  },
  zoom(factor: number) {
    if (!viewer) return;
    const h = viewer.camera.positionCartographic.height;
    const target = Math.min(K.CAMERA_MAX_HEIGHT_M, Math.max(K.CAMERA_MIN_HEIGHT_M, h * factor));
    viewer.camera.moveForward(h - target);
  },
  resetNorth() {
    if (!viewer) return;
    const c = viewer.camera.positionCartographic;
    viewer.camera.flyTo({
      destination: Cesium.Cartesian3.fromRadians(c.longitude, c.latitude, c.height),
      orientation: { heading: 0, pitch: -Cesium.Math.PI_OVER_TWO, roll: 0 },
      duration: K.reducedMotion() ? 0 : 0.48,
    });
  },
  /** Back to the whole-globe view. */
  home() {
    viewer?.camera.flyTo({ destination: Cesium.Cartesian3.fromDegrees(20, 15, K.ARRIVAL_END_HEIGHT_M), duration: flyDuration() });
  },
  /** Current view rectangle in degrees, or null when the camera sees space around the globe. */
  viewRect(): { west: number; south: number; east: number; north: number } | null {
    if (!viewer) return null;
    const r = viewer.camera.computeViewRectangle(viewer.scene.globe.ellipsoid);
    if (!r) return null;
    const d = Cesium.Math.toDegrees;
    return { west: d(r.west), south: d(r.south), east: d(r.east), north: d(r.north) };
  },
  rotate(dLonDeg: number, dLatDeg: number) {
    if (!viewer) return;
    const c = viewer.camera.positionCartographic;
    const lat = Cesium.Math.clamp(Cesium.Math.toDegrees(c.latitude) + dLatDeg, -85, 85);
    viewer.camera.setView({ destination: Cesium.Cartesian3.fromDegrees(Cesium.Math.toDegrees(c.longitude) + dLonDeg, lat, c.height) });
  },
};

function flyDuration() {
  return K.reducedMotion() ? 0 : 1.8;
}

/** Categorical colours for record points by group (distinct in hue and lightness; always paired with the legend). */
export const GROUP_COLORS: Record<string, string> = {
  mammals: "#E3A857",
  birds: "#7FD1C7",
  reptiles: "#9CC96B",
  amphibians: "#4B9CD3",
  fishes: "#8FA8FF",
  insects: "#F5AC85",
  other_invertebrates: "#D9C2F0",
};

function clusterImage(count: number): HTMLCanvasElement {
  const label = count >= 1000 ? `${Math.round(count / 100) / 10}k` : String(count);
  const r = count < 10 ? 13 : count < 100 ? 16 : 19;
  const c = document.createElement("canvas");
  c.width = c.height = r * 2 + 4;
  const g = c.getContext("2d")!;
  g.beginPath();
  g.arc(r + 2, r + 2, r, 0, Math.PI * 2);
  g.fillStyle = "rgba(12,26,22,0.88)";
  g.fill();
  g.lineWidth = 2;
  g.strokeStyle = "#EDE8DC";
  g.stroke();
  g.fillStyle = "#EDE8DC";
  g.font = "600 12px Inter, sans-serif";
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillText(label, r + 2, r + 3);
  return c;
}

async function makeBasemap(region: string, key: string | null, onFallback: (why: string) => void): Promise<Cesium.ImageryLayer> {
  const fallback = async () => {
    const p = await Cesium.TileMapServiceImageryProvider.fromUrl(Cesium.buildModuleUrl("Assets/Textures/NaturalEarthII"));
    return new Cesium.ImageryLayer(p);
  };
  if (!key) return fallback();
  // UD-02: Amazon Location Service Maps (v2) raster satellite tiles, Web Mercator XYZ.
  const provider = new Cesium.UrlTemplateImageryProvider({
    url: `https://maps.geo.${region}.amazonaws.com/v2/tiles/raster.satellite/{z}/{x}/{y}?key=${encodeURIComponent(key)}`,
    tilingScheme: new Cesium.WebMercatorTilingScheme(),
    maximumLevel: 16,
    credit: new Cesium.Credit("Basemap: Amazon Location Service"),
  });
  const layer = new Cesium.ImageryLayer(provider);
  let errors = 0;
  provider.errorEvent.addEventListener((err: Cesium.TileProviderError) => {
    errors++;
    if (errors === 6 && viewer) {
      err.retry = false;
      void fallback().then((fb) => {
        if (!viewer) return;
        styleBasemap(fb);
        viewer.imageryLayers.remove(layer);
        viewer.imageryLayers.add(fb, 0);
        onFallback("Amazon Location basemap tiles failed to load; showing the bundled Natural Earth imagery.");
      });
    }
  });
  return layer;
}

function styleBasemap(l: Cesium.ImageryLayer) {
  l.brightness = K.IMAGERY_BRIGHTNESS;
  l.saturation = K.IMAGERY_SATURATION;
}

interface Hover {
  x: number;
  y: number;
  id?: string; // cell
  record?: LiveRecord;
  cluster?: number;
}

export function Globe({ layer }: { layer: Layer | null }) {
  const el = useRef<HTMLDivElement>(null);
  const dataLayer = useRef<Cesium.ImageryLayer | null>(null);
  const layerRef = useRef<Layer | null>(null);
  const [hover, setHover] = useState<Hover | null>(null);
  const [ready, setReady] = useState(false);
  const manifest = useStore((s) => s.manifest);
  const bin = useStore((s) => s.bin);
  const selectedCell = useStore((s) => s.selectedCell);
  const pin = useStore((s) => s.pin);

  useEffect(() => {
    layerRef.current = layer;
  }, [layer]);

  // Basemap once config.json has loaded (it carries the Amazon Location key; boot() loads it async).
  const config = useStore((s) => s.config);
  useEffect(() => {
    if (!viewer || !ready || !config) return;
    const v = viewer;
    let added: Cesium.ImageryLayer | null = null;
    void makeBasemap(config.locationRegion, config.locationApiKey, (why) => useStore.getState().toast(why)).then((b) => {
      if (v.isDestroyed()) return;
      styleBasemap(b);
      v.imageryLayers.add(b, 0);
      added = b;
      v.scene.requestRender();
    });
    return () => {
      if (added && !v.isDestroyed() && v.imageryLayers.contains(added)) v.imageryLayers.remove(added);
    };
  }, [config, ready]);

  // Create the viewer once.
  useEffect(() => {
    if (!el.current || viewer) return;
    const v = new Cesium.Viewer(el.current, {
      baseLayer: false,
      animation: false, timeline: false, geocoder: false, homeButton: false, sceneModePicker: false,
      baseLayerPicker: false, navigationHelpButton: false, fullscreenButton: false, infoBox: false,
      selectionIndicator: false, requestRenderMode: true, showRenderLoopErrors: false, maximumRenderTimeChange: Infinity,
    });
    viewer = v;
    if (import.meta.env.DEV) (window as unknown as { __wsViewer: Cesium.Viewer }).__wsViewer = v; // debugging only
    const scene = v.scene;
    scene.globe.baseColor = Cesium.Color.fromCssColorString("#0C1A16");
    scene.backgroundColor = Cesium.Color.fromCssColorString("#06100D");
    scene.globe.showGroundAtmosphere = true;
    if (scene.skyAtmosphere) scene.skyAtmosphere.brightnessShift = -0.3;
    const ctl = scene.screenSpaceCameraController;
    ctl.minimumZoomDistance = K.CAMERA_MIN_HEIGHT_M;
    ctl.maximumZoomDistance = K.CAMERA_MAX_HEIGHT_M;
    v.canvas.setAttribute("tabindex", "0");
    v.canvas.setAttribute("aria-label", "3D globe of recorded occurrences");
    v.cesiumWidget.screenSpaceEventHandler.removeInputAction(Cesium.ScreenSpaceEventType.LEFT_DOUBLE_CLICK);

    // Camera → store (lat/lon/height + LOD with hysteresis).
    const onCamera = () => {
      const c = v.camera.positionCartographic;
      const cam = { lat: Cesium.Math.toDegrees(c.latitude), lon: Cesium.Math.toDegrees(c.longitude), height: c.height };
      const s = useStore.getState();
      s.set({ camera: cam, lod: heightToLod(cam.height, s.lod) });
    };
    v.camera.percentageChanged = 0.05;
    v.camera.changed.addEventListener(onCamera);
    v.camera.moveEnd.addEventListener(onCamera);

    const pickCell = (pos: Cesium.Cartesian2): string | null => {
      const ray = v.camera.getPickRay(pos);
      const cart = ray && scene.globe.pick(ray, scene);
      const lyr = layerRef.current;
      if (!cart || !lyr) return null;
      const c = Cesium.Cartographic.fromCartesian(cart);
      return latLngToCell(Cesium.Math.toDegrees(c.latitude), Cesium.Math.toDegrees(c.longitude), lyr.res);
    };

    // Record points and clusters first (local level), then H3 cells.
    const pickRecord = (pos: Cesium.Cartesian2): { record?: LiveRecord; cluster?: Cesium.Entity[] } | null => {
      const picked = scene.pick(pos);
      const id = picked?.id;
      if (Array.isArray(id)) return { cluster: id as Cesium.Entity[] };
      if (id instanceof Cesium.Entity && id.properties?.record) return { record: id.properties.record.getValue() as LiveRecord };
      return null;
    };

    const h = new Cesium.ScreenSpaceEventHandler(v.canvas);
    let hoverTimer = 0;
    h.setInputAction((m: { endPosition: Cesium.Cartesian2 }) => {
      window.clearTimeout(hoverTimer);
      const pos = m.endPosition;
      hoverTimer = window.setTimeout(() => {
        const rec = pickRecord(pos);
        if (rec?.record) return setHover({ x: pos.x, y: pos.y, record: rec.record });
        if (rec?.cluster) return setHover({ x: pos.x, y: pos.y, cluster: rec.cluster.length });
        const id = pickCell(pos);
        setHover(id && layerRef.current?.info.has(id) ? { x: pos.x, y: pos.y, id } : null);
      }, K.TOOLTIP_DELAY_MS);
    }, Cesium.ScreenSpaceEventType.MOUSE_MOVE);
    h.setInputAction(() => setHover(null), Cesium.ScreenSpaceEventType.LEFT_DOWN);
    h.setInputAction((m: { position: Cesium.Cartesian2 }) => {
      const s = useStore.getState();
      const rec = pickRecord(m.position);
      if (rec?.record) {
        s.set({ record: rec.record, panel: "record" });
        return;
      }
      if (rec?.cluster) {
        // Zoom towards the cluster so it splits into its records.
        const pts = rec.cluster.map((e) => Cesium.Cartographic.fromCartesian(e.position!.getValue(Cesium.JulianDate.now())!));
        const lat = pts.reduce((a, p) => a + p.latitude, 0) / pts.length;
        const lon = pts.reduce((a, p) => a + p.longitude, 0) / pts.length;
        const height = Math.max(K.CAMERA_MIN_HEIGHT_M * 2, v.camera.positionCartographic.height / 3);
        v.camera.flyTo({ destination: Cesium.Cartesian3.fromRadians(lon, lat, height), duration: flyDuration() * 0.6 });
        return;
      }
      const id = pickCell(m.position);
      if (!id || !layerRef.current?.info.has(id) || s.selectedCell?.id === id) {
        s.set({ selectedCell: null, panel: s.panel === "cell" ? (s.species ? "species" : "none") : s.panel });
      } else {
        s.set({ selectedCell: { id, res: layerRef.current.res }, panel: "cell" });
      }
    }, Cesium.ScreenSpaceEventType.LEFT_CLICK);
    h.setInputAction((m: { position: Cesium.Cartesian2 }) => {
      const ray = v.camera.getPickRay(m.position);
      const cart = ray && scene.globe.pick(ray, scene);
      if (!cart) return;
      const c = Cesium.Cartographic.fromCartesian(cart);
      // Each double-click goes a quarter of the way down, like a map's zoom-in, never below the floor.
      const height = Math.max(K.CAMERA_MIN_HEIGHT_M * 2, Math.min(K.FLY_TO_POINT_HEIGHT_M, v.camera.positionCartographic.height / 4));
      globeApi.flyToPoint(Cesium.Math.toDegrees(c.latitude), Cesium.Math.toDegrees(c.longitude), height);
    }, Cesium.ScreenSpaceEventType.LEFT_DOUBLE_CLICK);

    // Initial camera: URL camera if present, else the arrival sequence (S01).
    const s = useStore.getState();
    const urlCam = readUrl().cam; // read synchronously: boot() fills the store asynchronously
    if (urlCam) {
      v.camera.setView({ destination: Cesium.Cartesian3.fromDegrees(urlCam.lon, urlCam.lat, urlCam.height) });
      s.set({ arrived: true });
    } else {
      v.camera.setView({ destination: Cesium.Cartesian3.fromDegrees(20, 15, K.ARRIVAL_START_HEIGHT_M) });
      if (K.reducedMotion()) {
        v.camera.setView({ destination: Cesium.Cartesian3.fromDegrees(20, 15, K.ARRIVAL_END_HEIGHT_M) });
      } else {
        v.camera.flyTo({ destination: Cesium.Cartesian3.fromDegrees(50, 18, K.ARRIVAL_END_HEIGHT_M), duration: K.ARRIVAL_MS / 1000 });
      }
    }
    onCamera();
    setReady(true);
    // requestRenderMode only draws on demand: redraw whenever the container size changes (incl. first layout).
    const hasSize = () => v.canvas.clientWidth > 0 && v.canvas.clientHeight > 0;
    const restart = () => {
      if (v.isDestroyed() || !hasSize()) return;
      v.useDefaultRenderLoop = true; // Cesium turns the loop off after a render error
      v.resize();
      scene.requestRender();
    };
    const ro = new ResizeObserver(restart);
    ro.observe(el.current);

    // A canvas collapsed to 0 px (hidden pane, minimised split view) makes Cesium throw and stop
    // rendering; that recovers silently on the next resize. Anything else gets a banner with Retry.
    scene.renderError.addEventListener(() => {
      if (!hasSize()) return;
      useStore.getState().set({
        banner: {
          text: "The globe stopped drawing. Retry",
          retry: () => {
            useStore.getState().set({ banner: null });
            restart();
          },
        },
      });
    });
    return () => {
      ro.disconnect();
      h.destroy();
      v.destroy();
      viewer = null;
      dataLayer.current = null;
      setReady(false);
    };
  }, []);

  // Swap the data layer when the computed layer changes (old layer stays until the new one is added).
  useEffect(() => {
    if (!viewer || !ready) return;
    const v = viewer;
    const old = dataLayer.current;
    if (!layer) {
      if (old) v.imageryLayers.remove(old);
      dataLayer.current = null;
      v.scene.requestRender();
      return;
    }
    const alpha = K.DATA_LAYER_ALPHA[layer.lod];
    const oldAlpha = old?.alpha ?? 0;
    const next = new Cesium.ImageryLayer(new CellImageryProvider(layer.draw) as unknown as Cesium.ImageryProvider);
    next.alpha = K.reducedMotion() ? alpha : 0;
    v.imageryLayers.add(next);
    dataLayer.current = next;
    if (K.reducedMotion()) {
      if (old) v.imageryLayers.remove(old);
      v.scene.requestRender();
      return;
    }
    const start = performance.now();
    let raf = 0;
    const step = () => {
      const t = Math.min(1, (performance.now() - start) / 480);
      next.alpha = alpha * t;
      if (old) old.alpha = oldAlpha * (1 - t);
      if (v.isDestroyed()) return;
      v.scene.requestRender();
      if (t < 1) raf = requestAnimationFrame(step);
      else if (old) v.imageryLayers.remove(old);
    };
    raf = requestAnimationFrame(step);
    return () => {
      cancelAnimationFrame(raf);
      if (v.isDestroyed()) return;
      if (old && v.imageryLayers.contains(old)) v.imageryLayers.remove(old);
      next.alpha = alpha;
    };
  }, [layer, ready]);

  // Selection outline (focus colour) and search pin.
  useEffect(() => {
    if (!viewer) return;
    const v = viewer;
    const ents: Cesium.Entity[] = [];
    if (selectedCell) {
      const ring = cellToBoundary(selectedCell.id).map(([lat, lon]) => Cesium.Cartesian3.fromDegrees(lon, lat));
      ents.push(v.entities.add({ polyline: { positions: [...ring, ring[0]], width: 2, material: Cesium.Color.fromCssColorString("#F4D58D"), clampToGround: false, arcType: Cesium.ArcType.GEODESIC } }));
    }
    if (pin) {
      ents.push(v.entities.add({
        position: Cesium.Cartesian3.fromDegrees(pin.lon, pin.lat),
        point: { pixelSize: 9, color: Cesium.Color.fromCssColorString("#F4D58D"), outlineColor: Cesium.Color.fromCssColorString("#06100D"), outlineWidth: 2 },
        label: { text: pin.label, font: "13px Inter, sans-serif", fillColor: Cesium.Color.fromCssColorString("#EDE8DC"), pixelOffset: new Cesium.Cartesian2(0, -18), showBackground: true, backgroundColor: Cesium.Color.fromCssColorString("#0C1A16").withAlpha(0.85) },
      }));
    }
    v.scene.requestRender();
    return () => {
      if (v.isDestroyed()) return;
      ents.forEach((e) => v.entities.remove(e));
      v.scene.requestRender();
    };
  }, [selectedCell, pin]);

  // Local level: individual GBIF records in view, clustered by screen distance.
  const live = useStore((s) => s.live);
  const lod = useStore((s) => s.lod);
  const selectedRecord = useStore((s) => s.record);
  const recordsSource = useRef<Cesium.CustomDataSource | null>(null);
  useEffect(() => {
    if (!viewer || !ready) return;
    const v = viewer;
    const ds = new Cesium.CustomDataSource("records");
    ds.clustering.enabled = true;
    ds.clustering.pixelRange = K.CLUSTER_PIXEL_RANGE;
    ds.clustering.minimumClusterSize = 3;
    ds.clustering.clusterEvent.addEventListener((entities, cluster) => {
      cluster.label.show = false;
      cluster.billboard.show = true;
      cluster.billboard.setImage(`cluster-${entities.length}`, clusterImage(entities.length));
      cluster.billboard.id = entities; // Cesium leaves cluster ids empty; picking needs the member records
      cluster.billboard.verticalOrigin = Cesium.VerticalOrigin.CENTER;
      cluster.billboard.disableDepthTestDistance = Number.POSITIVE_INFINITY;
    });
    void v.dataSources.add(ds);
    recordsSource.current = ds;
    return () => {
      recordsSource.current = null;
      if (!v.isDestroyed()) void v.dataSources.remove(ds, true);
    };
  }, [ready]);

  // Local level: all matching records as GBIF density dots, under the clickable records.
  const group = useStore((s) => s.group);
  const lens = useStore((s) => s.lens);
  const speciesOn = useStore((s) => !!s.species);
  const liveTaxon = live.taxonKey ?? null;
  useEffect(() => {
    if (!viewer || !ready || !manifest || lod !== 2 || lens !== "animals") return;
    if (!speciesOn && group === "other_invertebrates") return; // no single GBIF key: tiles would show all animals
    if (speciesOn && !liveTaxon) return; // wait until the species is matched to GBIF
    const v = viewer;
    const provider = new Cesium.UrlTemplateImageryProvider({
      url: densityTileUrl({ group, bin, bins: manifest.bins, taxonKey: speciesOn ? liveTaxon : null }),
      tilingScheme: new Cesium.WebMercatorTilingScheme(),
      tileWidth: 512,
      tileHeight: 512,
      maximumLevel: 16,
      credit: new Cesium.Credit("Record density: GBIF.org"),
    });
    const layer = v.imageryLayers.addImageryProvider(provider);
    layer.alpha = 0.9;
    v.scene.requestRender();
    return () => {
      if (!v.isDestroyed() && v.imageryLayers.contains(layer)) v.imageryLayers.remove(layer);
    };
  }, [ready, manifest, lod, lens, group, bin, speciesOn, liveTaxon]);

  useEffect(() => {
    const ds = recordsSource.current;
    if (!viewer || !ds) return;
    const groups = manifest?.lenses.animals.groups ?? [];
    ds.entities.suspendEvents();
    ds.entities.removeAll();
    const show = lod === 2 && live.status !== "error" && live.result;
    if (show && live.result) {
      for (const r of live.result.records) {
        const color = Cesium.Color.fromCssColorString(GROUP_COLORS[groupOfClass(r.className, groups)] ?? "#EDE8DC");
        const selected = selectedRecord?.key === r.key;
        ds.entities.add({
          id: `rec-${r.key}`,
          position: Cesium.Cartesian3.fromDegrees(r.lon, r.lat),
          point: {
            pixelSize: selected ? 14 : 9,
            color,
            outlineColor: Cesium.Color.fromCssColorString(selected ? "#F4D58D" : "#06100D"),
            outlineWidth: selected ? 3 : 1.5,
            disableDepthTestDistance: Number.POSITIVE_INFINITY,
          },
          properties: { record: r },
        });
      }
    }
    ds.entities.resumeEvents();
    viewer.scene.requestRender();
  }, [live, lod, selectedRecord, manifest]);

  const binLabel = bin === "all" ? "All years" : manifest?.bins.find((b) => b.id === bin)?.label ?? bin;
  const c = hover?.id ? layer?.info.get(hover.id) : undefined;
  return (
    <div className="globe-wrap">
      <div ref={el} className="globe" />
      {hover?.record && (
        <div className="tooltip" style={{ left: hover.x + 12, top: hover.y + 12 }} role="status" data-source="LIVE">
          <span className="sci">{hover.record.species ?? hover.record.scientificName}</span>
          <span className="mono"> · {hover.record.eventDate?.slice(0, 10) ?? "date not given"}</span>
          {hover.record.photos.length > 0 && <span className="muted"> · photo</span>}
        </div>
      )}
      {hover?.cluster && (
        <div className="tooltip mono" style={{ left: hover.x + 12, top: hover.y + 12 }} role="status" data-source="LIVE">
          {fmtExact(hover.cluster)} records close together · click to zoom in
        </div>
      )}
      {hover && c && (
        <div className="tooltip mono" style={{ left: hover.x + 12, top: hover.y + 12 }} role="status" data-source="A-02">
          {fmtExact(c.records)} recorded occurrences · {binLabel}
          {c.effort !== null && <> · effort {fmtExact(c.effort)}</>}
          {layer?.isShare && (c.hatched ? <> · insufficient effort</> : <> · share {fmtShare(c.value)}</>)}
        </div>
      )}
    </div>
  );
}
