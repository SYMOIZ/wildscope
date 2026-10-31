import { groupsFor, useStore } from "../state/store";

export function GroupRail() {
  const manifest = useStore((s) => s.manifest);
  const lens = useStore((s) => s.lens);
  const group = useStore((s) => s.group);
  const setGroup = useStore((s) => s.setGroup);
  const groups = groupsFor(manifest, lens);
  if (!groups.length) return null;
  const totals = manifest?.lenses[lens].totalsByBin ?? {};
  return (
    <nav className="group-rail" aria-label="Group" id="group-rail">
      {groups.map((g, i) => {
        const empty = (totals[g.id] ?? []).every((n) => n === 0);
        return (
          <button
            key={g.id}
            aria-pressed={group === g.id}
            disabled={empty}
            title={empty ? "No qualifying records" : `${g.label} (${i + 1})`}
            onClick={() => setGroup(g.id)}
          >
            {g.label}
          </button>
        );
      })}
    </nav>
  );
}
