"""WildScope data build (DATA_ARCHITECTURE §7): steps 0-4 and 8-10, Animals lens, H3 res 2 and 4.

Usage (from the repo root):
    python -m pipeline.wildscope.build all --snapshot latest --sample-every 400      # dev sample
    python -m pipeline.wildscope.build all --snapshot 2026-10-01                     # full snapshot
    python -m pipeline.wildscope.build publish --bucket <data-bucket> --distribution <id>

Each step reads the previous step's files from pipeline/work/<datasetId>/ so steps can be re-run.
"""

from __future__ import annotations

import argparse
import concurrent.futures as cf
import gzip
import hashlib
import json
import os
import random
import re
import sys
import time
import unicodedata
import socket
import urllib.parse
import urllib.request
from array import array
from datetime import date, datetime
from pathlib import Path

import duckdb
import h3
import yaml

from . import config as C

ROOT = Path(__file__).resolve().parents[2]
PIPE = ROOT / "pipeline"
CACHE = PIPE / "cache"
CONTRACTS = ROOT / "contracts"


socket.setdefaulttimeout(30)  # urllib timeouts do not cover every network stall


class BuildError(RuntimeError):
    pass


def log(msg: str) -> None:
    print(f"[{datetime.now().strftime('%H:%M:%S')}] {msg}", flush=True)


def dumps(obj) -> bytes:
    """Deterministic compact JSON (NFR-12: same inputs -> byte-identical outputs)."""
    return json.dumps(obj, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode("utf-8")


def sha256(b: bytes) -> str:
    return hashlib.sha256(b).hexdigest()


def brotli_size(b: bytes) -> int:
    import brotli

    return len(brotli.compress(b, quality=11))


def gzip_bytes(b: bytes) -> bytes:
    return gzip.compress(b, compresslevel=9, mtime=0)


def connect(threads: int | None = None) -> duckdb.DuckDBPyConnection:
    con = duckdb.connect()
    con.execute("INSTALL httpfs; LOAD httpfs; INSTALL h3 FROM community; LOAD h3;")
    con.execute(f"SET s3_region='{C.GBIF_REGION}'")
    con.execute("SET http_retries=8; SET http_retry_wait_ms=2000; SET http_timeout=120000")
    if threads:
        con.execute(f"SET threads={int(threads)}")
    return con


def s3_public():
    import boto3
    from botocore import UNSIGNED
    from botocore.config import Config

    return boto3.client("s3", region_name=C.GBIF_REGION, config=Config(signature_version=UNSIGNED))


def list_prefixes(s3, prefix: str) -> list[str]:
    out, token = [], None
    while True:
        kw = dict(Bucket=C.GBIF_BUCKET, Prefix=prefix, Delimiter="/")
        if token:
            kw["ContinuationToken"] = token
        r = s3.list_objects_v2(**kw)
        out += [p["Prefix"] for p in r.get("CommonPrefixes", [])]
        if not r.get("IsTruncated"):
            return out
        token = r["NextContinuationToken"]


def list_objects(s3, prefix: str) -> list[dict]:
    out, token = [], None
    while True:
        kw = dict(Bucket=C.GBIF_BUCKET, Prefix=prefix)
        if token:
            kw["ContinuationToken"] = token
        r = s3.list_objects_v2(**kw)
        out += r.get("Contents", [])
        if not r.get("IsTruncated"):
            return out
        token = r["NextContinuationToken"]


def load_groups() -> dict:
    return yaml.safe_load((PIPE / "config" / "groups.yaml").read_text(encoding="utf-8"))


def group_case_sql(groups: dict) -> str:
    parts = []
    for g in groups["groups"]:
        if g.get("catch_all"):
            continue
        names = ", ".join("'" + c.replace("'", "''") + "'" for c in g["classes"])
        parts.append(f"WHEN class IN ({names}) THEN '{g['id']}'")
    catch = next(g["id"] for g in groups["groups"] if g.get("catch_all"))
    return "CASE " + " ".join(parts) + f" ELSE '{catch}' END"


def bin_case_sql() -> str:
    # B00 = before 1950; B01..B07 = decades 1950s..2010s; B08 = 2020 onwards.
    return "CASE WHEN year < 1950 THEN 0 ELSE least((year - 1950) // 10 + 1, 8) END"


# --------------------------------------------------------------------------------------
# Step 0 - verify
# --------------------------------------------------------------------------------------

def step0_verify(args, work: Path) -> dict:
    s3 = s3_public()
    snaps = sorted(p.split("/")[-2] for p in list_prefixes(s3, C.GBIF_PREFIX))
    if not snaps:
        raise BuildError("No snapshots listed under s3://%s/%s" % (C.GBIF_BUCKET, C.GBIF_PREFIX))
    snap = snaps[-1] if args.snapshot == "latest" else args.snapshot
    if snap not in snaps:
        raise BuildError(f"Snapshot {snap} not found; available: {snaps[-5:]}")
    parquet_prefix = f"{C.GBIF_PREFIX}{snap}/occurrence.parquet/"
    objs = [o for o in list_objects(s3, parquet_prefix) if o["Size"] > 0]
    if not objs:
        raise BuildError(f"No Parquet parts under {parquet_prefix}")
    objs.sort(key=lambda o: o["Key"])
    citation = None
    try:
        citation = s3.get_object(Bucket=C.GBIF_BUCKET, Key=f"{C.GBIF_PREFIX}{snap}/citation.txt")["Body"].read().decode("utf-8").strip()
    except Exception as e:  # noqa: BLE001 - citation is recorded as missing, not fatal
        log(f"citation.txt not readable: {e}")

    con = connect()
    first = f"s3://{C.GBIF_BUCKET}/{objs[0]['Key']}"
    cols = {r[0]: r[1] for r in con.execute(f"DESCRIBE SELECT * FROM read_parquet('{first}')").fetchall()}
    problems = []
    for name, typ in C.REQUIRED_COLUMNS.items():
        if name not in cols:
            problems.append(f"missing column {name}")
        elif cols[name] != typ:
            problems.append(f"column {name} is {cols[name]}, expected {typ}")
    if problems:
        raise BuildError("Schema verification failed: " + "; ".join(problems))

    # Enumerations on a sample of parts (cheap: three small columns).
    sample_keys = [o["Key"] for o in objs[:: max(1, len(objs) // 4)]][:4]
    files = [f"s3://{C.GBIF_BUCKET}/{k}" for k in sample_keys]
    enums = {}
    for col in ("license", "basisofrecord", "occurrencestatus"):
        enums[col] = sorted(
            [r[0], r[1]] for r in con.execute(f"SELECT {col}, count(*) FROM read_parquet({files}) GROUP BY 1").fetchall() if r[0] is not None
        )
    seen_lic = {e[0] for e in enums["license"]}
    for lic in C.LICENCES_KEPT:
        if lic not in seen_lic:
            log(f"warning: licence value {lic} not seen in the step-0 sample")
    seen_basis = {e[0] for e in enums["basisofrecord"]}
    unknown_status = {e[0] for e in enums["occurrencestatus"]} - {"PRESENT", "ABSENT"}
    if unknown_status:
        raise BuildError(f"Unexpected occurrencestatus values: {unknown_status}")

    schema = {
        "snapshot": snap,
        "source": f"s3://{C.GBIF_BUCKET}/{parquet_prefix}",
        "parts": len(objs),
        "bytes": sum(o["Size"] for o in objs),
        "columns": cols,
        "requiredColumns": C.REQUIRED_COLUMNS,
        "specColumnsAbsent": [c for c in C.SPEC_COLUMNS_ABSENT_OK if c not in cols],
        "enumerationsSample": {"files": sample_keys, **enums},
        "basisValuesSeen": sorted(seen_basis),
        "citation": citation,
    }
    (work / "schema.json").write_bytes(dumps(schema))
    (work / "parts.json").write_bytes(dumps([[o["Key"], o["Size"]] for o in objs]))
    log(f"step 0 ok: snapshot {snap}, {len(objs)} parts, {schema['bytes'] / 1e9:.1f} GB; absent spec columns: {schema['specColumnsAbsent']}")
    return schema


# --------------------------------------------------------------------------------------
# Step 1 - filter (F1-F9), one pass, every stage's drop count recorded
# --------------------------------------------------------------------------------------

def select_parts(args, parts: list) -> list:
    keys = [k for k, _ in parts]
    if args.sample_every and args.sample_every > 1:
        keys = keys[args.sample_offset :: args.sample_every]
    if args.max_files:
        keys = keys[: args.max_files]
    return keys


def step1_filter(args, work: Path, schema: dict) -> dict:
    parts = json.loads((work / "parts.json").read_text())
    keys = select_parts(args, parts)
    files = [f"s3://{C.GBIF_BUCKET}/{k}" for k in keys]
    snap_year = int(schema["snapshot"][:4])
    geo = ", ".join(f"'{x}'" for x in C.GEOSPATIAL_ISSUES)
    basis = ", ".join(f"'{x}'" for x in C.BASIS_KEPT)
    lic = ", ".join(f"'{x}'" for x in C.LICENCES_KEPT)
    country = ""
    if args.country:
        if not re.fullmatch(r"[A-Z]{2}", args.country):
            raise BuildError("--country must be an ISO 3166-1 alpha-2 code")
        country = f"WHERE countrycode = '{args.country}'"

    stage = f"""
      CASE
        WHEN decimallatitude IS NULL OR decimallongitude IS NULL
             OR decimallatitude NOT BETWEEN -90 AND 90 OR decimallongitude NOT BETWEEN -180 AND 180
             OR (decimallatitude = 0 AND decimallongitude = 0) THEN 'F1'
        WHEN issue IS NOT NULL AND list_has_any(issue, [{geo}]) THEN 'F2'
        WHEN occurrencestatus IS DISTINCT FROM 'PRESENT' THEN 'F3'
        WHEN basisofrecord IS NULL OR basisofrecord NOT IN ({basis}) THEN 'F4'
        WHEN license IS NULL OR license NOT IN ({lic}) THEN 'F5'
        WHEN specieskey IS NULL OR specieskey = '' THEN 'F6'
        WHEN year IS NULL OR year < {C.MIN_YEAR} OR year > {snap_year} THEN 'F7'
        WHEN coordinateuncertaintyinmeters > {C.MAX_UNCERTAINTY_M_R2_R4} THEN 'F8'
        WHEN kingdom IS DISTINCT FROM 'Animalia' THEN 'F9'
        ELSE 'kept' END"""
    kept_cols = ["specieskey", "species", "phylum", "class", '"order"', "family", "genus", "year", "license", "countrycode"]
    proj = ",\n".join(f"CASE WHEN stage = 'kept' THEN {c} END AS {c}" for c in kept_cols)
    select_sql = f"""
        SELECT stage,
               CASE WHEN stage = 'F4' THEN basisofrecord END AS basis,
               {proj},
               CASE WHEN stage = 'kept' THEN decimallatitude END AS lat,
               CASE WHEN stage = 'kept' THEN decimallongitude END AS lon,
               CASE WHEN stage = 'kept' THEN coordinateuncertaintyinmeters IS NULL END AS unc_null
        FROM (SELECT *, {stage} AS stage FROM read_parquet('{{f}}') {country})"""
    log(f"step 1: reading {len(files)} of {len(parts)} parts{' for country ' + args.country if args.country else ''}")
    t = time.time()
    staged_dir = work / "staged"
    staged_dir.mkdir(exist_ok=True)
    # One staged file per part: resumable after network failures, and parts are processed in parallel.
    wanted = {}
    for f in files:
        wanted[f] = staged_dir / (f.rsplit("/", 1)[-1] + ".parquet")
    for stale in set(staged_dir.glob("*.parquet")) - set(wanted.values()):
        stale.unlink()

    def run_part(f: str) -> None:
        dest = wanted[f]
        if dest.exists():
            return
        tmp = dest.with_suffix(".tmp")
        for attempt in range(5):
            try:
                c = connect(4)
                c.execute(f"COPY ({select_sql.format(f=f)}) TO '{tmp.as_posix()}' (FORMAT parquet, COMPRESSION zstd)")
                c.close()
                tmp.replace(dest)
                return
            except duckdb.Error as e:
                log(f"  part {f.rsplit('/', 1)[-1]} attempt {attempt + 1} failed: {str(e)[:120]}")
                time.sleep(5 * (attempt + 1))
        raise BuildError(f"could not read {f}")

    done = 0
    with cf.ThreadPoolExecutor(max_workers=args.parallel) as ex:
        for _ in ex.map(run_part, files):
            done += 1
            if done % 5 == 0 or done == len(files):
                log(f"  parts {done}/{len(files)} ({time.time() - t:.0f} s)")
    con = connect(args.threads)
    staged = (staged_dir / "*.parquet").as_posix()
    counts = dict(con.execute(f"SELECT stage, count(*) FROM read_parquet('{staged}') GROUP BY 1").fetchall())
    basis_dropped = dict(con.execute(f"SELECT basis, count(*) FROM read_parquet('{staged}') WHERE stage='F4' GROUP BY 1").fetchall())
    unc_null = con.execute(f"SELECT count(*) FROM read_parquet('{staged}') WHERE stage='kept' AND unc_null").fetchone()[0]
    rows_read = sum(counts.values())
    stats = {
        "rowsRead": rows_read,
        "kept": counts.get("kept", 0),
        "dropped": {f: counts.get(f, 0) for f, _ in C.FILTERS},
        "basisDropped": {str(k): v for k, v in sorted(basis_dropped.items(), key=lambda kv: str(kv[0]))},
        "keptWithNullUncertainty": unc_null,
        "partsRead": keys,
        "seconds": round(time.time() - t, 1),
    }
    if stats["kept"] == 0:
        raise BuildError("No records kept after filtering; check the slice parameters")
    (work / "filter_stats.json").write_bytes(dumps(stats))
    log(f"step 1 ok: {rows_read:,} rows read, {stats['kept']:,} kept in {stats['seconds']} s")
    return stats


# --------------------------------------------------------------------------------------
# Steps 2-3 - assign H3 cells and aggregate
# --------------------------------------------------------------------------------------

def step23_aggregate(args, work: Path) -> dict:
    groups = load_groups()
    con = duckdb.connect((work / "agg.duckdb").as_posix())
    con.execute("INSTALL h3 FROM community; LOAD h3;")
    if args.threads:
        con.execute(f"SET threads={int(args.threads)}")
    staged = (work / "staged" / "*.parquet").as_posix()
    con.execute(f"""
      CREATE OR REPLACE TABLE kept AS
      SELECT specieskey, phylum, class, year, license, countrycode,
             h3_latlng_to_cell(lat, lon, 4) AS c4,
             {bin_case_sql()} AS bin,
             {group_case_sql(groups)} AS grp
      FROM read_parquet('{staged}') WHERE stage = 'kept'""")
    # Taxonomy text once per species, not per record (keeps the full-snapshot table narrow).
    con.execute(f"""
      CREATE OR REPLACE TABLE taxa AS
      SELECT specieskey, mode(species) AS species, mode(phylum) AS phylum, mode(class) AS class,
             mode("order") AS ord, mode(family) AS family, mode(genus) AS genus
      FROM read_parquet('{staged}') WHERE stage = 'kept' GROUP BY specieskey""")

    # Class inventory and the unmapped-chordate check (DATA §5.1).
    total = con.execute("SELECT count(*) FROM kept").fetchone()[0]
    inv = con.execute("SELECT phylum, class, grp, count(*) n FROM kept GROUP BY ALL ORDER BY n DESC").fetchall()
    allowed = {c for g in groups["groups"] for c in g.get("classes", []) + g.get("chordate_classes", [])}
    unmapped = [
        (p, c, n) for p, c, g, n in inv if p == "Chordata" and c not in allowed and n / total >= 0.0001
    ]
    if unmapped:
        raise BuildError(f"Chordate classes not mapped in groups.yaml (>=0.01% of kept records): {unmapped}")
    inventory = [{"phylum": p, "class": c, "group": g, "records": n} for p, c, g, n in inv]

    con.execute("CREATE OR REPLACE TABLE agg4 AS SELECT grp, c4 AS cell, bin, count(*)::UINTEGER n FROM kept GROUP BY ALL")
    log(f"step 2-3 ok: {total:,} kept records, {con.execute('SELECT count(DISTINCT cell) FROM agg4').fetchone()[0]:,} populated r4 cells")
    con.close()
    out = {"keptAnimals": total, "classInventory": inventory}
    (work / "aggregate_stats.json").write_bytes(dumps(out))
    return out


# --------------------------------------------------------------------------------------
# Step 4 - species files and search index
# --------------------------------------------------------------------------------------

def fetch_json(url: str):
    req = urllib.request.Request(url, headers={"User-Agent": C.USER_AGENT, "Accept": "application/json"})
    for attempt in range(4):
        try:
            with urllib.request.urlopen(req, timeout=20) as r:
                return json.loads(r.read().decode("utf-8"))
        except Exception:  # noqa: BLE001
            if attempt == 3:
                raise
            time.sleep(1.5 * (attempt + 1))


def col_names(key: str) -> dict:
    """Accepted name, rank, status and vernacular names from ChecklistBank (cached).

    The 2026 GBIF snapshot keys species by Catalogue of Life eXtended Release ids (e.g. 93Q3Q),
    which the GBIF v1 species API does not resolve; ChecklistBank serves them (COL XR, CC BY 4.0).
    """
    path = CACHE / "col_species" / f"{key}.json"
    if path.exists():
        return json.loads(path.read_text(encoding="utf-8"))
    base = f"https://api.checklistbank.org/dataset/{C.COL_DATASET}/taxon/{urllib.parse.quote(key)}"
    tx = fetch_json(base)
    vn = fetch_json(base + "/vernacular")
    names, seen = [], set()
    for r in vn or []:
        name = (r.get("name") or "").strip()
        lang = (r.get("language") or "").strip() or None
        k = (name.lower(), lang)
        if name and k not in seen:
            seen.add(k)
            names.append({"name": name, "lang": lang})
    # English first, then other languages; stable within language.
    names.sort(key=lambda n: (0 if n["lang"] == "eng" else 1, n["lang"] or "~"))
    nm = tx.get("name") or {}
    out = {
        "scientificName": " ".join(x for x in (nm.get("scientificName"), nm.get("authorship")) if x) or None,
        "canonicalName": nm.get("scientificName"),
        "authorship": nm.get("authorship") or None,
        "rank": (nm.get("rank") or "").upper() or None,
        "taxonomicStatus": (tx.get("status") or "").upper() or None,
        "datasetKey": tx.get("datasetKey"),
        "vernacularNames": names[:12],
        "vernacularNamesTotal": len(names),
    }
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(out, ensure_ascii=False, sort_keys=True), encoding="utf-8")
    return out


def coldp_names(keys: list[str]) -> dict[str, dict]:
    """Bulk names from the Catalogue of Life ColDP download (full-snapshot runs; no per-species calls).

    Uses the base COL release; species only present in the eXtended Release keep the snapshot name.
    """
    import zipfile

    zpath = CACHE / "coldp" / "latest_coldp.zip"
    zpath.parent.mkdir(parents=True, exist_ok=True)
    if not zpath.exists():
        log(f"step 4: downloading {C.COLDP_URL}")
        tmp = zpath.with_suffix(".part")
        req = urllib.request.Request(C.COLDP_URL, headers={"User-Agent": C.USER_AGENT})
        with urllib.request.urlopen(req, timeout=120) as r, open(tmp, "wb") as f:
            while chunk := r.read(1 << 20):
                f.write(chunk)
        tmp.replace(zpath)
    out_dir = zpath.parent / "x"
    with zipfile.ZipFile(zpath) as z:
        members = {Path(n).name: n for n in z.namelist()}
        for want in ("NameUsage.tsv", "VernacularName.tsv"):
            if want not in members:
                raise BuildError(f"{want} not found in {zpath.name}")
            if not (out_dir / want).exists():
                z.extract(members[want], out_dir)
                (out_dir / members[want]).replace(out_dir / want)
    con = duckdb.connect()
    con.execute("CREATE TEMP TABLE sel AS SELECT unnest(?::VARCHAR[]) AS id", [keys])

    def table(name: str, cols: list[str]) -> str:
        # ColDP headers are prefixed "col:"; quoting is off because names may contain quotes.
        with (out_dir / name).open(encoding="utf-8") as f:
            head = f.readline().rstrip("\r\n").split("\t")
        found = {h.split(":", 1)[-1]: h for h in head}
        missing = [c for c in cols if c not in found]
        if missing:
            raise BuildError(f"{name} lacks columns {missing}")
        sel = ", ".join(f'"{found[c]}" AS "{c}"' for c in cols)
        return f"(SELECT {sel} FROM read_csv('{(out_dir / name).as_posix()}', delim='\\t', quote='', escape='', header=true, all_varchar=true, ignore_errors=true))"

    usage = table("NameUsage.tsv", ["ID", "scientificName", "authorship", "rank", "status"])
    vern = table("VernacularName.tsv", ["taxonID", "name", "language"])
    out: dict[str, dict] = {}
    for i, sci, auth, rank, status in con.execute(f"SELECT u.* FROM {usage} u JOIN sel ON u.ID = sel.id").fetchall():
        out[i] = {
            "scientificName": " ".join(x for x in (sci, auth) if x) or None,
            "canonicalName": sci,
            "authorship": auth or None,
            "rank": (rank or "").upper() or None,
            "taxonomicStatus": (status or "").upper().replace(" ", "_") or None,
            "datasetKey": "COL ColDP latest",
            "vernacularNames": [],
            "vernacularNamesTotal": 0,
        }
    rows = con.execute(f"SELECT v.taxonID, v.name, v.language FROM {vern} v JOIN sel ON v.taxonID = sel.id ORDER BY 1, 3, 2").fetchall()
    seen: dict[str, set] = {}
    allnames: dict[str, list] = {}
    for tid, name, lang in rows:
        if tid not in out or not name:
            continue
        k = (name.strip().lower(), lang or None)
        if k in seen.setdefault(tid, set()):
            continue
        seen[tid].add(k)
        allnames.setdefault(tid, []).append({"name": name.strip(), "lang": lang or None})
    for tid, names in allnames.items():
        names.sort(key=lambda n: (0 if n["lang"] == "eng" else 1, n["lang"] or "~"))
        out[tid]["vernacularNames"] = names[:12]
        out[tid]["vernacularNamesTotal"] = len(names)
    con.close()
    return out


def fold(s: str) -> str:
    return "".join(ch for ch in unicodedata.normalize("NFKD", s.lower()) if not unicodedata.combining(ch))


def prefixes_for(names: list[str]) -> set[str]:
    out = set()
    for name in names:
        f = fold(name)
        for word in [f] + re.split(r"[\s\-'’]+", f):
            p = word[:2]
            if re.fullmatch(r"[a-z]{2}", p):
                out.add(p)
    return out


def step4_species(args, work: Path, out_dir: Path) -> dict:
    sensitive = {str(s["speciesKey"]): s.get("reason", "") for s in (yaml.safe_load((PIPE / "config" / "sensitive.yaml").read_text()) or {}).get("species") or []}
    con = duckdb.connect((work / "agg.duckdb").as_posix(), read_only=True)
    con.execute("LOAD h3;")
    min_records = args.min_species_records
    meta = con.execute(f"""
      SELECT k.specieskey, any_value(t.species), any_value(t.phylum), any_value(t.class), any_value(t.ord),
             any_value(t.family), any_value(t.genus), mode(k.grp),
             count(*) n, min(k.year), max(k.year),
             count(*) FILTER (WHERE k.license = 'CC0_1_0'), count(*) FILTER (WHERE k.license = 'CC_BY_4_0')
      FROM kept k JOIN taxa t USING (specieskey)
      GROUP BY k.specieskey HAVING count(*) >= {min_records} ORDER BY k.specieskey""").fetchall()
    keys = [m[0] for m in meta]
    log(f"step 4: {len(keys):,} species with >= {min_records} kept records")
    if not keys:
        raise BuildError("No species reached MIN_SPECIES_RECORDS")
    con.execute("CREATE TEMP TABLE sel AS SELECT unnest(?::VARCHAR[]) AS specieskey", [keys])
    countries: dict[str, list] = {}
    for k, cc, n in con.execute("""
        SELECT specieskey, countrycode, n FROM (
          SELECT specieskey, countrycode, n,
                 row_number() OVER (PARTITION BY specieskey ORDER BY n DESC, countrycode) rn
          FROM (SELECT specieskey, countrycode, count(*) n
                FROM kept JOIN sel USING (specieskey) WHERE countrycode IS NOT NULL GROUP BY 1, 2))
        WHERE rn <= 5 ORDER BY specieskey, rn""").fetchall():
        countries.setdefault(k, []).append([cc, n])

    names: dict[str, dict] = {}
    if args.names == "coldp":
        names = coldp_names(keys)
        log(f"step 4: ColDP names for {len(names):,} of {len(keys):,} species")
    if args.names == "api":
        log(f"step 4: fetching names from ChecklistBank ({C.COL_DATASET}) for {len(keys):,} species (cached in pipeline/cache)")
        with cf.ThreadPoolExecutor(max_workers=6) as ex:
            futs = {ex.submit(col_names, k): k for k in keys}
            for i, fut in enumerate(cf.as_completed(futs), 1):
                k = futs[fut]
                try:
                    names[k] = fut.result()
                except Exception as e:  # noqa: BLE001 - species keeps its snapshot name
                    log(f"names unavailable for {k}: {e}")
                if i % 500 == 0:
                    log(f"  names {i:,}/{len(keys):,}")

    sp_dir = out_dir / "species"
    sp_dir.mkdir(parents=True, exist_ok=True)
    search: dict[str, list] = {}
    meta_by_key = {m[0]: m for m in meta}
    sizes = []

    def emit(key: str, cells: list) -> None:
        _, sp_name, phylum, cls, order, family, genus, grp, n, y0, y1, cc0, ccby = meta_by_key[key]
        nm = names.get(key, {})
        canonical = nm.get("canonicalName") or sp_name
        by_bin = [sum(c[1][b] for c in cells) for b in range(9)]
        if sum(by_bin) != n:
            raise BuildError(f"species {key}: cell sum {sum(by_bin)} != record count {n}")
        doc = {
            "schemaVersion": C.SCHEMA_VERSION,
            "speciesKey": key,
            "scientificName": nm.get("scientificName") or sp_name,
            "canonicalName": canonical,
            "rank": nm.get("rank"),
            "taxonomicStatus": nm.get("taxonomicStatus"),
            "vernacularNames": nm.get("vernacularNames", []),
            "vernacularNamesTotal": nm.get("vernacularNamesTotal", 0),
            "lens": "animals",
            "group": grp,
            "taxonomy": {"kingdom": "Animalia", "phylum": phylum, "class": cls, "order": order, "family": family, "genus": genus},
            "conservation": {"category": None, "source": None, "assessmentYear": None, "iucnUrl": None, "retrieved": None},
            "sensitive": key in sensitive,
            "records": {
                "total": n,
                "earliestYear": y0,
                "latestYear": y1,
                "byBin": by_bin,
                "licence": {"CC0_1_0": cc0, "CC_BY_4_0": ccby},
                "topCountries": countries.get(key, []),
            },
            "cells": {"res": 4, "cells": cells},
            "taxonUrl": f"https://www.catalogueoflife.org/data/taxon/{key}",
        }
        b = dumps(doc)
        (sp_dir / f"{key}.json").write_bytes(b)
        sizes.append(len(gzip_bytes(b)))
        vern = [v["name"] for v in doc["vernacularNames"] if v["lang"] in ("eng", None)][:5] or [v["name"] for v in doc["vernacularNames"]][:3]
        entry = [key, canonical, vern, "animals", grp, n]
        for p in prefixes_for([canonical] + vern):
            search.setdefault(p, []).append(entry)

    # Stream (species, cell, bin) rows ordered by species and write each file as soon as it is complete.
    cur = con.execute("""
      SELECT specieskey, h3_h3_to_string(c4), bin, count(*)::INTEGER
      FROM kept JOIN sel USING (specieskey) GROUP BY ALL ORDER BY 1, 2, 3""")
    cur_key, cells, written = None, [], 0
    while True:
        rows = cur.fetchmany(200_000)
        if not rows:
            break
        for k, cell, b, n in rows:
            if k != cur_key:
                if cur_key is not None:
                    emit(cur_key, cells)
                    written += 1
                cur_key, cells = k, []
            if not cells or cells[-1][0] != cell:
                cells.append([cell, [0] * 9])
            cells[-1][1][b] = n
    if cur_key is not None:
        emit(cur_key, cells)
        written += 1
    con.close()
    if written != len(keys):
        raise BuildError(f"wrote {written} species files, expected {len(keys)}")

    se_dir = out_dir / "search"
    se_dir.mkdir(parents=True, exist_ok=True)
    shard_sizes = {}
    for p, entries in search.items():
        entries.sort(key=lambda e: (-e[5], e[1]))
        b = dumps(entries)
        (se_dir / f"{p}.json").write_bytes(b)
        shard_sizes[p] = len(gzip_bytes(b))
    stats = {
        "species": len(keys),
        "namesSource": args.names,
        "namesResolved": len(names),
        "namesDatasetKeys": sorted({n["datasetKey"] for n in names.values() if n.get("datasetKey")}),
        "searchPrefixes": sorted(search),
        "speciesGzipBytesMax": max(sizes),
        "searchGzipBytesMax": max(shard_sizes.values()),
        "sensitiveSpecies": sorted(k for k in keys if k in sensitive),
    }
    (work / "species_stats.json").write_bytes(dumps(stats))
    log(f"step 4 ok: {len(keys):,} species files, {len(search)} search shards")
    return stats


# --------------------------------------------------------------------------------------
# Step 8 - encode density files (WSC1) and the manifest
# --------------------------------------------------------------------------------------

def encode_wsc1(res: int, group_index: int, cells: list[int], counts: list[list[int]]) -> bytes:
    assert sys.byteorder == "little"
    hi = array("I", [c >> 32 for c in cells])
    lo = array("I", [c & 0xFFFFFFFF for c in cells])
    flat = array("I", [v for row in counts for v in row])
    header = b"WSC1" + bytes([1, res]) + group_index.to_bytes(2, "little") + len(cells).to_bytes(4, "little")
    return header + hi.tobytes() + lo.tobytes() + flat.tobytes()


def decode_wsc1(b: bytes) -> dict:
    if b[:4] != b"WSC1" or b[4] != 1:
        raise BuildError("bad WSC1 header")
    res, gi, n = b[5], int.from_bytes(b[6:8], "little"), int.from_bytes(b[8:12], "little")
    if len(b) != 12 + n * 4 * 11:
        raise BuildError("bad WSC1 length")
    hi = array("I"); hi.frombytes(b[12 : 12 + 4 * n])
    lo = array("I"); lo.frombytes(b[12 + 4 * n : 12 + 8 * n])
    cnt = array("I"); cnt.frombytes(b[12 + 8 * n :])
    return {"res": res, "group": gi, "cells": {(h << 32) | l: list(cnt[i * 9 : i * 9 + 9]) for i, (h, l) in enumerate(zip(hi, lo))}}


def step8_encode(args, work: Path, out_dir: Path, dataset_id: str) -> dict:
    groups = load_groups()
    schema = json.loads((work / "schema.json").read_text())
    fstats = json.loads((work / "filter_stats.json").read_text())
    astats = json.loads((work / "aggregate_stats.json").read_text())
    sstats = json.loads((work / "species_stats.json").read_text())
    con = duckdb.connect((work / "agg.duckdb").as_posix(), read_only=True)
    con.execute("LOAD h3;")
    group_ids = ["all"] + [g["id"] for g in groups["groups"]]
    assets, totals, size_report = {}, {}, {}
    for gi, gid in enumerate(group_ids):
        where = "" if gid == "all" else f"WHERE grp = '{gid}'"
        for res in C.RESOLUTIONS:
            cell_expr = "cell" if res == 4 else f"h3_cell_to_parent(cell, {res})"
            rows = con.execute(f"SELECT {cell_expr} c, bin, sum(n)::BIGINT FROM agg4 {where} GROUP BY ALL ORDER BY c, bin").fetchall()
            cells, counts = [], []
            for c, b, n in rows:
                if not cells or cells[-1] != c:
                    cells.append(c)
                    counts.append([0] * 9)
                counts[-1][b] = n
            b = encode_wsc1(res, gi, cells, counts)
            rel = f"cells/animals/{gid}/r{res}.bin"
            p = out_dir / rel
            p.parent.mkdir(parents=True, exist_ok=True)
            p.write_bytes(b)
            br = brotli_size(b)
            assets[rel] = {"sha256": sha256(b), "bytes": len(b), "brotliBytes": br, "cells": len(cells)}
            if res == 4:
                totals[gid] = [sum(r[i] for r in counts) for i in range(9)]
    con.close()

    initial = assets["cells/animals/all/r2.bin"]["brotliBytes"] + assets["cells/animals/all/r4.bin"]["brotliBytes"]
    size_report = {
        "initialPayloadBrotliBytes": initial,
        "initialPayloadLimitBytes": 6_000_000,
        "initialPayloadOk": initial <= 6_000_000,
        "largestShardBrotliBytes": max(a["brotliBytes"] for a in assets.values()),
        "speciesGzipBytesMax": sstats["speciesGzipBytesMax"],
        "searchGzipBytesMax": sstats["searchGzipBytesMax"],
        "shardLimitBytes": 600_000,
    }
    size_report["shardsOk"] = max(size_report["largestShardBrotliBytes"], sstats["speciesGzipBytesMax"], sstats["searchGzipBytesMax"]) <= 600_000

    hashes = {}
    for sub in ("species", "search"):
        h = hashlib.sha256()
        for f in sorted((out_dir / sub).glob("*.json")):
            h.update(f.name.encode() + b"\0" + hashlib.sha256(f.read_bytes()).digest())
        hashes[sub] = h.hexdigest()

    sample = bool(args.sample_every and args.sample_every > 1) or bool(args.max_files)
    manifest = {
        "schemaVersion": C.SCHEMA_VERSION,
        "datasetId": dataset_id,
        "snapshot": {
            "id": schema["snapshot"],
            "source": schema["source"],
            "registryUrl": C.GBIF_REGISTRY_URL,
            "parts": schema["parts"],
            "bytes": schema["bytes"],
            "citation": schema["citation"],
        },
        "retrievedAt": args.retrieved or date.today().isoformat(),
        "build": {
            "kind": "sample" if sample else ("country" if args.country else "full"),
            "partsRead": len(fstats["partsRead"]),
            "partsTotal": schema["parts"],
            "sampleEvery": args.sample_every or 1,
            "sampleOffset": args.sample_offset,
            "country": args.country,
            "lensesBuilt": ["animals"],
            "resolutions": list(C.RESOLUTIONS),
            "tools": {"python": sys.version.split()[0], "duckdb": duckdb.__version__, "h3": h3.__version__},
        },
        "constants": {
            "MIN_EFFORT": C.MIN_EFFORT,
            "MIN_SPECIES_RECORDS": args.min_species_records,
            "MAX_UNCERTAINTY_M": C.MAX_UNCERTAINTY_M_R2_R4,
            "MIN_YEAR": C.MIN_YEAR,
        },
        "bins": C.BINS,
        "lenses": {
            "animals": {
                "built": True,
                "groupsVersion": groups["version"],
                "groups": [
                    {"id": "all", "label": "All", "index": 0}
                ] + [
                    {"id": g["id"], "label": g["label"], "index": i + 1, "classes": g.get("classes", []), "note": g.get("note")}
                    for i, g in enumerate(groups["groups"])
                ],
                "totalsByBin": totals,
            },
            "trees": {
                "built": False,
                "reason": "The tree species list (UD-04) is not settled, so the Trees lens has no data in this build.",
            },
        },
        "filters": {
            "rowsRead": fstats["rowsRead"],
            "kept": fstats["kept"],
            "stages": [{"id": f, "rule": rule, "dropped": fstats["dropped"][f]} for f, rule in C.FILTERS],
            "basisDropped": fstats["basisDropped"],
            "keptWithNullUncertainty": fstats["keptWithNullUncertainty"],
            "geospatialIssueFlags": C.GEOSPATIAL_ISSUES,
            "notApplied": [
                "Duplicate-record removal across publishers",
                "Outlier detection beyond GBIF's own flags",
                "Sensitive rule 1 (share of generalised records): the snapshot has no datageneralizations column",
            ],
        },
        "species": {
            "count": sstats["species"],
            "namesSource": (f"Catalogue of Life eXtended Release via ChecklistBank (dataset {', '.join(map(str, sstats['namesDatasetKeys']))}, CC BY 4.0)"
                            if sstats["namesSource"] in ("api", "coldp") else "snapshot species column only"),
            "namesResolved": sstats["namesResolved"],
            "searchPrefixes": sstats["searchPrefixes"],
            "sensitive": sstats["sensitiveSpecies"],
            "conservationSource": None,
        },
        "assets": {"cells": assets, "speciesSha256": hashes["species"], "searchSha256": hashes["search"]},
        "sizeReport": size_report,
        "classInventory": astats["classInventory"][:60],
        "attribution": [
            "GBIF.org occurrence snapshot " + schema["snapshot"] + ", Registry of Open Data on AWS (CC0 and CC BY 4.0 records only)",
            "Species names: Catalogue of Life eXtended Release (CC BY 4.0) via ChecklistBank",
            "H3 (Apache-2.0), DuckDB (MIT)",
        ],
    }
    (out_dir / "manifest.json").write_bytes(dumps(manifest))
    log(f"step 8 ok: {len(assets)} density files; initial payload {initial / 1e6:.2f} MB brotli; shards ok: {size_report['shardsOk']}")
    return manifest


# --------------------------------------------------------------------------------------
# Step 9 - independent sampling tests, checksums, schema validation
# --------------------------------------------------------------------------------------

def step9_test(args, work: Path, out_dir: Path) -> dict:
    import jsonschema

    rng = random.Random(42)
    manifest = json.loads((out_dir / "manifest.json").read_text(encoding="utf-8"))
    report = {"checks": [], "failures": []}

    def check(name, ok, detail=None):
        report["checks"].append({"name": name, "ok": bool(ok), "detail": detail})
        if not ok:
            report["failures"].append(name)

    # Checksums.
    for rel, a in manifest["assets"]["cells"].items():
        check(f"sha256 {rel}", sha256((out_dir / rel).read_bytes()) == a["sha256"])

    # Schema validation.
    for name, files in (("manifest", [out_dir / "manifest.json"]), ("species", sorted((out_dir / "species").glob("*.json"))), ("search", sorted((out_dir / "search").glob("*.json")))):
        schema = json.loads((CONTRACTS / f"{name}.schema.json").read_text(encoding="utf-8"))
        bad = []
        for f in files:
            try:
                jsonschema.validate(json.loads(f.read_text(encoding="utf-8")), schema)
            except jsonschema.ValidationError as e:
                bad.append(f"{f.name}: {e.message}")
        check(f"schema {name} ({len(files)} files)", not bad, bad[:3])

    # Filter counts add up.
    f = manifest["filters"]
    check("filter stages sum to rows read", f["kept"] + sum(s["dropped"] for s in f["stages"]) == f["rowsRead"])

    # 200 random cells recomputed independently: Python h3 on the raw kept coordinates vs decoded WSC1.
    groups = load_groups()
    class_to_group = {c: g["id"] for g in groups["groups"] for c in g.get("classes", [])}
    catch = next(g["id"] for g in groups["groups"] if g.get("catch_all"))
    gid_by_index = {g["index"]: g["id"] for g in manifest["lenses"]["animals"]["groups"]}
    decoded = {}
    for rel in manifest["assets"]["cells"]:
        if rel.endswith("r4.bin"):
            d = decode_wsc1((out_dir / rel).read_bytes())
            decoded[gid_by_index[d["group"]]] = d["cells"]
    population = [(g, c) for g, cells in decoded.items() for c in cells]
    picks = rng.sample(population, min(200, len(population)))
    boxes = []
    for g, c in picks:
        bnd = h3.cell_to_boundary(h3.int_to_str(c))
        lats, lons = [p[0] for p in bnd], [p[1] for p in bnd]
        if max(lons) - min(lons) > 180:  # antimeridian cell; bounding box would be wrong
            continue
        boxes.append((g, c, min(lats) - 0.01, max(lats) + 0.01, min(lons) - 0.01, max(lons) + 0.01))
    con = duckdb.connect()
    con.execute("CREATE TABLE boxes(i INTEGER, la0 DOUBLE, la1 DOUBLE, lo0 DOUBLE, lo1 DOUBLE)")
    con.executemany("INSERT INTO boxes VALUES (?,?,?,?,?)", [(i, b[2], b[3], b[4], b[5]) for i, b in enumerate(boxes)])
    staged = (work / "staged" / "*.parquet").as_posix()
    rows = con.execute(f"""
      SELECT b.i, s.lat, s.lon, s.year, s.class FROM read_parquet('{staged}') s
      JOIN boxes b ON s.lat BETWEEN b.la0 AND b.la1 AND s.lon BETWEEN b.lo0 AND b.lo1
      WHERE s.stage = 'kept'""").fetchall()
    recomputed = [[0] * 9 for _ in boxes]
    for i, lat, lon, year, cls in rows:
        g, c = boxes[i][0], boxes[i][1]
        if h3.str_to_int(h3.latlng_to_cell(lat, lon, 4)) != c:
            continue
        if g != "all" and class_to_group.get(cls, catch) != g:
            continue
        b = 0 if year < 1950 else min((year - 1950) // 10 + 1, 8)
        recomputed[i][b] += 1
    mism = [(boxes[i][0], h3.int_to_str(boxes[i][1]), recomputed[i], decoded[boxes[i][0]][boxes[i][1]]) for i in range(len(boxes)) if recomputed[i] != decoded[boxes[i][0]][boxes[i][1]]]
    check(f"{len(boxes)} random r4 cells recomputed independently", not mism, mism[:3])

    # r2 files equal the sum of their r4 children.
    for gid in decoded:
        r2 = decode_wsc1((out_dir / f"cells/animals/{gid}/r2.bin").read_bytes())["cells"]
        agg: dict[int, list] = {}
        for c, v in decoded[gid].items():
            p = h3.str_to_int(h3.cell_to_parent(h3.int_to_str(c), 2))
            agg.setdefault(p, [0] * 9)
            agg[p] = [a + b for a, b in zip(agg[p], v)]
        check(f"r2 = sum of r4 children ({gid})", agg == r2)

    # Species files: per-bin totals match their cells.
    sp_files = sorted((out_dir / "species").glob("*.json"))
    bad = []
    for fpath in rng.sample(sp_files, min(50, len(sp_files))):
        d = json.loads(fpath.read_text(encoding="utf-8"))
        s = [sum(c[1][b] for c in d["cells"]["cells"]) for b in range(9)]
        if s != d["records"]["byBin"] or sum(s) != d["records"]["total"]:
            bad.append(fpath.name)
    check("species per-bin totals match cells (50 sampled)", not bad, bad[:3])

    report["ok"] = not report["failures"]
    (work / "test_report.json").write_bytes(dumps(report))
    (out_dir.parent / f"{out_dir.name}.test_report.json").write_bytes(dumps(report))
    for c in report["checks"]:
        if not c["ok"]:
            log(f"FAIL {c['name']}: {c['detail']}")
    log(f"step 9: {len(report['checks']) - len(report['failures'])}/{len(report['checks'])} checks passed")
    if not report["ok"]:
        raise BuildError("step 9 tests failed")
    return report


# --------------------------------------------------------------------------------------
# Step 10 - publish
# --------------------------------------------------------------------------------------

def step10_publish(args, out_dir: Path, dataset_id: str) -> None:
    import boto3
    import brotli

    report = json.loads((out_dir.parent / f"{out_dir.name}.test_report.json").read_text())
    if not report.get("ok"):
        raise BuildError("refusing to publish: step 9 report is not ok")
    s3 = boto3.client("s3")
    prefix = f"data/v1/{dataset_id}/"
    files = sorted(p for p in out_dir.rglob("*") if p.is_file())
    immutable = "public, max-age=31536000, immutable"

    def put(p: Path):
        rel = p.relative_to(out_dir).as_posix()
        raw = p.read_bytes()
        if p.suffix == ".bin":
            body, enc, ctype = brotli.compress(raw, quality=11), "br", "application/octet-stream"
        else:
            body, enc, ctype = gzip_bytes(raw), "gzip", "application/json"
        s3.put_object(Bucket=args.bucket, Key=prefix + rel, Body=body, ContentType=ctype, ContentEncoding=enc, CacheControl=immutable)

    log(f"step 10: uploading {len(files):,} files to s3://{args.bucket}/{prefix}")
    with cf.ThreadPoolExecutor(max_workers=16) as ex:
        list(ex.map(put, files))
    latest = dumps({"datasetId": dataset_id, "path": f"/{prefix}"})
    s3.put_object(Bucket=args.bucket, Key="data/v1/latest.json", Body=latest, ContentType="application/json", CacheControl="public, max-age=300")
    if args.distribution:
        boto3.client("cloudfront").create_invalidation(
            DistributionId=args.distribution,
            InvalidationBatch={"Paths": {"Quantity": 1, "Items": ["/data/v1/latest.json"]}, "CallerReference": str(time.time())},
        )
    log("step 10 ok")


# --------------------------------------------------------------------------------------

def dataset_id_for(args, snapshot: str) -> str:
    if args.country:
        return f"{snapshot}-{args.country.lower()}"
    if (args.sample_every and args.sample_every > 1) or args.max_files:
        return f"{snapshot}-sample{args.sample_every or 1}"
    return snapshot


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("step", choices=["verify", "filter", "aggregate", "species", "encode", "test", "all", "publish"])
    ap.add_argument("--snapshot", default="latest", help="snapshot folder, e.g. 2026-10-01, or 'latest'")
    ap.add_argument("--country", help="ISO alpha-2 country filter (fast only when run in us-east-1)")
    ap.add_argument("--sample-every", type=int, default=0, help="read every Nth Parquet part (dev slice)")
    ap.add_argument("--sample-offset", type=int, default=0)
    ap.add_argument("--max-files", type=int, default=0)
    ap.add_argument("--threads", type=int, default=0)
    ap.add_argument("--parallel", type=int, default=4, help="parts read concurrently in step 1")
    ap.add_argument("--names", choices=["api", "coldp", "none"], default="api",
                    help="api: ChecklistBank per species (slices); coldp: bulk COL download (full runs)")
    ap.add_argument("--min-species-records", type=int, default=C.MIN_SPECIES_RECORDS)
    ap.add_argument("--retrieved", help="retrieval date recorded in the manifest (default: today)")
    ap.add_argument("--dataset-id", help="publish: dataset id to upload (default: from last build)")
    ap.add_argument("--bucket", help="publish: data bucket name")
    ap.add_argument("--distribution", help="publish: CloudFront distribution id")
    args = ap.parse_args(argv)

    # The public GBIF bucket needs no credentials; ignore a broken local AWS profile for steps 0-9.
    if args.step != "publish":
        os.environ.setdefault("AWS_SHARED_CREDENTIALS_FILE", os.devnull)
        os.environ.setdefault("AWS_CONFIG_FILE", os.devnull)

    out_root = PIPE / "out"
    try:
        if args.step == "publish":
            ds = args.dataset_id or json.loads((out_root / "last_build.json").read_text())["datasetId"]
            if not args.bucket:
                raise BuildError("--bucket is required for publish")
            step10_publish(args, out_root / ds, ds)
            return 0
        snapshot = args.snapshot
        if snapshot == "latest" or args.step in ("verify", "all"):
            tmp = PIPE / "work" / "_verify"
            tmp.mkdir(parents=True, exist_ok=True)
            schema = step0_verify(args, tmp)
            snapshot = schema["snapshot"]
        ds = dataset_id_for(args, snapshot)
        work = PIPE / "work" / ds
        out_dir = out_root / ds
        work.mkdir(parents=True, exist_ok=True)
        out_dir.mkdir(parents=True, exist_ok=True)
        if (PIPE / "work" / "_verify" / "schema.json").exists() and args.step in ("verify", "all"):
            for f in ("schema.json", "parts.json"):
                (work / f).write_bytes((PIPE / "work" / "_verify" / f).read_bytes())
        schema = json.loads((work / "schema.json").read_text())
        steps = {
            "filter": lambda: step1_filter(args, work, schema),
            "aggregate": lambda: step23_aggregate(args, work),
            "species": lambda: step4_species(args, work, out_dir),
            "encode": lambda: step8_encode(args, work, out_dir, ds),
            "test": lambda: step9_test(args, work, out_dir),
        }
        order = list(steps) if args.step == "all" else ([] if args.step == "verify" else [args.step])
        for s in order:
            steps[s]()
        (out_root / "last_build.json").write_bytes(dumps({"datasetId": ds}))
        (out_root / "latest.json").write_bytes(dumps({"datasetId": ds, "path": f"/data/v1/{ds}/"}))
        return 0
    except BuildError as e:
        log(f"BUILD FAILED: {e}")
        return 2


if __name__ == "__main__":
    sys.exit(main())
