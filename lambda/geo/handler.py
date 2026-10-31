"""WildScope API Lambda: E-01 GET /api/v1/health and E-06 GET /api/v1/geo/search.

E-06 proxies Amazon Location Service Places (v2, SearchText) using the function's IAM role, so no
key reaches the browser. Results are not stored and are returned with Cache-Control: no-store
(UD-10 default) together with the attribution string that must be displayed with them.
"""

from __future__ import annotations

import json
import logging
import os
import re
import uuid

import boto3
from botocore.config import Config
from botocore.exceptions import BotoCoreError, ClientError

log = logging.getLogger()
log.setLevel(logging.INFO)

DATASET_ID = os.environ.get("DATASET_ID", "unknown")
ATTRIBUTION = os.environ.get("PLACES_ATTRIBUTION", "Place search: Amazon Location Service. Data provider terms apply.")
REGION = os.environ.get("AWS_REGION", "us-east-1")
ERR_BASE = "https://wildscope.example/errors/"

_places = None


def places():
    global _places
    if _places is None:
        _places = boto3.client("geo-places", region_name=REGION, config=Config(connect_timeout=2, read_timeout=4, retries={"max_attempts": 2}))
    return _places


TYPE_MAP = {
    "Country": "country",
    "Region": "region",
    "SubRegion": "region",
    "Locality": "locality",
    "District": "locality",
    "SubDistrict": "locality",
    "PostalCode": "locality",
    "Block": "locality",
    "SubBlock": "locality",
    "Intersection": "locality",
    "Street": "locality",
    "PointAddress": "locality",
    "InterpolatedAddress": "locality",
    "PointOfInterest": "poi",
}

ALLOWED_SEARCH_PARAMS = {"q", "biasLat", "biasLon", "limit"}


def response(status: int, body: dict, request_id: str, cache: str = "no-store", extra: dict | None = None) -> dict:
    body = {**body, "snapshot": DATASET_ID, "requestId": request_id}
    headers = {"Content-Type": "application/json", "Cache-Control": cache, "X-Content-Type-Options": "nosniff"}
    if extra:
        headers.update(extra)
    return {"statusCode": status, "headers": headers, "body": json.dumps(body, ensure_ascii=False)}


def problem(status: int, kind: str, title: str, detail: str, request_id: str) -> dict:
    ctype = {"Content-Type": "application/problem+json"}
    return response(status, {"type": ERR_BASE + kind, "title": title, "status": status, "detail": detail, "retryAfterSeconds": None}, request_id, extra=ctype)


def parse_float(v: str | None, lo: float, hi: float) -> float | None:
    if v is None:
        return None
    if not re.fullmatch(r"-?\d{1,3}(\.\d{1,8})?", v):
        raise ValueError
    f = float(v)
    if not lo <= f <= hi:
        raise ValueError
    return f


def to_result(item: dict) -> dict | None:
    pos = item.get("Position")
    if not pos or len(pos) != 2:
        return None
    mv = item.get("MapView")
    country = ((item.get("Address") or {}).get("Country") or {}).get("Code2")
    return {
        "id": item.get("PlaceId"),
        "label": item.get("Title") or (item.get("Address") or {}).get("Label") or "",
        "type": TYPE_MAP.get(item.get("PlaceType", ""), "locality"),
        "lat": pos[1],
        "lon": pos[0],
        "bounds": {"west": mv[0], "south": mv[1], "east": mv[2], "north": mv[3]} if mv and len(mv) == 4 else None,
        "countryCode": country,
    }


def geo_search(qs: dict, request_id: str) -> dict:
    unknown = set(qs) - ALLOWED_SEARCH_PARAMS
    if unknown:
        return problem(400, "invalid-parameter", "Invalid parameter", f"unknown parameter(s): {', '.join(sorted(unknown))}", request_id)
    q = (qs.get("q") or "").strip()
    if not 2 <= len(q) <= 100:
        return problem(400, "invalid-parameter", "Invalid parameter", "q must be 2-100 characters", request_id)
    try:
        limit = int(qs.get("limit") or 5)
        if not 1 <= limit <= 5:
            raise ValueError
        lat = parse_float(qs.get("biasLat"), -90, 90)
        lon = parse_float(qs.get("biasLon"), -180, 180)
    except ValueError:
        return problem(400, "invalid-parameter", "Invalid parameter", "limit must be 1-5; biasLat/biasLon must be valid coordinates", request_id)
    # SearchText needs a bias position or a filter; without a camera position bias to (0, 0).
    bias = [lon if lon is not None else 0.0, lat if lat is not None else 0.0]
    try:
        r = places().search_text(QueryText=q, MaxResults=limit, BiasPosition=bias, Language="en")
    except (ClientError, BotoCoreError) as e:
        code = getattr(e, "response", {}).get("Error", {}).get("Code", type(e).__name__)
        log.warning(json.dumps({"requestId": request_id, "dependency": "geo-places", "error": code}))
        if code == "ThrottlingException":
            out = problem(429, "rate-limited", "Busy", "Place search is busy. Try again shortly.", request_id)
            out["headers"]["Retry-After"] = "5"
            return out
        return problem(503, "dependency-unavailable", "Place search unavailable", "Amazon Location Service did not respond", request_id)
    results = [x for x in (to_result(i) for i in r.get("ResultItems", [])) if x]
    return response(200, {"results": results, "attribution": ATTRIBUTION}, request_id)


def health(request_id: str) -> dict:
    # The contest cut has no Athena or Bedrock; only the Location dependency is reported.
    return response(200, {"status": "ok", "dependencies": {"location": "ok"}}, request_id, cache="no-store")


def handler(event, context):
    request_id = getattr(context, "aws_request_id", None) or str(uuid.uuid4())
    method = (event.get("requestContext", {}).get("http", {}) or {}).get("method", "GET")
    path = event.get("rawPath", "")
    qs = event.get("queryStringParameters") or {}
    log.info(json.dumps({"requestId": request_id, "method": method, "path": path}))  # query text is not logged
    if method != "GET":
        return problem(405, "method-not-allowed", "Method not allowed", "only GET is supported", request_id)
    if path == "/api/v1/health":
        return health(request_id)
    if path == "/api/v1/geo/search":
        return geo_search(qs, request_id)
    return problem(404, "not-found", "Not found", "unknown route", request_id)
