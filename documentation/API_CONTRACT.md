# DineIQ API contract

The Flask API is mounted at `/api/v1`. Responses are JSON except CSV exports. Dashboard charts are rendered as responsive inline SVG from these live JSON endpoints; the browser does not embed raster chart files. Protected requests use the signed-in browser session. The default app configuration requires authentication; `/api/v1/status`, `/api/v1/auth/signup`, `/api/v1/auth/login`, and `/api/v1/auth/me` are the public/session bootstrap endpoints. Mutating requests require the session CSRF token in `X-CSRF-Token`; the browser client obtains it from `GET /api/v1/auth/csrf`.

Authorization failures use `{"error": "…", "message": "…"}`. Unsupported API methods, missing routes, oversized request bodies, validation errors, missing model artifacts, and conflicts return the corresponding 4xx/5xx status rather than a success-shaped payload.

## Authentication and access

| Method and path | Access | Purpose |
|---|---|---|
| `POST /auth/signup` | Public | Create a Data Analyst account; accepts first/last name, email, password (12+ characters), and brand. Public signup cannot select a role. |
| `POST /auth/login` | Public | Start an authenticated session. |
| `POST /auth/logout` | Signed in + CSRF | End the session. |
| `GET /auth/me` | Public | Return the signed-in user or 401. |
| `GET /auth/csrf` | Signed in | Return the session CSRF token. |
| `GET /auth/users` | Administrator | List workspace accounts. |
| `PATCH /auth/users/{email}/role` | Administrator + CSRF | Change a role. The final Administrator cannot be demoted. |
| `GET /audit?limit=100` | Administrator | Read the latest account, prediction, export, data-change, and reload events (maximum 500). |

Roles are `Data Analyst`, `Restaurant Manager`, `Regional Manager`, and `Administrator`. All signed-in roles can read dashboard and operational data. Data mutations, user administration, audit access, and pipeline reload require Administrator privileges.

The initial Administrator is optional and bootstrapped only when `DINEIQ_BOOTSTRAP_ADMIN_EMAIL` and a `DINEIQ_BOOTSTRAP_ADMIN_PASSWORD` of at least 12 characters are set and no Administrator already exists.

## Dashboard and platform reads

| Method and path | Purpose |
|---|---|
| `GET /status`, `GET /pipeline/status`, `GET /models`, `GET /predict/tasks` | Read readiness, pipeline evidence, model metadata, and supported scoring tasks. |
| `GET /dashboard/meta`, `/overview`, `/revenue-series`, `/orders`, `/orders/{id}`, `/dishes`, `/menu-intelligence`, `/inventory`, `/customers`, `/promotions`, `/payments`, `/transactions`, `/locations`, `/peak-hours`, `/alerts`, `/search`, `/recommendations`, `/reports` | Dashboard data and analytics. Date, location, range, search, page, limit, and task filters are accepted where applicable by the route. |
| `GET /dashboard/market-basket`, `/pricing`, `/forecast`, `/anomalies`, `/scenarios` | Dedicated SRS analytical evidence. Forecast supports a bounded `horizon`; pricing supports `q`. |
| `POST /dashboard/what-if` | Calculate an evidence-based scenario estimate. Body accepts scenario, change percentage, optional menu item, and optional wastage amount. The response includes baseline, estimate, impact, and assumptions. |
| `GET /dashboard/export?dataset=orders` | Download an allowlisted dataset as CSV. Exports are audited. |
| `POST /dashboard/reload` | Reload pipeline artifacts; Administrator only. |
| `GET /analytics/menu-classes`, `/analytics/recommendations` | Legacy JSON analytics views. Static chart image serving has been removed; use `/dashboard/reports` and the JSON analytics endpoints for live charts. |

Analytics are read from the pipeline's processed CSV and evidence artifacts. The separate operational SQLite store is not currently wired to recompute or replace those analytical snapshots after CRUD changes.

## Model scoring

`POST /predict/order-value`, `POST /predict/churn`, and `POST /predict/ensemble` accept a JSON object containing a non-empty `records` array. The task registry from `GET /predict/tasks` is the source of truth for each task's required feature names, label, and batch limit. Request-time model training is not performed. Artifacts are loaded and cached when the Flask app starts; unavailable required artifacts return `503 MODELS_UNAVAILABLE`.

The scorer returns task/model versions, engine metadata, measured request latency, per-record predictions, and available model probabilities. When both independent models are available, binary positive-class probabilities and aligned multiclass probabilities are averaged. A degraded single-model response is marked with the participating model; required dual-model tasks return an unavailable error when either side is missing.

Example request:

```json
{
  "task": "high_value_order",
  "records": [{
    "order_hour": 18,
    "day_of_week_code": 2,
    "order_month": 7,
    "is_weekend": 0,
    "is_promo_order": 1,
    "channel_code": 1,
    "payment_code": 2,
    "basket_size": 4,
    "basket_quantity": 6,
    "avg_unit_price": 1520.5,
    "discount_rate_percentage": 3.1,
    "total_orders": 12,
    "total_spend": 54000.0
  }]
}
```

Common scoring errors include `INVALID_RECORDS`, `BATCH_TOO_LARGE`, `MODELS_UNAVAILABLE`, and `INTERNAL_ERROR`. Numeric inputs must be finite and the batch size must fit the selected task limit.

## Operational data CRUD

`GET /admin/data/resources` returns each resource's fields and validation metadata. The supported resources are `locations`, `restaurants`, `menu_categories`, `menu_items`, `pricing_history`, `customers`, `promotions`, `orders`, `order_items`, `ratings`, `inventory`, and `wastage`.

| Method and path | Purpose |
|---|---|
| `GET /admin/data/{resource}?page=1&page_size=25&q=…` | Paginated records (page size 1–100). Search is limited to the configured resource fields. |
| `GET /admin/data/{resource}/{record_id}` | Read one record. |
| `POST /admin/data/{resource}` | Create a validated record (Administrator + CSRF). |
| `PATCH /admin/data/{resource}/{record_id}` | Update supplied fields (Administrator + CSRF). |
| `DELETE /admin/data/{resource}/{record_id}` | Delete a record if no protected foreign-key relationship prevents it (Administrator + CSRF). |

Foreign keys, uniqueness, allowed order states, non-negative values, date ranges, and rating bounds are checked in SQLite. The customer resource contains only pseudonymous operational attributes. Failed validation returns `400 INVALID_RECORD`; unknown resources/records return `404 NOT_FOUND`; key or relationship conflicts return `409 CONFLICT`.

The account database and operational data database are separate files. Configure `DINEIQ_AUTH_DB` and `DINEIQ_DATA_DB` to persistent storage and back them up before production use.
