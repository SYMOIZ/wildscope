import * as K from "../config/interaction";
import { globeApi } from "../globe/Globe";
import { Icon } from "./Icon";

export function CameraControls({ shifted }: { shifted: boolean }) {
  return (
    <div className={`camctl glass${shifted ? " shifted" : ""}`} role="group" aria-label="Camera">
      <button className="icon-btn" aria-label="Zoom in (+)" title="Zoom in (+)" onClick={() => globeApi.zoom(1 - K.ZOOM_STEP * 3)}><Icon name="plus" /></button>
      <button className="icon-btn" aria-label="Zoom out (-)" title="Zoom out (-)" onClick={() => globeApi.zoom(1 + K.ZOOM_STEP * 3)}><Icon name="minus" /></button>
      <button className="icon-btn" aria-label="Reset north (N)" title="Reset north (N)" onClick={() => globeApi.resetNorth()}><Icon name="north" /></button>
    </div>
  );
}
