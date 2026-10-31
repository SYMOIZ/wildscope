import { create } from "zustand";
import type { BinSel, Lens, Manifest, SpeciesDoc } from "../data/types";
import type { AppConfig } from "../data/assets";

export type Mode = "density" | "effort";
export type Panel = "none" | "species" | "cell" | "notes";

export interface Camera {
  lat: number;
  lon: number;
  height: number;
}

export interface SelectedCell {
  id: string;
  res: number;
}

export interface Toast {
  id: number;
  text: string;
  kind: "info" | "error";
  action?: { label: string; run: () => void };
}

export interface SearchPin {
  lat: number;
  lon: number;
  label: string;
}

interface State {
  manifest: Manifest | null;
  config: AppConfig | null;
  lens: Lens;
  group: string;
  speciesKey: string | null;
  species: SpeciesDoc | null;
  bin: BinSel;
  mode: Mode;
  normalised: boolean;
  panel: Panel;
  notesOpen: boolean;
  lod: 0 | 1;
  camera: Camera | null;
  selectedCell: SelectedCell | null;
  pin: SearchPin | null;
  arrived: boolean;
  toasts: Toast[];
  banner: { text: string; retry?: () => void } | null;
  loading: number;
  set: (p: Partial<State>) => void;
  toast: (text: string, kind?: Toast["kind"], action?: Toast["action"]) => void;
  dismissToast: (id: number) => void;
  setLens: (lens: Lens) => void;
  setGroup: (group: string) => void;
  clearSpecies: () => void;
}

let toastId = 0;

export const useStore = create<State>((set, get) => ({
  manifest: null,
  config: null,
  lens: "animals",
  group: "all",
  speciesKey: null,
  species: null,
  bin: "all",
  mode: "density",
  normalised: false,
  panel: "none",
  notesOpen: false,
  lod: 0,
  camera: null,
  selectedCell: null,
  pin: null,
  arrived: false,
  toasts: [],
  banner: null,
  loading: 0,
  set: (p) => set(p),
  toast: (text, kind = "info", action) => {
    const id = ++toastId;
    set({ toasts: [...get().toasts, { id, text, kind, action }] });
    setTimeout(() => get().dismissToast(id), 5000);
  },
  dismissToast: (id) => set({ toasts: get().toasts.filter((t) => t.id !== id) }),
  // INTERACTION §4: lens switch keeps camera, bin, mode and normalised; resets group.
  setLens: (lens) => {
    const s = get();
    if (lens === s.lens) return;
    const patch: Partial<State> = { lens, group: "all", selectedCell: null };
    if (s.species && s.species.lens !== lens) {
      Object.assign(patch, { speciesKey: null, species: null, panel: s.panel === "species" ? "none" : s.panel, mode: "density" });
      s.toast("Species cleared: it belongs to the other lens.");
    }
    set(patch);
  },
  setGroup: (group) => {
    const s = get();
    if (group === s.group) return;
    const patch: Partial<State> = { group, selectedCell: null };
    if (s.species && group !== "all" && s.species.group !== group) {
      Object.assign(patch, { speciesKey: null, species: null, panel: s.panel === "species" ? "none" : s.panel, mode: "density" });
      s.toast("Species cleared: it is not in this group.");
    }
    set(patch);
  },
  clearSpecies: () => set({ speciesKey: null, species: null, panel: get().panel === "species" ? "none" : get().panel, mode: "density" }),
}));

export function groupsFor(m: Manifest | null, lens: Lens) {
  if (!m) return [];
  const l = m.lenses[lens];
  return l.built && l.groups ? l.groups : [];
}
