# Dual-pipeline comparison and latency evidence

The comparison runner is `spark_jobs/dual_pipeline_compare.py`. It compares saved pipeline-side model outputs with independent Python predictions for the committed holdout cases in `python_pipeline/dual_pipeline/` and writes evidence under `reports/dual_pipeline/`.

## Recorded held-out comparison

`reports/dual_pipeline/dual_pipeline_summary.csv` records:

| Task | Cases | Agreement | Python accuracy | Pipeline accuracy |
|---|---:|---:|---:|---:|
| High-value order | 300 | 300/300 (100%) | 0.9867 | 0.9867 |
| Customer churn | 200 | 200/200 (100%) | 1.0000 | 1.0000 |
| Menu business class | 30 | 30/30 (100%) | 0.9667 | 0.9667 |

The recorded evidence uses pipeline artifacts v5 and Python artifacts v6 (high-value/churn) and v2 (menu class); it labels the pipeline engine `pandas`. Because feature-building and training rules are shared, agreement is evidence of parity on these holdout cases, not an independent proof of generalization or Spark runtime execution. Re-run the comparison after model retraining and inspect each per-case file for mismatches.

## Recorded warm scoring latency

`reports/latency/ensemble_latency_report.csv` records the latest persisted benchmark in this checkout:

| Task | Batch | Maximum | Limit | Recorded result |
|---|---:|---:|---:|---|
| High-value order | 100 | 148.700 ms max (119.357 ms mean) | 5,000 ms | Pass |
| Customer churn | 200 | 5.847 ms max (3.148 ms mean) | 5,000 ms | Pass |

These timings come from the recorded environment and model versions. Measure again on the deployment host; they are not a production SLO by themselves. The runtime API reports its measured request latency and the participating model versions.
