# DineIQ Analytics - Jupyter Pipeline Notebooks

Interactive, step-by-step walkthrough of the Python data pipeline.
Each notebook runs the real pipeline code (imported from
`Ali Jaan/`), so what you see in the notebook is exactly what the
scripts produce.

## Notebooks

| # | Notebook | What it does |
| --- | --- | --- |
| 01 | `01_data_generation.ipynb` | Generates the raw datasets (SRS minimums), previews them, and verifies the relationship guarantees (restaurant consistency, promotion linkage, ratings in-order) |
| 02 | `02_data_quality_check.ipynb` | Pre-cleaning quality assessment: missing values, duplicates, invalid values, logical checks |
| 03 | `03_cleaning_and_quarantine.ipynb` | Cleaning + full FK validation + quarantine, then verifies zero orphans remain |
| 04 | `04_processing_and_integration.ipynb` | Joins the cleaned datasets, builds features, core analytics (completed-orders-only rule) |
| 05 | `05_advanced_analytics_and_ml.ipynb` | The SRS intelligence layer: RFM/KMeans, menu classes, market basket, forecasting vs baseline, wastage, elasticity, promotion traps, anomalies, slow movers, churn model, recommendations, what-if, and the dual-pipeline comparison sets |

## Two run modes

Every notebook starts with:

```python
MODE = "quick"   # or "full"
```

- **`quick`** (default): medium scale (~20k orders / 200k lines)
  written into `notebook/outputs/quick/`. Fast (~30 s per notebook)
  and never touches the repository's canonical data.
- **`full`**: full SRS scale (1M order lines) in the canonical
  locations (`Main/raw_data` → `Ali Jaan/processed_data` →
  `Ali Jaan/processed_data/analytics` →
  `Ali Jaan/data_cleaning/dual_pipeline`). Same outputs as
  `run_pipeline.py`.

Notebooks are **self-contained**: each one runs every step it depends
on, and skips a step whose outputs already exist. To force a rerun,
delete the corresponding output directory.

## Run

```bash
python -m venv .venv
.venv/bin/pip install -r Main/requirements.txt

# in Jupyter:
jupyter notebook notebook/
# or execute headless (writes outputs in place):
.venv/bin/jupyter nbconvert --to notebook --execute --inplace notebook/*.ipynb
```

## Outputs

- Quick-mode outputs: `notebook/outputs/` (git-ignored)
- Full-mode outputs: the canonical repository directories
  (large data is git-ignored; small reports and the dual-pipeline
  comparison sets are committed under `Ali Jaan/data_cleaning/`)
