# Data and business assumptions

- Pipeline inputs and checked-in evaluation cases are synthetic. Results on them do not establish performance on a real restaurant network or competition hidden dataset.
- Financial sales summaries count completed orders. Cancelled and refunded orders remain available for non-revenue operational analysis.
- Menu business classes are generated from demand, profit and margin rules documented in the pipeline; the classifier learns those labels.
- Market-basket support, confidence and lift are measured within the restaurant to which the pair belongs, avoiding chain-level co-location inflation.
- Customer churn is defined by inactivity in the final observation window (a recency proxy). Its high synthetic evaluation score must not be read as validated real-world churn prediction.
- Forecast evaluation uses a chronological holdout and compares model error against the saved naive baseline. Performance can change with dataset and horizon.
- What-if estimates disclose their assumptions and are not causal estimates or guaranteed outcomes.
- Raw CSV inputs are retained separately from processed outputs. The operational SQLite store is separate from the analytical snapshots, so CRUD changes are not automatically reflected in dashboard analytics.
- A Python fallback is available when Spark cannot start. Pipeline evidence records which engine generated each artifact; only an artifact marked `spark` demonstrates a Spark execution.
