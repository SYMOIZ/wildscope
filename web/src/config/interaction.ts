// Tunable interaction constants (INTERACTION_SPECIFICATIONS: kept in one module).
// Data constants (MIN_EFFORT etc.) are NOT here: they come from the manifest.

export const LOD_L0_MIN_HEIGHT_M = 8_000_000; // L0 (H3 res 2) at or above this camera height
export const LOD_HYSTERESIS = 0.1;
export const CAMERA_MIN_HEIGHT_M = 200_000;
export const CAMERA_MAX_HEIGHT_M = 25_000_000;
export const ARRIVAL_START_HEIGHT_M = 20_000_000;
export const ARRIVAL_END_HEIGHT_M = 12_000_000;
export const ARRIVAL_MS = 3000;
export const FLY_TO_POINT_HEIGHT_M = 1_500_000;
export const FEW_CELLS_HEIGHT_M = 2_500_000;
export const FIT_PADDING = 0.12;
export const ROTATE_STEP_DEG = 5;
export const ZOOM_STEP = 0.12;
export const PLAY_DWELL_MS = 1500;
export const TOOLTIP_DELAY_MS = 150;
export const SEARCH_DEBOUNCE_MS = 120;
export const PLACE_MIN_CHARS = 3;
export const SPECIES_MIN_CHARS = 2;
export const MAX_SPECIES_RESULTS = 8;
export const MAX_PLACE_RESULTS = 5;
export const DATA_LAYER_ALPHA = 0.78;
export const IMAGERY_BRIGHTNESS = 0.55;
export const IMAGERY_SATURATION = 0.7;
export const EXTENT_QUANTILE = 0.01; // central 98% of record positions
export const MIN_CELLS_FOR_FIT = 5;

export const reducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;
