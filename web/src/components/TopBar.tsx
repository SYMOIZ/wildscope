import { groupsFor, useStore } from "../state/store";
import { Icon } from "./Icon";
import { SearchBox } from "./SearchBox";
import { shareView } from "./share";

export function TopBar() {
  const lens = useStore((s) => s.lens);
  const setLens = useStore((s) => s.setLens);
  const species = useStore((s) => s.species);
  const clearSpecies = useStore((s) => s.clearSpecies);
  const manifest = useStore((s) => s.manifest);
  const group = useStore((s) => s.group);
  const setGroup = useStore((s) => s.setGroup);
  const set = useStore((s) => s.set);
  const groups = groupsFor(manifest, lens);

  return (
    <header className="topbar">
      <div className="wordmark">WildScope</div>
      <div className="lens-switch" role="group" aria-label="Lens">
        {(["trees", "animals"] as const).map((l) => (
          <button key={l} aria-pressed={lens === l} onClick={() => setLens(l)} aria-keyshortcuts={l === "trees" ? "T" : "A"}>
            {l === "trees" ? "Trees" : "Animals"}
          </button>
        ))}
      </div>
      {groups.length > 0 && (
        <label className="group-menu">
          <span className="sr-only">Group</span>
          <select value={group} onChange={(e) => setGroup(e.target.value)}>
            {groups.map((g) => (
              <option key={g.id} value={g.id}>{g.label}</option>
            ))}
          </select>
        </label>
      )}
      <SearchBox />
      {species && (
        <span className="species-chip">
          <span className="muted small">Species:</span>
          <span className="sci">{species.canonicalName}</span>
          <button className="icon-btn" aria-label="Leave species mode" onClick={clearSpecies}>
            <Icon name="close" />
          </button>
        </span>
      )}
      <div className="spacer" />
      <button className="icon-btn" aria-label="Share view" title="Share view" onClick={shareView}>
        <Icon name="share" />
      </button>
      <button className="icon-btn" aria-label="Data notes" title="Data notes (I)" onClick={() => set({ notesOpen: true })} aria-keyshortcuts="I">
        <Icon name="info" />
      </button>
    </header>
  );
}
