import { h3IndexToSplitLong } from "h3-js";
import { describe, expect, it } from "vitest";
import { decodeWsc1 } from "./data/assets";
import { editDistanceAtMost1, fmtCount } from "./data/format";
import { GROUP_TAXON_KEYS, groupOfClass, licenceLabel, liveParams, photosOf, toRecord } from "./data/gbif";
import { rankSpecies } from "./data/search";
import type { BinDef, GroupDef, SearchEntry } from "./data/types";
import { heightToLod } from "./globe/lod";
import { classOf, computeBreaks } from "./globe/ramps";

function wsc1(cells: [string, number[]][], res = 4, group = 0): ArrayBuffer {
  const n = cells.length;
  const buf = new ArrayBuffer(12 + n * 44);
  const dv = new DataView(buf);
  "WSC1".split("").forEach((c, i) => dv.setUint8(i, c.charCodeAt(0)));
  dv.setUint8(4, 1);
  dv.setUint8(5, res);
  dv.setUint16(6, group, true);
  dv.setUint32(8, n, true);
  cells.forEach(([id, counts], i) => {
    const [lo, hi] = h3IndexToSplitLong(id);
    dv.setUint32(12 + 4 * i, hi, true);
    dv.setUint32(12 + 4 * n + 4 * i, lo, true);
    counts.forEach((c, b) => dv.setUint32(12 + 8 * n + 4 * (i * 9 + b), c, true));
  });
  return buf;
}

describe("WSC1 density files (A-02)", () => {
  it("round-trips ids and nine counts per cell", () => {
    const d = decodeWsc1(wsc1([["8442e45ffffffff", [1, 2, 3, 4, 5, 6, 7, 8, 9]], ["8442e47ffffffff", [0, 0, 0, 0, 0, 0, 0, 0, 30]]]));
    expect(d.ids).toEqual(["8442e45ffffffff", "8442e47ffffffff"]);
    expect(Array.from(d.counts.slice(0, 9))).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(d.index.get("8442e47ffffffff")).toBe(1);
  });
  it("rejects a bad magic or length", () => {
    const b = wsc1([["8442e45ffffffff", [1, 0, 0, 0, 0, 0, 0, 0, 0]]]);
    new DataView(b).setUint8(0, 0x58);
    expect(() => decodeWsc1(b)).toThrow();
    expect(() => decodeWsc1(wsc1([]).slice(0, 8))).toThrow();
  });
});

describe("zoom levels", () => {
  it("picks global, regional and local by camera height", () => {
    expect(heightToLod(20_000_000, 0)).toBe(0);
    expect(heightToLod(5_000_000, 0)).toBe(1);
    expect(heightToLod(500_000, 0)).toBe(2);
    expect(heightToLod(500_000, 1)).toBe(2);
    expect(heightToLod(3_000_000, 2)).toBe(1);
    expect(heightToLod(20_000_000, 2)).toBe(0);
  });
  it("applies 10% hysteresis at each threshold", () => {
    expect(heightToLod(7_500_000, 0)).toBe(0); // within 10% below 8,000 km
    expect(heightToLod(8_500_000, 1)).toBe(1); // within 10% above 8,000 km
    expect(heightToLod(1_150_000, 1)).toBe(1); // within 10% below 1,200 km
    expect(heightToLod(1_250_000, 2)).toBe(2);
    expect(heightToLod(1_000_000, 1)).toBe(2);
  });
});

describe("legend classes", () => {
  it("are strictly increasing integers for counts and cover the data", () => {
    const vals = Array.from({ length: 500 }, (_, i) => i + 1).concat([10_000]);
    const b = computeBreaks(vals);
    expect(b[0]).toBe(1);
    for (let i = 1; i < b.length; i++) expect(b[i]).toBeGreaterThan(b[i - 1]);
    expect(b.every(Number.isInteger)).toBe(true);
    expect(classOf(1, b)).toBe(0);
    expect(classOf(10_000, b)).toBe(b.length - 1);
  });
  it("ignore zero values (empty cells are transparent, never a class)", () => {
    expect(computeBreaks([0, 0, 0])).toEqual([]);
  });
});

describe("species search ranking", () => {
  const e = (key: string, sci: string, vern: string[], n: number): SearchEntry => [key, sci, vern, "animals", "birds", n];
  const shard = [e("1", "Turdus merula", ["Eurasian Blackbird"], 500), e("2", "Turdus migratorius", ["American Robin"], 900), e("3", "Erithacus rubecula", ["European Robin"], 800)];
  it("puts exact scientific, then exact vernacular, then prefix matches first", () => {
    expect(rankSpecies(shard, "turdus merula")[0][0]).toBe("1");
    expect(rankSpecies(shard, "American robin")[0][0]).toBe("2");
    expect(rankSpecies(shard, "turdus").map((x) => x[0])).toEqual(["2", "1"]);
  });
  it("matches word starts and one-letter typos", () => {
    expect(rankSpecies(shard, "robin").map((x) => x[0])).toEqual(["2", "3"]);
    expect(editDistanceAtMost1("turdus merula", "turdus merla")).toBe(true);
    expect(editDistanceAtMost1("turdus", "tordos")).toBe(false);
  });
});

describe("live GBIF queries", () => {
  const bins = [{ id: "B05", label: "1990s", tick: "1990s", from: 1990, to: 1999 }, { id: "B08", label: "2020–", tick: "2020–", from: 2020, to: null }] as BinDef[];
  it("apply the same licence, presence, coordinate and basis filters as the build", () => {
    const p = liveParams({ bbox: { west: 74.2, south: 31.4, east: 74.5, north: 31.7 }, group: "birds", bin: "B05", bins });
    expect(p.getAll("license").sort()).toEqual(["CC0_1_0", "CC_BY_4_0"]);
    expect(p.get("occurrenceStatus")).toBe("PRESENT");
    expect(p.get("hasGeospatialIssue")).toBe("false");
    expect(p.getAll("basisOfRecord")).toHaveLength(4);
    expect(p.getAll("taxonKey")).toEqual(["212"]);
    expect(p.get("year")).toBe("1990,1999");
    expect(p.get("decimalLatitude")).toBe("31.4000,31.7000");
  });
  it("use OR'd class keys for grouped classes and the species key in species mode", () => {
    const b = { west: 0, south: 0, east: 1, north: 1 };
    expect(liveParams({ bbox: b, group: "reptiles", bin: "all", bins }).getAll("taxonKey")).toEqual(GROUP_TAXON_KEYS.reptiles!.map(String));
    expect(liveParams({ bbox: b, group: "birds", bin: "all", bins, taxonKey: 2482499 }).getAll("taxonKey")).toEqual(["2482499"]);
    expect(liveParams({ bbox: b, group: "all", bin: "B08", bins }).get("year")).toMatch(/^2020,\d{4}$/);
  });
  it("normalise licences and refuse NC / ND / unknown", () => {
    expect(licenceLabel("http://creativecommons.org/publicdomain/zero/1.0/legalcode")).toBe("CC0");
    expect(licenceLabel("CC_BY_4_0")).toBe("CC BY 4.0");
    expect(licenceLabel("http://creativecommons.org/licenses/by-nc/4.0/")).toBeNull();
    expect(licenceLabel("http://creativecommons.org/licenses/by-nd/4.0/")).toBeNull();
    expect(licenceLabel(undefined)).toBeNull();
  });
  it("build GBIF image-cache URLs only for licensed still images", () => {
    // md5 of this identifier was checked against api.gbif.org (HTTP 200, image/jpeg) on 2026-10-31.
    const id = "https://inaturalist-open-data.s3.amazonaws.com/photos/626680284/original.jpg";
    const photos = photosOf(6234886364, [
      { type: "StillImage", identifier: id, license: "http://creativecommons.org/publicdomain/zero/1.0/", creator: "A. Observer" },
      { type: "StillImage", identifier: id + "?2", license: "http://creativecommons.org/licenses/by-nc/4.0/" },
      { type: "Sound", identifier: id + "?3", license: "http://creativecommons.org/publicdomain/zero/1.0/" },
    ]);
    expect(photos).toHaveLength(1);
    expect(photos[0].thumb).toMatch(/^https:\/\/api\.gbif\.org\/v1\/image\/cache\/200x\/occurrence\/6234886364\/media\/aa5663[0-9a-f]{26}$/);
    expect(photos[0].creator).toBe("A. Observer");
  });
  it("map API records and skip ones without coordinates", () => {
    const r = toRecord({ key: 1, decimalLatitude: 31.46, decimalLongitude: 74.23, species: "Corvus splendens", class: "Aves", basisOfRecord: "HUMAN_OBSERVATION", license: "CC_BY_4_0", eventDate: "2026-03-20T18:04:07", iucnRedListCategory: "LC" });
    expect(r).toMatchObject({ lat: 31.46, lon: 74.23, licence: "CC BY 4.0", iucn: "LC", uncertaintyM: null, photos: [] });
    expect(toRecord({ key: 2 })).toBeNull();
  });
  it("assign live records to groups by class name, like the build", () => {
    const groups = [{ id: "birds", label: "Birds", index: 2, classes: ["Aves"] }, { id: "fishes", label: "Fishes", index: 5, classes: ["Teleostei", "Actinopterygii"] }] as GroupDef[];
    expect(groupOfClass("Aves", groups)).toBe("birds");
    expect(groupOfClass("Actinopterygii", groups)).toBe("fishes");
    expect(groupOfClass("Gastropoda", groups)).toBe("other_invertebrates");
    expect(groupOfClass(null, groups)).toBe("other_invertebrates");
  });
});

describe("number formatting", () => {
  it("is exact under a million and abbreviated above", () => {
    expect(fmtCount(999_999)).toBe("999,999");
    expect(fmtCount(1_234_567)).toBe("1.2 M");
  });
});
