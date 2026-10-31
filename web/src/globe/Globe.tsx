import * as Cesium from "cesium";
import "cesium/Build/Cesium/Widgets/widgets.css";
import { cellToBoundary, latLngToCell } from "h3-js";
import { useEffect, useRef, useState } from "react";
import * as K from "../config/interaction";
import { fmtExact, fmtShare } from "../data/format";
import { useStore } from "../state/store";
import { readUrl } from "../state/url";
import { CellImageryProvider } from "./cellLayer";
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

function heightToLod(height: number, current: 0 | 1): 0 | 1 {
  const t = K.LOD_L0_MIN_HEIGHT_M;
  if (current === 0 && height < t * (1 - K.LOD_HYSTERESIS)) return 1;
  if (current === 1 && height > t * (1 + K.LOD_HYSTERESIS)) return 0;
  return current;
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
  id: string;
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

    const { config } = useStore.getState();
    void makeBasemap(config?.locationRegion ?? "us-east-1", config?.locationApiKey ?? null, (why) => useStore.getState().toast(why)).then((b) => {
      if (v.isDestroyed()) return;
      styleBasemap(b);
      v.imageryLayers.add(b, 0);
      scene.requestRender();
    });

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

    const h = new Cesium.ScreenSpaceEventHandler(v.canvas);
    let hoverTimer = 0;
    h.setInputAction((m: { endPosition: Cesium.Cartesian2 }) => {
      window.clearTimeout(hoverTimer);
      const pos = m.endPosition;
      hoverTimer = window.setTimeout(() => {
        const id = pickCell(pos);
        setHover(id && layerRef.current?.info.has(id) ? { x: pos.x, y: pos.y, id } : null);
      }, K.TOOLTIP_DELAY_MS);
    }, Cesium.ScreenSpaceEventType.MOUSE_MOVE);
    h.setInputAction(() => setHover(null), Cesium.ScreenSpaceEventType.LEFT_DOWN);
    h.setInputAction((m: { position: Cesium.Cartesian2 }) => {
      const id = pickCell(m.position);
      const s = useStore.getState();
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
      globeApi.flyToPoint(Cesium.Math.toDegrees(c.latitude), Cesium.Math.toDegrees(c.longitude));
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
    const ro = new ResizeObserver(() => {
      if (v.isDestroyed()) return;
      v.resize();
      scene.requestRender();
    });
    ro.observe(el.current);

    scene.renderError.addEventListener(() => useStore.getState().set({ banner: { text: "Graphics context lost. Reload the page to restore the view.", retry: () => location.reload() } }));
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
    const next = new Cesium.ImageryLayer(new CellImageryProvider(layer.draw) as unknown as Cesium.ImageryProvider);
    next.alpha = K.reducedMotion() ? K.DATA_LAYER_ALPHA : 0;
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
      next.alpha = K.DATA_LAYER_ALPHA * t;
      if (old) old.alpha = K.DATA_LAYER_ALPHA * (1 - t);
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
      next.alpha = K.DATA_LAYER_ALPHA;
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

  const binLabel = bin === "all" ? "All years" : manifest?.bins.find((b) => b.id === bin)?.label ?? bin;
  const c = hover && layer?.info.get(hover.id);
  return (
    <div className="globe-wrap">
      <div ref={el} className="globe" />
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
