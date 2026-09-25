# SRS Clarifications

Log of clarifications received from the instructor about the SRS.
Each entry is dated and linked to the SRS section it affects.

## 2026-09-24 - NFR #1 "Performance" (section 1.7, page 34)

**SRS text:**
> "The application should process uploaded claim details and generate
> predictions from both models within five seconds under normal
> operating conditions."

**Problem identified:** "uploaded claim details" is not restaurant
domain language (it is template text carried over from another
project), so the measurable target of the requirement was ambiguous.

**Instructor clarification (2026-09-24):**
The requirement is about **ensemble learning**: when new data is
uploaded, the application must generate predictions from **both
models** - the Spark MLlib model and the independent Python model -
and return the ensemble result **within five seconds**.

**Design implications (agreed interpretation):**

1. Final predictions are an ensemble of the two pipeline models
   (e.g., average the probability outputs, then classify), not a
   single model's output.
2. Model artifacts are trained, saved, and versioned ahead of time;
   the upload flow must **load and score only, never retrain**.
3. Scoring runs in a warm process. A cold JVM/SparkContext start per
   request is not acceptable against the 5-second budget.
4. A performance test must measure end-to-end latency of
   upload -> both models -> ensemble result on a standard batch
   (e.g., 100 records) and assert it is below 5 seconds. The
   measured value is reported in the intelligence report as
   evidence that NFR #1 is met.

**Owners:**

- Hamza: Spark model artifact, ensemble integration, performance test
- Ali Jaan: Python model artifact (ready in
  `data_cleaning/dual_pipeline/` and the Python pipeline)
- Farooq / Zain: upload + prediction UI screen
- Eshmaal: record in the development log
