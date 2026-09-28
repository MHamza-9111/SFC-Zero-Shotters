# Frontend Replacement — Functionality Mapping

Internal mapping created during the master frontend replacement. Every existing
backend capability has a home in the new UI. Prototype-only concepts with no
backend counterpart are explicitly NOT implemented (see section 3).

## 1. Old functionality → New UI → API / service

| Old view / feature | New UI (template) | API / backend function |
|---|---|---|
| `view-overview` KPIs, revenue chart, pulse, categories, recent orders, dishes, areas, payments, transactions, quick links | `pages/overview.html` + `static/js/overview.js` | `GET /dashboard/overview`, `/dashboard/revenue-series`, `/dashboard/orders`, `/dashboard/dishes`, `/dashboard/payments`, `/dashboard/transactions`, `/dashboard/locations`, `/dashboard/meta` |
| `view-orders` register, filters, pager, row detail | `pages/orders.html` + `pages.js` | `GET /dashboard/orders`, `GET /dashboard/orders/<id>`, `GET /dashboard/export?dataset=orders` |
| `view-menu` dishes + classes + basket preview | `pages/menu.html` | `GET /dashboard/dishes`, `GET /dashboard/menu-intelligence`, `GET /analytics/menu-classes` |
| `view-inventory` wastage | `pages/inventory.html` | `GET /dashboard/inventory` |
| `view-customers` register + charts | `pages/customers.html` | `GET /dashboard/customers` |
| `view-promotions` | `pages/promotions.html` | `GET /dashboard/promotions` |
| `view-payments` + transactions register | `pages/payments.html` | `GET /dashboard/payments`, `GET /dashboard/transactions` |
| `view-reports` + CSV export | `pages/reports.html` | `GET /dashboard/reports`, `GET /dashboard/export?dataset=…` |
| `view-locations` + peak chart | `pages/locations.html` | `GET /dashboard/locations`, `GET /dashboard/peak-hours` |
| `view-models` scorer, dual pipeline, latency, registry | `pages/models.html` | `GET /predict/tasks`, `POST /predict/ensemble|order-value|churn`, `GET /models`, `GET /pipeline/status`, `GET /status` |
| `view-settings` status, theme, sources, reload | `pages/settings.html` | `GET /status`, `GET /dashboard/meta`, `POST /dashboard/reload` (admin) |
| `view-basket` | `pages/basket.html` | `GET /dashboard/market-basket` |
| `view-price` | `pages/price.html` | `GET /dashboard/pricing` |
| `view-forecast` | `pages/forecast.html` | `GET /dashboard/forecast` |
| `view-peak` | `pages/peak.html` | `GET /dashboard/peak-hours` |
| `view-anomalies` + alerts feed | `pages/anomalies.html` | `GET /dashboard/anomalies`, `GET /dashboard/alerts` |
| `view-whatif` simulator | `pages/whatif.html` | `POST /dashboard/what-if`, `GET /dashboard/scenarios` |
| `view-recommendations` | `pages/recommendations.html` | `GET /dashboard/recommendations`, `GET /analytics/recommendations` |
| `view-quality` pipeline telemetry | `pages/quality.html` | `GET /pipeline/status`, `GET /status`, `GET /dashboard/meta` |
| `view-channels` | `pages/channels.html` | `GET /dashboard/channels` |
| `view-team` role admin | `pages/team.html` | `GET /auth/users`, `PATCH /auth/users/<email>/role` |
| *(no UI before)* audit log | `pages/team.html` (Audit trail card) | `GET /audit` (admin) |
| `view-billing` usage | `pages/billing.html` | `GET /dashboard/meta` (data_sources) |
| `view-data` CRUD | `pages/data.html` | `GET/POST/PATCH/DELETE /admin/data/<resource>[/<id>]`, `GET /admin/data/resources` |
| Header global search | `components/header.html` | `GET /dashboard/search` (debounced) |
| Location scope selector | `components/sidebar.html` branch selector | `GET /dashboard/meta` → `DQ.state.locationId` passed to all scoped calls |
| Business date picker | overview date controls | `GET /dashboard/overview?date=`, `revenue-series?date=` |
| Header alerts dropdown | `components/header.html` | `GET /dashboard/alerts` |
| Sidebar system status card | `components/sidebar.html` | `GET /status` |
| Auth (login/register) | `auth.html` + `auth.js` | `POST /auth/login`, `POST /auth/signup`, `GET /auth/me`, `POST /auth/logout` |
| Command palette (Ctrl+K) | `components/modals.html` | client navigation + `/dashboard/search` |

## 2. Prototype page → real page

| Prototype page | Implemented as | Notes |
|---|---|---|
| Landing | `landing.html` | stats sourced from public `GET /status` + `GET /health` only; no demo mode |
| Executive Dashboard | `pages/overview.html` | real KPIs/charts; prototype insights become real data notes |
| Menu Intelligence | `pages/menu.html` | quadrant/classes/registers from real analytics |
| Customer Intelligence | `pages/customers.html` | real RFM/risk register; 3-D scatter NOT implemented (mock segments) |
| Market Basket | `pages/basket.html` | real association pairs |
| Price Intelligence | `pages/price.html` | real sensitivity CSV |
| Promotions | `pages/promotions.html` | real campaign register |
| Wastage Analytics | `pages/inventory.html` | real inventory intelligence; yearly client-side predictor NOT implemented (simulated model) |
| Demand Forecast | `pages/forecast.html` | real forecast + evaluation |
| Peak Periods | `pages/peak.html` | real peak-hours data |
| Locations | `pages/locations.html` | real location summary |
| Anomaly Center | `pages/anomalies.html` | real anomalies + alerts |
| Spark vs Python (dual) | `pages/models.html` | real `pipeline/status` agreement, registry, latency |
| What-If Simulator | `pages/whatif.html` | real `POST /dashboard/what-if` |
| Recommendations | `pages/recommendations.html` | real recommendations |
| Data Quality | `pages/quality.html` | real pipeline telemetry |
| Team & Roles | `pages/team.html` | real `auth/users` + role PATCH + `audit` |
| Settings | `pages/settings.html` | real status/meta/reload + persisted theme |

## 3. Prototype-only features deliberately NOT implemented (no backend)

- Demo mode / demo credentials / simulated login (`doLogin`, `doSignup`).
- Spark "ingestion" overlay, fake pipeline steps/log, `fakeRefresh`, `searchDemo`.
- "Reset demo data", `dropData`, factory-reset, danger-zone demo actions.
- Client-side yearly wastage "predictor" (arbitrary local elasticity model).
- Three.js 3-D scenes (hero food orbit, RFM scatter) — CDN + mock segments.
- Simulated notifications/invites/API-key rotation/SSO/export toasts.
- Hard-coded ticker insights, landing counters, notification badge counts.
- Signup role picker (backend assigns `Data Analyst`).

## 4. Removals

- `static/js/dashboard.js` — orphaned legacy script (referenced by no template).
- `templates/index.html` — replaced by `templates/app.html` + `templates/pages/*`.
- Old single-file CSS — replaced by `static/css/{styles,components,pages,responsive}.css`.

## 5. Build outcome notes (2026-09-28 session)

### Architecture as shipped
- `templates/base.html` ← `templates/app.html` (shell: sidebar/header/{% include pages %}/overlays)
  ← 23 × `templates/pages/*.html` (verbatim view blocks, balanced-`<section>` extraction from the
  retired single-file `index.html`).
- Public `/` serves `landing.html` when logged out (`AUTH_REQUIRED`); logged-in `/` serves the app shell.
- `auth.html` drives login/register via `body[data-auth-mode]`/`data-next`; `404.html` for unknown slugs.
- CSP `script-src 'self'` — zero inline scripts; theme boot handled by `static/js/theme-boot.js`.
- Audit trail card added to `pages/team.html` (`#audit-tbody` + `GET /audit`, admin-only inline message).

### Runtime artifacts restored in this environment
- All `*.joblib` model files and `processed_data/analytics/order_items_integrated.csv` were committed as
  Git-LFS pointers but the LFS storage host is unreachable from this sandbox (and `git-lfs` is not installable).
  They were regenerated with the repository's own pipeline code instead:
  - `python_pipeline/processing/process_dineiq_data.py` → real `order_items_integrated.csv` (order line items).
  - `python_pipeline/model_artifacts.py` → `models/python/<task>/v{next}` (self-verified: 30/30 committed
    predictions reproduced exactly).
  - `python -m spark_jobs.run_all --engine pandas --skip ingest sql compare latency` → `models/<task>/v7`
    (documented pandas fallback; no JVM required).
  - All other tracked data files were `git checkout`-restored; regenerated files remain intentionally
    uncommitted (pointers stay in git history).
- Result: `GET /api/v1/status` → `OPERATIONAL`, ensemble predictions run both engines (big_data v7 +
  python v13/v12), NFR `nfr_pass: true`, order detail line items populated.

### Test-suite adjustments (both failure classes proven pre-existing at HEAD)
- `test_pages_render`: asserted `theme-segment` (a settings-view-only control in the split layout) on
  every page — valid only for the retired single-file SPA. Now asserts `theme-toggle` on every app page
  and `theme-segment` only for `/settings`.
- `test_predict_churn_and_menu_class`: records still contained `recency_days` / target-defining menu
  fields that were removed from the feature contracts by the documented leakage fix
  (`AUDIT_PHASE2_FINDINGS.md`). Records updated to the published contracts.
- Final: `pytest tests/python` → **87 passed**.

### Verified over real HTTP (waitress, port 5000)
- Anonymous `/` → landing 200; `/login` `/register` 200; protected pages 302 → login; unknown slug 404
  (signed-in) / 302 (signed-out).
- Login → CSRF → `meta`, `orders`, `what-if`, `export` (93 KB CSV) → logout → `me` 401.
- Order detail line items: 10 real lines with item names/revenue (regenerated integrated CSV).
- All 23 page routes, all 14 static assets, `/health`, `/api/v1/status` → 200. CSP + `nosniff` headers set.
