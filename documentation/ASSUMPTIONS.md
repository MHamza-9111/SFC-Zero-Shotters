# DineIQ Analytics - Cleaning Decisions

## Raw Data Preservation
Original files in `raw_data/` are preserved and are not overwritten.

## Missing Values
Missing customer email and order payment-method values are retained as
blank rather than guessed. They are logged as documented quality cases.

## Duplicate Records
Duplicate primary-key records are quarantined; the first occurrence is
retained. Business-duplicate order lines (exact repeat of every field in the
same order) are detected and logged but retained, because a real business
duplicate is a review case, not a data error.

## Invalid Transactions
Invalid order-item quantities (zero) and invalid financial values (negative)
are quarantined rather than silently corrected. Price-outlier lines are kept
for analysis and surfaced through anomaly detection.

## Order Totals
Order totals that no longer match their line totals (a generated edge case)
are preserved and logged for review; the cleaning stage never rewrites
transaction totals.

## Foreign-Key and Relationship Rules
Records that break a documented relationship are quarantined:

- order items referencing unknown orders or menu items
- order items whose menu item belongs to a different restaurant than the
  order (prevents location-level misattribution)
- orders with unknown customer / restaurant / promotion references
- orders dated outside the analysis period (their lines and ratings are
  then quarantined by the same FK rules)
- ratings that are not from the order's customer, or that rate an item that
  is not in the order
- inventory / wastage rows whose item is not owned by the restaurant

## Promotion Consistency
Promotion references are normalized to clean integer strings (empty when
absent). A promotion that is not active for the order date/restaurant is
documented in the cleaning log; the order itself is kept because the
transaction is still valid.

## Ratings
Ratings outside the expected 1-5 range are treated as data-quality issues
and quarantined.

## Inventory and Order Totals
Inventory arithmetic inconsistencies and order-total mismatches are
identified and documented rather than silently rewriting the source values.

## Quarantine
Problematic records are kept separately (one file per dataset, appended
across runs of the same output) so the original information is preserved
and the analytical datasets remain suitable for processing.

## Overall Principle
Cleaning decisions prioritize transparency, reproducibility, and
preservation of source information. Every removal or quarantine is recorded
in `cleaning_log.csv` with the affected row count and reason.
