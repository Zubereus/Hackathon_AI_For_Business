.PHONY: data test dev
data:
	cd data/synthetic && python make_synthetic_data_v2.py && python check_elasticity_v2.py out
test:
	cd ml-py && pytest -q
	cd engine-go && go test ./...
	cd web && npm test --silent
dev:
	@echo "run in 3 terminals: (ml-py) uvicorn app.main:app --port 8000 | (engine-go) go run ./cmd/engine | (web) npm run dev"
