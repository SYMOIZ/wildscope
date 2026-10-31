# WildScope — AWS Architecture

Region strategy: **us-east-1** for build compute, data and application (co-located with the GBIF bucket; lowest data-transfer risk). CloudFront is global. Bedrock model availability differs per region — verify the chosen model is available in the chosen region (UD-11).

## 1. Overview

```
                        ┌─────────────────────────── Browser (React + TS + CesiumJS) ───────────────────────────┐
                        │  loads app + /data/* (static)      calls /api/*        loads map tiles/style (API key) │
                        └───────────────┬─────────────────────────┬──────────────────────────┬───────────────────┘
                                        │                         │                          │
                               ┌────────▼────────┐        ┌───────▼────────┐        ┌────────▼─────────────┐
                               │   CloudFront    │        │  CloudFront    │        │ Amazon Location      │
                               │ default behavior│        │  /api/* path   │        │ Service (maps API)   │
                               │ (S3, OAC)       │        │  behavior      │        └──────────────────────┘
                               └────────┬────────┘        └───────┬────────┘
                                        │                         │
                          ┌─────────────▼──────────┐      ┌───────▼────────┐
                          │ S3 app bucket (private)│      │ API Gateway    │
                          │ S3 data bucket (private)│     │ (HTTP API)     │
                          └─────────────▲──────────┘      └───────┬────────┘
                                        │                         │
                                        │                ┌────────▼────────────────────────────┐
                                        │                │ Lambda (Python): species/media,      │
                                        │                │ timeline, region, compare, geo, ask  │
                                        │                └───┬────────────┬─────────────┬───────┘
                                        │                    │            │             │
                                        │          ┌─────────▼──┐  ┌──────▼─────┐  ┌────▼────────────┐
                                        │          │ Athena +   │  │ Bedrock    │  │ Amazon Location │
                                        │          │ Glue catalog│ │ (runtime)  │  │ Places (IAM)    │
                                        │          └─────────┬──┘  └────────────┘  └─────────────────┘
                                        │                    │
                        ┌───────────────┴────────────────────▼───────────────┐
                        │  S3 build bucket: kept.parquet, aggregates (Parquet)│
                        └───────────────▲────────────────────────────────────┘
                                        │ build job (EC2 or Fargate): Python + DuckDB + H3
                        ┌───────────────┴────────────────────┐
                        │ Registry of Open Data: GBIF Parquet │ (public S3, us-east-1)
                        └─────────────────────────────────────┘
```

## 2. Service responsibilities

| Service | Role | Configuration notes |
|---|---|---|
| **S3 app bucket** | Built React app, fonts | Private; CloudFront OAC; versioned; SPA fallback via CloudFront function (rewrite unknown paths without extension to `/index.html`) |
| **S3 data bucket** | `/data/v1/<snapshot>/…` static assets (A-01…A-06) | Private; OAC; `Cache-Control` set at upload; lifecycle: keep last two snapshots |
| **S3 build bucket** | Intermediate Parquet, aggregates, logs | Private; lifecycle expire intermediates after 30 days; not served publicly |
| **CloudFront** | One distribution, behaviours: default (app), `/data/*` (data bucket, long cache), `/api/*` (API Gateway origin, short cache, forwards query string, no cookies) | Brotli/gzip; HTTP/2+3; response headers policy (CSP, HSTS, X-Content-Type-Options, Referrer-Policy, Permissions-Policy); custom domain + ACM cert (optional) |
| **API Gateway (HTTP API)** | Routes E-01…E-08 to Lambdas | Throttling (burst 50, rate 25 rps initially); access logs to CloudWatch; request validation via Lambda (schemas) |
| **Lambda** | Python 3.12, arm64, one function per route group (`species`, `region`, `compare`, `geo`, `ask`) | Memory 512–1,024 MB; timeouts: 10 s (geo/species), 25 s (ask/compare — API Gateway HTTP API limit is 30 s); reserved concurrency for `ask` (e.g. 5) to bound Bedrock/Athena spend |
| **Athena + Glue Data Catalog** | Ad-hoc aggregation over the aggregate Parquet tables (region/compare fallbacks); also usable in the build | Dedicated workgroup `wildscope`, per-query data-scanned cutoff 1 GB, result location in the build bucket, 30-day result expiry, engine v3 |
| **Amazon Bedrock** | Intent parsing for E-08 | Model id from SSM Parameter Store; IAM `bedrock:InvokeModel` on that single model ARN; optionally Bedrock Guardrails |
| **Amazon Location Service** | (a) Map/basemap through an API key restricted to the CloudFront domain referrer and to the map actions only; (b) Places search and reverse geocoding from Lambda using IAM (no key in browser) | Maps v2/Places v2 availability and style-in-Cesium compatibility are UD-02; confirm current API names and pricing in the console before build |
| **CloudFormation** | Entire stack as code (§6) | Nested stacks: `storage`, `distribution`, `api`, `data-catalog`, `observability`, `build-job` |
| **IAM** | Least-privilege roles per Lambda; build job role; deploy role | No wildcard resource on Bedrock/Athena; S3 read-only for runtime Lambdas |
| **CloudWatch** | Logs, metrics, alarms, dashboard | Log retention 14 days (7 days for `ask`, body redacted) |
| **AWS Budgets** | Monthly budget with alerts at 50/80/100% | NFR-10 |
| **SSM Parameter Store** | Config: snapshot id, model id, rate limits | |
| **AWS WAF** (optional, P1) | Rate-based rule for `/api/*`; managed common rule set | Adds cost; decide by traffic (UD-12) |
| **EC2 or ECS Fargate** (build only) | Runs the data pipeline | Started manually or by a one-off CodeBuild/GitHub Action; shut down after; instance sizing measured (UD-07) |

Services deliberately not used: DynamoDB, Cognito, Amplify, ElastiCache, OpenSearch — they add cost/complexity without MVP need. If rate-limit state or caching becomes necessary, S3 + CloudFront caching is first; DynamoDB second.

## 3. Request paths

1. **App load**: browser → CloudFront → S3 app bucket (HTML/JS/CSS/fonts) → fetch A-01 manifest → fetch A-02 L0/L1 files for the lens.
2. **Globe interaction**: only static `/data/*` requests (cacheable); no Lambda in the hot path.
3. **Species select**: A-03 (static) → E-03 (timeline) and E-02 (media) in parallel; failures degrade blocks, not the globe.
4. **Search**: species via A-04 (static); places via E-06 → Lambda → Amazon Location.
5. **Ask**: E-08 → Lambda → Bedrock → validate → (static read or Athena) → template → response.

## 4. Security design

- All S3 buckets block public access; access only via CloudFront OAC (app/data) and IAM roles.
- CloudFront response headers: `Content-Security-Policy` allowing self, the Amazon Location tile/style origin, `data:` for images, `blob:` workers; `frame-ancestors 'none'`.
- Amazon Location API key: restricted to map-render actions and to the site referrer; rotation procedure documented; the key is injected at build time into a config JSON served from the app bucket (not committed to Git).
- Lambda input validation by JSON Schema; reject unknown parameters; max body 2 KB.
- Bedrock: no user text stored; system prompt versioned in code; output validated; model has no tools; no data in context other than the question and view context.
- Athena: queries only from fixed templates with parameter binding by whitelisting (cell ids matched `^[0-9a-f]{15}$`, bins from enum).
- Logging: no IP stored beyond CloudFront standard logs (enabled with 14-day retention; decide in UD-12 whether to enable at all).
- Dependency hygiene: lockfiles, `npm audit`/`pip-audit` in CI, SBOM generation.
- Abuse: API Gateway throttling + reserved concurrency + WAF (optional). Budget alarm triggers a documented manual kill-switch (disable `ask` route via parameter).

## 5. Environments

| Env | Purpose | Notes |
|---|---|---|
| `dev` | Developer sandbox, small snapshot subset (e.g. one country, ~1 M records) | Fast pipeline for tests |
| `prod` | Public | Separate AWS account recommended; same templates with parameters |

Deploy via CI (GitHub Actions + OIDC to AWS role). Data publish is a separate manual job gated by pipeline step 9 results.

## 6. CloudFormation layout

```
infra/
  main.yaml                     # parameters: Env, DomainName?, SnapshotId, BedrockModelId
  storage.yaml                  # 3 buckets, bucket policies, lifecycle
  distribution.yaml             # CloudFront, OAC, response headers policy, behaviours
  api.yaml                      # HTTP API, routes, Lambdas, roles, throttling, log groups
  data-catalog.yaml             # Glue database/tables, Athena workgroup
  location.yaml                 # Location API key (if supported by CFN resource), place index/config as supported
  observability.yaml            # alarms, dashboard, budget
  build-job.yaml                # EC2 launch template or Fargate task + role (optional)
```

Resource availability in CloudFormation for newer Location features (v2 APIs, API keys) must be verified; fall back to a custom resource or console step documented in the README (UD-02).

## 7. Observability

- Metrics: per-route latency p50/p95, error rate, throttles, Lambda duration/concurrency, Athena bytes scanned, Bedrock invocations and tokens, CloudFront 4xx/5xx.
- Alarms: 5xx rate > 2% for 5 min; Athena scanned bytes/day > threshold; Bedrock invocations/day > threshold; budget 80%.
- Synthetic check: every 15 min fetch `/data/v1/latest.json` and `/api/v1/health`.
- Client telemetry: none in MVP beyond CloudFront logs (privacy decision, UD-12).

## 8. Cost considerations (estimates; verify with the AWS Pricing Calculator)

Unit prices below are well-known list prices at time of writing and **must be re-checked**; amounts depend on measured sizes.

| Driver | Unit | What drives it here | Expected scale / comment |
|---|---|---|---|
| Build compute | EC2/Fargate hours | Reading remote Parquet (column-pruned) + H3 + aggregation | One-off per snapshot; runtime measured in step 1; keep the instance in us-east-1; expect hours, not days — measure |
| Athena scanned data | list price per TB scanned (about $5/TB), 10 MB minimum per query | Only if Athena is used in the build (CTAS over GBIF) or for `ask`/compare on aggregate tables | Build: column-pruned scans of the GBIF snapshot — estimate = (bytes of selected columns) × price; the scan size must be measured with `EXPLAIN`/a dry run before running. Runtime: aggregate tables are small; per-query cost is typically a fraction of a cent; 1 GB workgroup cap |
| S3 storage | per GB-month | Data bucket (density files, species files, region shards), build bucket | Size computed from manifest; set budget at first build |
| S3 requests & CloudFront egress | per request / per GB | Many small species/region files | The 5 MB-class initial load × sessions drives egress; CloudFront monthly free allowances may apply — verify |
| Lambda | requests × GB-s | Light; `ask` heaviest (waits on Bedrock) | Reserved concurrency caps worst case |
| API Gateway HTTP API | per million requests | E-02/03/04/06/08 only | Low |
| Bedrock | per input/output token (model-specific) | One short call per Ask: ~few hundred tokens in, ~100 out | Rate limit 6/min/IP; global cap by reserved concurrency; confirm model pricing |
| Amazon Location | per request (map tiles, places) | Map tiles per session (basemap panning/zoom) and geocoding calls | Tile usage per session can be high with a 3D globe; measure; consider the cached/offline basemap fallback if costs exceed budget (UD-02) |
| CloudWatch | logs ingested/stored | Minimal | 14-day retention |
| WAF (optional) | per web ACL + per rule + per million requests | Fixed monthly cost | Only if abuse appears |

Sizing heuristics for first budget: assume 10,000 sessions/month × 8 MB average transferred = 80 GB egress; 3 `ask` calls per 10 sessions; 5 place searches per session. Replace with measured values after the first deployment. A budget ceiling (NFR-10) is set **before** public launch.

Cost-control switches (all runtime parameters): disable Ask, disable media lookups, cap Athena workgroup bytes, lower CloudFront TTL exceptions, switch basemap to static imagery.

## 9. Disaster recovery and rollback

- Static assets versioned by snapshot folder: rollback = update `/data/v1/latest.json` to the previous snapshot.
- App rollback: S3 versioning + CloudFront invalidation for `index.html`.
- Infra: CloudFormation change sets; stack policy protects buckets from deletion.
- No stateful user data to restore.

## 10. Known AWS-level risks

1. Amazon Location basemap may not plug into CesiumJS directly (tile type/projection/style format). Mitigation order: raster tile endpoint as `UrlTemplateImageryProvider` if available → render the basemap with MapLibre as imagery to texture (not recommended) → neutral open imagery for Earth plus Amazon Location used for geocoding, reverse-geocoding and a visible place search (still satisfies "AWS location service", but the contest wording on map usage must be checked against the rules).
2. Bedrock quotas on new accounts can be low.
3. Athena cold latency (2–8 s) is unsuitable for interactive hot paths — keep it off them.
4. Cesium 3D rendering of many polygons may exceed budget on integrated GPUs (UD-03).
