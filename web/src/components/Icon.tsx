// DESIGN_SYSTEM §6: outline icons, 1.5 px stroke, 20 px grid.
const PATHS: Record<string, string> = {
  search: "M9 15a6 6 0 1 0 0-12 6 6 0 0 0 0 12zm4.5-1.5L17 17",
  close: "M5 5l10 10M15 5L5 15",
  play: "M6 4l10 6-10 6z",
  pause: "M6 4v12M14 4v12",
  north: "M10 3l4 10-4-2-4 2zM10 17v0",
  plus: "M10 4v12M4 10h12",
  globe: "M10 18a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM2 10h16M10 2c2.5 2.2 3.5 5 3.5 8s-1 5.8-3.5 8c-2.5-2.2-3.5-5-3.5-8s1-5.8 3.5-8z",
  minus: "M4 10h12",
  info: "M10 18a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM10 9v5M10 6v.5",
  share: "M14 6a2 2 0 1 0 0-.1M6 12a2 2 0 1 0 0-.1M14 16a2 2 0 1 0 0-.1M7.7 11l4.6-4M7.7 13l4.6 2.5",
  external: "M11 4h5v5M16 4l-7 7M14 12v4H4V6h4",
  expand: "M5 12l5-5 5 5",
  collapse: "M5 8l5 5 5-5",
};

export function Icon({ name }: { name: keyof typeof PATHS | string }) {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={PATHS[name] ?? ""} />
    </svg>
  );
}
