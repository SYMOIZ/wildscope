#!/usr/bin/env bash
# Publish the same WildScope app on Vercel. Vercel serves only the static app; /data/* and /api/* are
# proxied to the CloudFront distribution, so there is one copy of the data and one API.
# Requires: a completed AWS deploy (scripts/deploy.sh) and `vercel login`.
# Keep the Vercel project disconnected from Git (`vercel git disconnect`): a Git-triggered build deploys
# the repository root, which has no built index.html, and replaces production with a 404.
# Usage: CLOUDFRONT_URL=https://d2za8aq0bl0uib.cloudfront.net bash scripts/deploy-vercel.sh
set -euo pipefail

CLOUDFRONT_URL="${CLOUDFRONT_URL:-https://d2za8aq0bl0uib.cloudfront.net}"
PY="${PY:-python}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
OUT=.build/wildscope   # the folder name becomes the Vercel project name

npm --prefix web run build
# config.json carries the Amazon Location key; it is not in git. Reuse the one the AWS site serves.
curl -fsS "$CLOUDFRONT_URL/config.json" -o web/dist/config.json

rm -rf "$OUT" && mkdir -p "$OUT" && cp -r web/dist/. "$OUT/"
$PY - "$CLOUDFRONT_URL" > "$OUT/vercel.json" <<'PYEOF'
import json, re, sys
cf = sys.argv[1]
ts = open("web/src/csp.ts", encoding="utf-8").read()
csp = "".join(re.findall(r'"([^"]*)"', ts.split("=", 1)[1]))  # same CSP as CloudFront
print(json.dumps({
    "$schema": "https://openapi.vercel.sh/vercel.json",
    "cleanUrls": False,
    "rewrites": [
        {"source": "/data/:path*", "destination": f"{cf}/data/:path*"},
        {"source": "/api/:path*", "destination": f"{cf}/api/:path*"},
    ],
    "headers": [
        {"source": "/(.*)", "headers": [
            {"key": "Content-Security-Policy", "value": csp},
            {"key": "Strict-Transport-Security", "value": "max-age=31536000; includeSubDomains"},
            {"key": "X-Content-Type-Options", "value": "nosniff"},
            {"key": "X-Frame-Options", "value": "DENY"},
            {"key": "Referrer-Policy", "value": "strict-origin-when-cross-origin"},
            {"key": "Permissions-Policy", "value": "camera=(), microphone=(), geolocation=(), payment=()"},
        ]},
        {"source": "/assets/(.*)", "headers": [{"key": "Cache-Control", "value": "public, max-age=31536000, immutable"}]},
        {"source": "/(index.html|config.json)", "headers": [{"key": "Cache-Control", "value": "no-cache"}]},
    ],
}, indent=2))
PYEOF

(cd "$OUT" && npx --yes vercel@latest deploy --prod --yes)
echo "Remember: the Vercel domain must be in MapsApiKey AllowReferers (infra/wildscope.yaml) for the satellite basemap."
