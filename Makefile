# WildScope. Run from Git Bash, WSL, macOS or Linux (needs make, python 3.12+, node 20+, aws cli v2).
PY ?= $(if $(wildcard .venv/Scripts/python.exe),.venv/Scripts/python,$(if $(wildcard .venv/bin/python),.venv/bin/python,python3))
SNAPSHOT ?= latest
SAMPLE_EVERY ?= 300
STACK ?= wildscope-prod
export STACK

.PHONY: help setup data-sample data-country data-full data-aws publish deploy check test lint dev preview clean-data

help:
	@echo "make setup                 install Python and web dependencies"
	@echo "make data-sample           dev slice: every SAMPLE_EVERY-th GBIF part (default 300) -> pipeline/out"
	@echo "make data-country C=PK     one-country slice (fast only when run in us-east-1)"
	@echo "make data-full             full snapshot on this machine (run in us-east-1; see data-aws)"
	@echo "make data-aws REPO_URL=... full snapshot on a self-terminating EC2 build job"
	@echo "make deploy BUDGET_EMAIL=you@example.com"
	@echo "make check                 pipeline lint, Lambda tests, web typecheck/lint/build, cfn-lint, CSP check"
	@echo "make dev                   local app at http://localhost:5173 using pipeline/out"

setup:
	python -m venv .venv
	$(PY) -m pip install -q -r pipeline/requirements.txt pyflakes cfn-lint
	cd web && npm ci --no-audit --no-fund

data-sample:
	$(PY) -u -m pipeline.wildscope.build all --snapshot $(SNAPSHOT) --sample-every $(SAMPLE_EVERY) --threads 8 --parallel 4

data-country:
	$(PY) -u -m pipeline.wildscope.build all --snapshot $(SNAPSHOT) --country $(C) --threads 16 --parallel 16

data-full:
	$(PY) -u -m pipeline.wildscope.build all --snapshot $(SNAPSHOT) --threads 16 --parallel 32 --names coldp

# Full build on EC2 in us-east-1 (needs the main stack deployed first; REPO_URL must be public).
data-aws:
	@test -n "$(REPO_URL)" || (echo "set REPO_URL=https://github.com/<you>/<repo>.git" && exit 1)
	aws cloudformation deploy --region us-east-1 --stack-name $(STACK)-build --template-file infra/build-job.yaml \
	  --capabilities CAPABILITY_IAM --parameter-overrides RepoUrl=$(REPO_URL) Snapshot=$(SNAPSHOT) \
	  DataBucketName=$$(aws cloudformation describe-stacks --region us-east-1 --stack-name $(STACK) --query "Stacks[0].Outputs[?OutputKey=='DataBucketName'].OutputValue" --output text) \
	  DistributionId=$$(aws cloudformation describe-stacks --region us-east-1 --stack-name $(STACK) --query "Stacks[0].Outputs[?OutputKey=='DistributionId'].OutputValue" --output text)
	@echo "Follow progress: aws logs tail /wildscope/prod/build-job --follow --region us-east-1"

publish:
	$(PY) -m pipeline.wildscope.build publish --bucket $$(cat .build/data_bucket) --distribution $$(cat .build/distribution_id)

deploy:
	PY=$(PY) bash scripts/deploy.sh

test:
	$(PY) -m unittest discover -s lambda/tests

lint:
	$(PY) -m pyflakes pipeline/wildscope lambda
	$(PY) -c "import sys; from cfnlint.runner import main; sys.argv=['cfn-lint','infra/wildscope.yaml','infra/build-job.yaml']; main()"
	$(PY) scripts/check_csp.py
	cd web && npm run lint && npm run typecheck

check: lint test
	cd web && npm run build

dev:
	cd web && npm run dev

preview:
	cd web && npm run build && npm run preview

clean-data:
	rm -rf pipeline/work pipeline/out
