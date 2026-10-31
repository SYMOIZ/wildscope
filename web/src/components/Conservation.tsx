// SI-02: the only module allowed to name the IUCN EX/EW categories (wording lint allow-list).
const LABELS: Record<string, string> = {
  LC: "Least Concern",
  NT: "Near Threatened",
  VU: "Vulnerable",
  EN: "Endangered",
  CR: "Critically Endangered",
  EW: "Extinct in the Wild",
  EX: "Extinct",
  DD: "Data Deficient",
  NE: "Not Evaluated",
};

export function iucnLabel(code: string): string {
  return LABELS[code] ?? code;
}

/** Classification chip: words always present, no alarm colour; no year because GBIF does not supply one. */
export function ConservationChip({ code, source }: { code: string; source: string }) {
  const assessed = code === "EX" || code === "EW";
  return (
    <span className="chip" data-source="LIVE" title={`Source: ${source}`}>
      {assessed ? "Assessed by IUCN as " : "IUCN: "}
      {iucnLabel(code)} ({code})
    </span>
  );
}
