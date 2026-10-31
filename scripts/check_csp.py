"""Fail if the CSP served by CloudFront (infra/wildscope.yaml) differs from web/src/csp.ts."""
import re
import sys
from pathlib import Path

root = Path(__file__).resolve().parents[1]
ts = (root / "web/src/csp.ts").read_text(encoding="utf-8")
web = "".join(re.findall(r'"([^"]*)"', ts.split("=", 1)[1]))
yaml_csp = re.search(r'ContentSecurityPolicy: "([^"]+)"', (root / "infra/wildscope.yaml").read_text(encoding="utf-8")).group(1)
if web != yaml_csp:
    print("CSP mismatch\n web:  " + web + "\n yaml: " + yaml_csp)
    sys.exit(1)
print("csp: ok")
