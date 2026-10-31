"""Build constants. Every value here that reaches the UI is copied into the manifest (A-01)."""

GBIF_BUCKET = "gbif-open-data-us-east-1"
GBIF_PREFIX = "occurrence/"
GBIF_REGION = "us-east-1"
GBIF_REGISTRY_URL = "https://registry.opendata.aws/gbif/"

SCHEMA_VERSION = 1

# H3 resolutions in the contest cut (L0, L1). Res 6 (L2) is deferred.
RESOLUTIONS = (2, 4)

MIN_EFFORT = 30
MIN_SPECIES_RECORDS = 100
MAX_UNCERTAINTY_M_R2_R4 = 10_000
MIN_YEAR = 1700

# Columns the pipeline needs, with the DuckDB type verified in step 0.
REQUIRED_COLUMNS = {
    "kingdom": "VARCHAR",
    "phylum": "VARCHAR",
    "class": "VARCHAR",
    "order": "VARCHAR",
    "family": "VARCHAR",
    "genus": "VARCHAR",
    "species": "VARCHAR",
    "specieskey": "VARCHAR",
    "countrycode": "VARCHAR",
    "occurrencestatus": "VARCHAR",
    "decimallatitude": "DOUBLE",
    "decimallongitude": "DOUBLE",
    "coordinateuncertaintyinmeters": "DOUBLE",
    "year": "INTEGER",
    "basisofrecord": "VARCHAR",
    "license": "VARCHAR",
    "issue": "VARCHAR[]",
}

# Columns the original spec expected that the AWS snapshot does not carry (UD-01 finding).
SPEC_COLUMNS_ABSENT_OK = ["hascoordinate", "hasgeospatialissues", "datageneralizations", "iucnredlistcategory"]

# GBIF defines hasGeospatialIssues as any of these interpretation issues
# (GBIF occurrence search API documentation, parameter `hasGeospatialIssue`).
GEOSPATIAL_ISSUES = ["ZERO_COORDINATE", "COORDINATE_INVALID", "COORDINATE_OUT_OF_RANGE", "COUNTRY_COORDINATE_MISMATCH"]

BASIS_KEPT = ["HUMAN_OBSERVATION", "OBSERVATION", "PRESERVED_SPECIMEN", "MACHINE_OBSERVATION"]
LICENCES_KEPT = ["CC0_1_0", "CC_BY_4_0"]

BINS = [
    {"id": "B00", "label": "Before 1950", "tick": "<1950", "from": 1700, "to": 1949},
    {"id": "B01", "label": "1950s", "tick": "1950s", "from": 1950, "to": 1959},
    {"id": "B02", "label": "1960s", "tick": "1960s", "from": 1960, "to": 1969},
    {"id": "B03", "label": "1970s", "tick": "1970s", "from": 1970, "to": 1979},
    {"id": "B04", "label": "1980s", "tick": "1980s", "from": 1980, "to": 1989},
    {"id": "B05", "label": "1990s", "tick": "1990s", "from": 1990, "to": 1999},
    {"id": "B06", "label": "2000s", "tick": "2000s", "from": 2000, "to": 2009},
    {"id": "B07", "label": "2010s", "tick": "2010s", "from": 2010, "to": 2019},
    {"id": "B08", "label": "2020– (partial)", "tick": "2020–", "from": 2020, "to": None},
]

FILTERS = [
    ("F1", "Has coordinates: latitude in [-90, 90], longitude in [-180, 180], not (0, 0)"),
    ("F2", "No geospatial issue flag (" + ", ".join(GEOSPATIAL_ISSUES) + ")"),
    ("F3", "occurrencestatus = PRESENT (null status excluded)"),
    ("F4", "basisofrecord in (" + ", ".join(BASIS_KEPT) + ")"),
    ("F5", "license in (CC0_1_0, CC_BY_4_0)"),
    ("F6", "Resolved to a species (specieskey not null)"),
    ("F7", "year not null and between 1700 and the snapshot year"),
    ("F8", "coordinateuncertaintyinmeters null or <= 10,000 m"),
    ("F9", "kingdom = Animalia (Animals lens)"),
]

# ChecklistBank alias for the latest Catalogue of Life eXtended Release; the resolved dataset key
# is recorded in the manifest.
COL_DATASET = "3LXR"
COLDP_URL = "https://download.checklistbank.org/col/latest_coldp.zip"

USER_AGENT = "WildScope-build/1.0 (+https://github.com/; contest build)"
