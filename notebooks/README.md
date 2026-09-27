# Pipeline notebooks

These notebooks demonstrate the generator and Python analytics stages using the code in `data_generator/` and `python_pipeline/`.

| Notebook | Purpose |
|---|---|
| `01_data_generation.ipynb` | Generate raw relational datasets and inspect their relationships. |
| `02_data_quality_check.ipynb` | Assess missing values, duplicates, invalid values, and logical checks. |
| `03_cleaning_and_quarantine.ipynb` | Clean inputs, validate relationships, and inspect quarantined rows. |
| `04_processing_and_integration.ipynb` | Integrate processed datasets and calculate core analytics. |
| `05_advanced_analytics_and_ml.ipynb` | Explore menu classes, customer segments, baskets, forecasts, wastage, pricing, promotions, anomalies, recommendations, what-if results, and comparison sets. |

Each notebook starts with `MODE = "quick"` or `MODE = "full"`. Quick mode uses a medium generated dataset under `notebooks/outputs/quick/`; full mode uses the repository paths `raw_data/`, `processed_data/`, `reports/`, and `python_pipeline/dual_pipeline/`. Review `config/data_generation_config.yaml` before running full-scale generation.

Install dependencies from the repository root with `python -m pip install -r requirements.txt`, then open `notebooks/` in Jupyter. Headless execution is available through `python -m jupyter nbconvert --to notebook --execute notebooks/<notebook>.ipynb`.
