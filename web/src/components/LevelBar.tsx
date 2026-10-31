import { fmtExact } from "../data/format";
import { retryLive } from "../state/live";
import { useStore } from "../state/store";

const LEVEL = [
  { name: "Global", what: "H3 cells of about 86,800 km² from the snapshot" },
  { name: "Regional", what: "H3 cells of about 1,770 km² from the snapshot" },
  { name: "Local", what: "every matching GBIF record as a dot; larger points can be clicked" },
];

/** Says which zoom level is active, what is drawn, and from which source. */
export function LevelBar() {
  const lod = useStore((s) => s.lod);
  const live = useStore((s) => s.live);
  const lens = useStore((s) => s.lens);
  const manifest = useStore((s) => s.manifest);
  const set = useStore((s) => s.set);
  if (!manifest) return null;
  const lv = LEVEL[lod];
  let detail: React.ReactNode = null;
  if (lod === 2) {
    if (lens !== "animals") detail = null;
    else if (live.status === "loading" && !live.result) detail = <> · loading records…</>;
    else if (live.status === "error") detail = <> · GBIF did not answer <button className="link" onClick={retryLive}>Retry</button></>;
    else if (live.result) {
      const shown = live.result.records.length;
      detail = (
        <>
          {" · "}
          <span data-source="LIVE">
            {fmtExact(live.result.count)} records in view{shown < live.result.count ? `, ${fmtExact(shown)} clickable` : ""}
          </span>
          {live.status === "loading" && " (updating…)"}
          {" "}<button className="link" onClick={() => set({ panel: "view" })}>Details</button>
        </>
      );
    }
  } else {
    detail = <> · zoom closer for individual records</>;
  }
  return (
    <div className="levelbar glass" role="status" aria-live="polite">
      <strong>{lv.name}</strong> <span className="muted">· {lv.what}</span>
      {detail}
    </div>
  );
}
