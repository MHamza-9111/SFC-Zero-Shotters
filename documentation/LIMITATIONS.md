# DineIQ Analytics — Assumptions & Scope Limitations

This document outlines key technical assumptions, business rule decisions, and system limitations.

---

## 1. Business & Accounting Assumptions

1. **Completed Orders Rule**: All financial analytics (revenue, profit, average order value) include **COMPLETED** orders only. Cancelled orders are preserved in quarantine for cancellation analysis but never added to revenue figures.
2. **Menu Business Classification Rules**: Menu items are categorized using median splits (Profit Driver, Volume Driver, Hidden Opportunity, Low Performer).
3. **Co-Location Market-Basket Lift**: Lift is calculated within individual restaurant branches rather than across all chain orders to eliminate co-location artifacts.

---

## 2. Technical Scope Limitations

1. **Synthetic Data**: Primary datasets are generated synthetically using relationship-preserving distribution rules.
2. **PySpark Local Execution Mode**: Default PySpark jobs execute using `local[*]` standalone cluster configuration.
3. **Model Serving**: Online scoring runs on pre-trained versioned artifacts. Retraining occurs asynchronously via pipeline triggers.
