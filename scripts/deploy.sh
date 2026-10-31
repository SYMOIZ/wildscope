#!/usr/bin/env bash
# Deploy WildScope: CloudFormation stack, web app, config.json (with the Amazon Location key), data.
# Usage: BUDGET_EMAIL=you@example.com scripts/deploy.sh      (or: make deploy BUDGET_EMAIL=...)
set -euo pipefail

STACK="${STACK:-wildscope-prod}"
ENV_NAME="${ENV_NAME:-prod}"
REGION="${AWS_REGION:-us-east-1}"
BUDGET_USD="${BUDGET_USD:-20}"
PY="${PY:-python}"
SKIP_DATA="${SKIP_DATA:-0}"
: "${BUDGET_EMAIL:?set BUDGET_EMAIL to the address for budget alerts}"
export AWS_REGION="$REGION" AWS_DEFAULT_REGION="$REGION"
export MSYS_NO_PATHCONV=1  # Git Bash on Windows would rewrite "/index.html" into a local path

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
mkdir -p .build

[ -f pipeline/out/last_build.json ] || { echo "No data build found. Run: make data-sample (or make data-full)"; exit 1; }
DATASET_ID="$($PY -c "import json;print(json.load(open('pipeline/out/last_build.json'))['datasetId'])")"

ACCOUNT="$(aws sts get-caller-identity --query Account --output text)"
ARTIFACTS="wildscope-artifacts-${ACCOUNT}-${REGION}"
echo "==> account ${ACCOUNT}, region ${REGION}, stack ${STACK}, dataset ${DATASET_ID}"

if ! aws s3api head-bucket --bucket "$ARTIFACTS" 2>/dev/null; then
  echo "==> creating artifacts bucket ${ARTIFACTS}"
  aws s3api create-bucket --bucket "$ARTIFACTS" >/dev/null
  aws s3api put-public-access-block --bucket "$ARTIFACTS" \
    --public-access-block-configuration BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true
fi

echo "==> packaging and deploying CloudFormation"
aws cloudformation package --template-file infra/wildscope.yaml --s3-bucket "$ARTIFACTS" --s3-prefix lambda \
  --output-template-file .build/packaged.yaml >/dev/null
aws cloudformation deploy --stack-name "$STACK" --template-file .build/packaged.yaml \
  --capabilities CAPABILITY_IAM CAPABILITY_AUTO_EXPAND --no-fail-on-empty-changeset \
  --parameter-overrides Env="$ENV_NAME" DatasetId="$DATASET_ID" BudgetEmail="$BUDGET_EMAIL" MonthlyBudgetUsd="$BUDGET_USD"

out() { aws cloudformation describe-stacks --stack-name "$STACK" --query "Stacks[0].Outputs[?OutputKey=='$1'].OutputValue" --output text; }
APP_BUCKET="$(out AppBucketName)"; DATA_BUCKET="$(out DataBucketName)"; DIST="$(out DistributionId)"
SITE="$(out SiteUrl)"; KEY_NAME="$(out MapsApiKeyName)"
echo "$DATA_BUCKET" > .build/data_bucket; echo "$DIST" > .build/distribution_id

echo "==> building web app"
(cd web && npm ci --no-audit --no-fund && npm run build)

# The Maps key value is not a CloudFormation output; read it and write config.json (not committed to git).
KEY_VALUE="$(aws location describe-key --key-name "$KEY_NAME" --query Key --output text)"
$PY - "$KEY_VALUE" "$REGION" > web/dist/config.json <<'PYEOF'
import json, sys
print(json.dumps({"apiBase": "/api/v1", "locationApiKey": sys.argv[1], "locationRegion": sys.argv[2],
                  "placesAttribution": "Place search: Amazon Location Service. Data provider terms apply."}))
PYEOF

echo "==> uploading web app to s3://${APP_BUCKET}"
aws s3 sync web/dist "s3://${APP_BUCKET}/" --delete --exclude index.html --exclude config.json \
  --cache-control "public, max-age=31536000, immutable"
aws s3 cp web/dist/index.html "s3://${APP_BUCKET}/index.html" --cache-control "no-cache" --content-type "text/html; charset=utf-8"
aws s3 cp web/dist/config.json "s3://${APP_BUCKET}/config.json" --cache-control "no-cache" --content-type "application/json"

if [ "$SKIP_DATA" != "1" ]; then
  echo "==> publishing data ${DATASET_ID} to s3://${DATA_BUCKET}"
  $PY -m pipeline.wildscope.build publish --bucket "$DATA_BUCKET" --distribution "$DIST" --dataset-id "$DATASET_ID"
fi

aws cloudfront create-invalidation --distribution-id "$DIST" --paths /index.html /config.json /data/v1/latest.json >/dev/null
echo "==> done: ${SITE}"
echo "    health: ${SITE}/api/v1/health"
