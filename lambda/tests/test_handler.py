"""Unit tests for the API Lambda with Amazon Location stubbed. Run: python -m unittest discover lambda/tests"""

import json
import os
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "geo"))
os.environ.setdefault("AWS_DEFAULT_REGION", "us-east-1")

import handler  # noqa: E402
from botocore.exceptions import ClientError  # noqa: E402


class FakePlaces:
    def __init__(self, result=None, error=None):
        self.result, self.error, self.calls = result, error, []

    def search_text(self, **kw):
        self.calls.append(kw)
        if self.error:
            raise self.error
        return self.result


def ev(path, **qs):
    return {"rawPath": path, "requestContext": {"http": {"method": "GET"}}, "queryStringParameters": qs or None}


class Ctx:
    aws_request_id = "req-1"


ITEM = {
    "PlaceId": "abc",
    "PlaceType": "Locality",
    "Title": "Lahore, Punjab, Pakistan",
    "Position": [74.35, 31.55],
    "MapView": [74.1, 31.3, 74.6, 31.7],
    "Address": {"Country": {"Code2": "PK"}},
}


class GeoSearchTests(unittest.TestCase):
    def test_maps_results_to_contract(self):
        handler._places = FakePlaces({"ResultItems": [ITEM]})
        r = handler.handler(ev("/api/v1/geo/search", q="Lahore", biasLat="30", biasLon="70"), Ctx())
        self.assertEqual(r["statusCode"], 200)
        self.assertEqual(r["headers"]["Cache-Control"], "no-store")
        body = json.loads(r["body"])
        self.assertEqual(body["results"][0], {
            "id": "abc", "label": "Lahore, Punjab, Pakistan", "type": "locality", "lat": 31.55, "lon": 74.35,
            "bounds": {"west": 74.1, "south": 31.3, "east": 74.6, "north": 31.7}, "countryCode": "PK"})
        self.assertIn("attribution", body)
        self.assertEqual(handler._places.calls[0]["BiasPosition"], [70.0, 30.0])

    def test_rejects_short_query_and_unknown_params(self):
        handler._places = FakePlaces({"ResultItems": []})
        self.assertEqual(handler.handler(ev("/api/v1/geo/search", q="L"), Ctx())["statusCode"], 400)
        self.assertEqual(handler.handler(ev("/api/v1/geo/search", q="Lahore", x="1"), Ctx())["statusCode"], 400)
        self.assertEqual(handler.handler(ev("/api/v1/geo/search", q="Lahore", limit="9"), Ctx())["statusCode"], 400)
        self.assertEqual(handler.handler(ev("/api/v1/geo/search", q="Lahore", biasLat="91"), Ctx())["statusCode"], 400)
        self.assertEqual(handler._places.calls, [])

    def test_dependency_failure_is_503_and_throttle_is_429(self):
        err = ClientError({"Error": {"Code": "InternalServerException"}}, "SearchText")
        handler._places = FakePlaces(error=err)
        self.assertEqual(handler.handler(ev("/api/v1/geo/search", q="Lahore"), Ctx())["statusCode"], 503)
        handler._places = FakePlaces(error=ClientError({"Error": {"Code": "ThrottlingException"}}, "SearchText"))
        r = handler.handler(ev("/api/v1/geo/search", q="Lahore"), Ctx())
        self.assertEqual(r["statusCode"], 429)
        self.assertEqual(r["headers"]["Retry-After"], "5")

    def test_health_and_404(self):
        self.assertEqual(json.loads(handler.handler(ev("/api/v1/health"), Ctx())["body"])["status"], "ok")
        self.assertEqual(handler.handler(ev("/api/v1/nope"), Ctx())["statusCode"], 404)


if __name__ == "__main__":
    unittest.main()
