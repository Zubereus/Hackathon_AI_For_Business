# Data

## Synthetic Vietnamese retail datasets

`synthetic/` contains generated sample data from the included `make_synthetic_data_v2.py` script. These files are simulations, not records from real companies or shoppers.

Each `synthetic/out/<dataset>/` folder includes:

- `sales_synthetic_vn.csv`: sales input for ingestion, elasticity fitting, and simulation.
- `ground_truth.csv`: known product elasticities for offline evaluation. Never use this as a model input.
- `ground_truth_daily.csv`: generated uncensored demand and event details for audits; not a model input.
- `elasticity_check_v2.csv`: generated model-recovery benchmark results.
- `config.json`: parameters used to generate the dataset.

Datasets cover a starter shop, fashion, grocery, electronics, a larger marketplace, low price variation, and event-confounded pricing. The last two are deliberately difficult cases that should produce warnings or less reliable estimates.

`synthetic/out/messy_variants/` contains five sales CSVs with varied headers, formats, and transaction granularity for testing the column mapper. Their adjacent `mapping_truth.json` files document the expected mappings.

The frontend makes only sales and messy-variant CSVs selectable. Ground-truth and benchmark files are retained for evaluation and are never uploaded automatically.
