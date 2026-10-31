import { fmtCount, fmtExact } from "../data/format";

/** Asset ids from API_CONTRACTS: every number on screen names its source (FR-28, AC-040). */
export type SourceId = "A-01" | "A-02" | "A-03" | "A-04" | "A-05" | "E-06" | "LIVE";

const SOURCE_LABEL: Record<SourceId, string> = {
  "A-01": "manifest",
  "A-02": "density file",
  "A-03": "species file",
  "A-04": "species index",
  "A-05": "region summary",
  "E-06": "Amazon Location place search",
  LIVE: "GBIF occurrence API, at request time",
};

/** A count rendered with its source id. Values >= 1 M are abbreviated; the exact value is in the title. */
export function Num({ value, source, exact = false }: { value: number; source: SourceId; exact?: boolean }) {
  return (
    <span className="mono" data-source={source} title={`${fmtExact(value)} · source ${source} (${SOURCE_LABEL[source]})`}>
      {exact ? fmtExact(value) : fmtCount(value)}
    </span>
  );
}
